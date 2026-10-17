"""Read and review client stub. No network transport is implemented. Owner D."""

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


def guard_tool(name: str) -> None:
    if not isinstance(name, str) or name.startswith(("place_", "cancel_", "exercise_")):
        raise ValueError("Trading tools are forbidden")
    if name not in ALLOWED_TOOLS:
        raise ValueError("Tool is outside the read and review allowlist")


class RobinhoodUnavailable(RuntimeError):
    pass


class RobinhoodClient:
    async def call_tool(self, name: str, arguments: dict) -> dict:
        guard_tool(name)  # Validate before any future network transport.
        # TODO(D): connect an authenticated read and review transport with this guard.
        raise RobinhoodUnavailable("Robinhood is unavailable in this fixture-only scaffold")
