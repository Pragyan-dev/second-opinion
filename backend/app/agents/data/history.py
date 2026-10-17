"""History fixture stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class HistoryAgent:
    name = "history"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): load history for ctx["symbol"]; keep deterministic fixture mode.
        return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])
