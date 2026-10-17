"""Pitch extract fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class ExtractAgent:
    name = "extract"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement extract against the captured page; use fixtures until ready.
        report = fixture("report_demo.json")
        data = {"signals": [report["signals"][i] for i in []]}
        data["entities"] = report["entities"]
        return AgentResult(agent=self.name, status="done", data=data)
