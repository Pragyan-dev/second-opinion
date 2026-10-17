"""Fraud scoring fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult
from app.fraud.extract import fixture_name


class ScoringAgent:
    name = "scoring"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): implement scoring with cached evidence; retain fixture fallback.
        report = fixture(fixture_name(ctx))
        data = {"signals": [s for s in report["signals"] if s["id"] in []]}
        data.update(
            {
                key: report[key]
                for key in [
                    "fraud_likelihood",
                    "band",
                    "band_reason",
                    "stock_pros",
                    "stock_cons",
                    "stock_research_id",
                ]
            }
        )
        return AgentResult(agent=self.name, status="done", data=data)
