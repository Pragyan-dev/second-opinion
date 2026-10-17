"""Fraud jev fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult
from app.fraud.extract import fixture_name


class JevAgent:
    name = "jev"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement jev with cached evidence; retain fixture fallback.
        report = fixture(fixture_name(ctx))
        data = {
            "signals": [
                s
                for s in report["signals"]
                if s["id"] in ["guaranteed_returns", "urgency", "whatsapp"]
            ]
        }
        data.update({key: report[key] for key in ["jev_scores"]})
        return AgentResult(agent=self.name, status="done", data=data)
