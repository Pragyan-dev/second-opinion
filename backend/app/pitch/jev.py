"""Pitch jev fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class JevAgent:
    name = "jev"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement jev against the captured page; use fixtures until ready.
        report = fixture("report_demo.json")
        data = {"signals": [report["signals"][i] for i in [4, 5, 6, 7]]}

        return AgentResult(agent=self.name, status="done", data=data)
