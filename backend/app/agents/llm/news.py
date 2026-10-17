"""Fixture agent stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class NewsAgent:
    name = "news"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): fetch news data for ctx["symbol"]; retain fixture fallback.
        return AgentResult.model_validate(fixture("xray_demo.json")["sections"][self.name])
