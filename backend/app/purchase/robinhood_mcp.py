"""Read and review Robinhood MCP client over streamable HTTP. Owner D."""

import json

import httpx

from app.config import settings

ALLOWED_TOOLS = frozenset(
    {
        "get_equity_quotes",
        "get_equity_tradability",
        "get_portfolio",
        "review_equity_order",
        "search",
    }
)
# TODO(D): verify these exact names against the live MCP tool list before integration.

_PROTOCOL = "2025-03-26"


def guard_tool(name: str) -> None:
    if not isinstance(name, str) or name.startswith(
        ("place_", "cancel_", "exercise_", "submit_", "execute_", "replace_")
    ):
        raise ValueError("Trading tools are forbidden")
    if name not in ALLOWED_TOOLS:
        raise ValueError("Tool is outside the read and review allowlist")


class RobinhoodUnavailable(RuntimeError):
    pass


class RobinhoodClient:
    def __init__(self) -> None:
        self._session_id: str | None = None
        self._initialized = False
        self._next_id = 1

    async def call_tool(self, name: str, arguments: dict) -> dict:
        guard_tool(name)
        url = settings.robinhood_mcp_url.strip()
        token = _bearer(settings.robinhood_mcp_token)
        if not url or not token:
            raise RobinhoodUnavailable("Robinhood MCP URL or token is not configured")

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                if not self._initialized:
                    await self._initialize(client, url, token)
                result = await self._rpc(
                    client,
                    url,
                    token,
                    "tools/call",
                    {"name": name, "arguments": _arguments(name, arguments)},
                )
        except RobinhoodUnavailable:
            raise
        except Exception as exc:
            raise RobinhoodUnavailable("Robinhood MCP request failed") from exc

        if not isinstance(result, dict):
            raise RobinhoodUnavailable("Robinhood MCP returned an unreadable result")
        if result.get("isError"):
            raise RobinhoodUnavailable("Robinhood MCP tool error")
        return _present(name, _tool_payload(result))

    async def _initialize(self, client: httpx.AsyncClient, url: str, token: str) -> None:
        await self._rpc(
            client,
            url,
            token,
            "initialize",
            {
                "protocolVersion": _PROTOCOL,
                "capabilities": {},
                "clientInfo": {"name": "second-opinion", "version": "0.1.0"},
            },
        )
        await self._post(
            client,
            url,
            token,
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            expect_body=False,
        )
        self._initialized = True

    async def _rpc(
        self,
        client: httpx.AsyncClient,
        url: str,
        token: str,
        method: str,
        params: dict,
    ) -> dict:
        message = await self._post(
            client,
            url,
            token,
            {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params},
        )
        self._next_id += 1
        if not isinstance(message, dict):
            raise RobinhoodUnavailable("Robinhood MCP returned an empty response")
        error = message.get("error")
        if isinstance(error, dict):
            raise RobinhoodUnavailable(str(error.get("message") or "Robinhood MCP error"))
        result = message.get("result")
        if not isinstance(result, dict):
            raise RobinhoodUnavailable("Robinhood MCP returned an unreadable result")
        return result

    async def _post(
        self,
        client: httpx.AsyncClient,
        url: str,
        token: str,
        payload: dict,
        *,
        expect_body: bool = True,
    ) -> dict | None:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": _PROTOCOL,
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        response = await client.post(url, json=payload, headers=headers)
        session_id = response.headers.get("mcp-session-id")
        if session_id:
            self._session_id = session_id
        if response.status_code >= 400:
            raise RobinhoodUnavailable(f"Robinhood MCP HTTP {response.status_code}")
        if not expect_body or not response.content:
            return None
        return _parse_message(response)


def _bearer(token: str) -> str:
    value = token.strip()
    if value.lower().startswith("bearer "):
        return value[7:].strip()
    return value


def _arguments(name: str, arguments: dict) -> dict:
    args = dict(arguments or {})
    if name in {"get_equity_quotes", "get_equity_tradability"} and "symbols" not in args:
        symbol = args.pop("symbol", None)
        if symbol:
            args["symbols"] = [symbol]
    return args


def _parse_message(response: httpx.Response) -> dict:
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        for line in response.text.splitlines():
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data:
                continue
            message = json.loads(data)
            if isinstance(message, dict) and ("result" in message or "error" in message):
                return message
        raise RobinhoodUnavailable("Robinhood MCP returned an empty event stream")
    message = response.json()
    if not isinstance(message, dict):
        raise RobinhoodUnavailable("Robinhood MCP returned an unreadable result")
    return message


def _tool_payload(result: dict) -> dict:
    structured = result.get("structuredContent")
    if isinstance(structured, dict):
        data = structured.get("data", structured)
        if isinstance(data, dict):
            return data
    for item in result.get("content") or []:
        if not isinstance(item, dict) or item.get("type") != "text":
            continue
        try:
            parsed = json.loads(item.get("text") or "")
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            data = parsed.get("data", parsed)
            if isinstance(data, dict):
                return data
    return result


def _present(name: str, data: dict) -> dict:
    if name == "get_equity_quotes":
        results = data.get("results") or []
        quote = results[0].get("quote") if results and isinstance(results[0], dict) else None
        if isinstance(quote, dict):
            return {**quote, "results": results}
    if name == "get_equity_tradability":
        results = data.get("results") or []
        row = results[0] if results and isinstance(results[0], dict) else None
        if isinstance(row, dict):
            return {**row, "is_tradable": row.get("tradeable")}
    if name == "get_portfolio":
        buying_power = data.get("buying_power")
        if isinstance(buying_power, dict) and "buying_power" in buying_power:
            return {**data, "buying_power": buying_power["buying_power"]}
    return data
