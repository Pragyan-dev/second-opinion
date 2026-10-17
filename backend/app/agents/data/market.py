"""Market fixture stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class MarketAgent:
    name = "market"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): load market for ctx["symbol"]; keep deterministic fixture mode.
        return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])
