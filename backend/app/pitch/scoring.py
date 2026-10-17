"""Pitch scoring fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class ScoringAgent:
    name = "scoring"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement scoring against the captured page; use fixtures until ready.
        report = fixture("report_demo.json")
        data = {"signals": [report["signals"][i] for i in []]}
        data["band"] = report["band"]
        return AgentResult(agent=self.name, status="done", data=data)
