"""Fixture agent stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class RedFlagsAgent:
    name = "red_flags"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): fetch red_flags data for ctx["symbol"]; retain fixture fallback.
        return AgentResult.model_validate(fixture("xray_demo.json")["sections"][self.name])
