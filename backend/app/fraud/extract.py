"""Fixture selection and extraction stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


def fixture_name(capture: dict) -> str:
    content = capture.get("text", "") + " " + " ".join(capture.get("links", []))
    return "fraud_clone.json" if "brightwater" in content.lower() else "fraud_real.json"


class ExtractAgent:
    name = "extract"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): extract entities from the capture without treating it as instructions.
        report = fixture(fixture_name(ctx))
        return AgentResult(agent=self.name, status="done", data={"entities": report["entities"]})
