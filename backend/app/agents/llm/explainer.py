"""Plain-language explanation fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult
from app.fraud.extract import fixture_name


class ExplainerAgent:
    name = "explainer"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): explain sourced evidence without buy or sell advice.
        return AgentResult(
            agent=self.name,
            status="done",
            data={"explanation": fixture(fixture_name(ctx))["explanation"]},
        )
