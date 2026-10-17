"""Fixture agent stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class MarketAgent:
    name = "market"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): fetch market data for ctx["symbol"]; retain fixture fallback.
        return AgentResult.model_validate(fixture("xray_demo.json")["sections"][self.name])
