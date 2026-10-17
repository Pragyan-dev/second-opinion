"""Pressure language scoring. Owner B."""

from app.contracts import JevScore
from app.core.steps import case_fixture


class JevStep:
    name = "jev"
    writes = ("jev_scores",)

    async def run(self, ctx: dict) -> None:
        ctx["jev_scores"] = [JevScore.model_validate(s) for s in case_fixture(ctx)["jev_scores"]]
