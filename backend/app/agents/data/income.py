"""Income fixture stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class IncomeAgent:
    name = "income"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): load income for ctx["symbol"]; keep deterministic fixture mode.
        return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])
