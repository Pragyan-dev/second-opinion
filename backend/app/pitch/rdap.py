"""Pitch rdap fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class RdapAgent:
    name = "rdap"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement rdap against the captured page; use fixtures until ready.
        report = fixture("report_demo.json")
        data = {"signals": [report["signals"][i] for i in [3]]}

        return AgentResult(agent=self.name, status="done", data=data)
