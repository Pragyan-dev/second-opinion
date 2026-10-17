"""Fraud likelihood scoring. Owner B."""

from app.core.steps import case_fixture


class ScoringStep:
    name = "scoring"
    writes = ("fraud_likelihood", "band", "band_reason")

    async def run(self, ctx: dict) -> None:
        report = case_fixture(ctx)
        for key in self.writes:
            ctx[key] = report[key]
