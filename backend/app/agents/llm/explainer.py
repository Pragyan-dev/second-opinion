"""Plain-language explanation stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class ExplainerAgent:
    name = "explainer"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): generate a sourced explanation without buy/sell advice.
        return AgentResult(
            agent=self.name,
            status="done",
            data={"explanation": fixture("report_demo.json")["explanation"]},
        )
