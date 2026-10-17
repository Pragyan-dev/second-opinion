"""Robinhood MCP read-and-review client. Owner D.

Transport: HTTP POST to the Robinhood MCP endpoint (JSON-RPC 2.0 envelope).
Auth: Bearer token via ROBINHOOD_MCP_TOKEN env var (OAuth session token from
      Cursor or a manually extracted token). Without a token the client raises
      RobinhoodUnavailable and preview.py falls back to simulated yfinance data.

Hard rules (never remove):
  - guard_tool() blocks all trading tool names before any network call.
  - ALLOWED_TOOLS is the exclusive read-and-review allowlist; anything outside
    it is rejected regardless of what the server exposes.
"""

import os

ROBINHOOD_MCP_ENDPOINT = "https://agent.robinhood.com/mcp/trading"

ALLOWED_TOOLS = frozenset(
    {
        "get_equity_quotes",
        "get_equity_tradability",
        "get_portfolio",
        "review_equity_order",
        "search",
    }
)

_FORBIDDEN_PREFIXES = (
    "place_",
    "cancel_",
    "exercise_",
    "submit_",
    "execute_",
    "replace_",
)


def guard_tool(name: str) -> None:
    if not isinstance(name, str) or name.startswith(_FORBIDDEN_PREFIXES):
        raise ValueError("Trading tools are forbidden")
    if name not in ALLOWED_TOOLS:
        raise ValueError("Tool is outside the read and review allowlist")


class RobinhoodUnavailable(RuntimeError):
    pass


class RobinhoodClient:
    """Async MCP client. Calls are read/review only — guard_tool() enforces this."""

    def __init__(self) -> None:
        self._token: str = os.getenv("ROBINHOOD_MCP_TOKEN", "")
        self._url: str = os.getenv("ROBINHOOD_MCP_URL", ROBINHOOD_MCP_ENDPOINT)

    async def call_tool(self, name: str, arguments: dict) -> dict:
        guard_tool(name)  # Must stay before any network call.

        if not self._token:
            raise RobinhoodUnavailable(
                "ROBINHOOD_MCP_TOKEN is not set — falling back to simulated data"
            )

        return await self._post(name, arguments)

    async def _post(self, name: str, arguments: dict) -> dict:
        import httpx

        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments},
        }
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(self._url, json=payload, headers=headers)
        except Exception as exc:
            raise RobinhoodUnavailable(f"Network error reaching Robinhood MCP: {exc}") from exc

        if resp.status_code == 401:
            raise RobinhoodUnavailable("Robinhood MCP token invalid or expired (401)")
        if resp.status_code != 200:
            raise RobinhoodUnavailable(
                f"Robinhood MCP returned {resp.status_code}: {resp.text[:200]}"
            )

        body = resp.json()
        if "error" in body:
            raise RobinhoodUnavailable(f"Robinhood MCP error: {body['error']}")

        return body.get("result", {})
