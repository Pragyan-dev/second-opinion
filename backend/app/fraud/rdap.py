"""Domain age lookup. Owner B."""

from app.contracts import Signal
from app.core.steps import case_fixture


class RdapStep:
    name = "rdap"
    writes = ("site_visit",)

    async def run(self, ctx: dict) -> None:
        for s in case_fixture(ctx)["signals"]:
            if s["id"] == "domain_age":
                ctx["signals"].append(Signal.model_validate(s))
