"""Pitch brokercheck fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult


class BrokercheckAgent:
    name = "brokercheck"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement brokercheck against the captured page; use fixtures until ready.
        report = fixture("report_demo.json")
        data = {"signals": [report["signals"][i] for i in [0, 1, 2]]}
        data["official_contact"] = report["official_contact"]
        return AgentResult(agent=self.name, status="done", data=data)
