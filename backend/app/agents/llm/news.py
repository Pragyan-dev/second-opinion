"""News fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class NewsAgent:
    name = "news"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): load news for ctx["symbol"]; keep deterministic fixture mode.
        return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])
