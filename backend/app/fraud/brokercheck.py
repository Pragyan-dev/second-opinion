"""Fraud brokercheck fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult
from app.fraud.extract import fixture_name


class BrokercheckAgent:
    name = "brokercheck"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement brokercheck with cached evidence; retain fixture fallback.
        report = fixture(fixture_name(ctx))
        data = {
            "signals": [s for s in report["signals"] if s["id"] in ["firm_record", "contact_match"]]
        }
        data.update({key: report[key] for key in ["official_contact"]})
        return AgentResult(agent=self.name, status="done", data=data)
