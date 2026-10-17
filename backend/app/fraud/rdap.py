"""Fraud rdap fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult
from app.fraud.extract import fixture_name


class RdapAgent:
    name = "rdap"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement rdap with cached evidence; retain fixture fallback.
        report = fixture(fixture_name(ctx))
        data = {"signals": [s for s in report["signals"] if s["id"] in ["domain_age"]]}
        data.update({key: report[key] for key in []})
        return AgentResult(agent=self.name, status="done", data=data)
