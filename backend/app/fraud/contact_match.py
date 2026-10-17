"""Contact comparison. Owner B."""

from app.contracts import Signal
from app.core.steps import case_fixture


class ContactMatchStep:
    name = "contact_match"
    writes = ()

    async def run(self, ctx: dict) -> None:
        for s in case_fixture(ctx)["signals"]:
            if s["id"] == "contact_match":
                ctx["signals"].append(Signal.model_validate(s))
