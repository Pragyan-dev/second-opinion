"""Official record lookup. Owner B."""

from app.contracts import OfficialContact
from app.core.steps import case_fixture


class BrokercheckStep:
    name = "brokercheck"
    writes = ("official_contact",)

    async def run(self, ctx: dict) -> None:
        ctx["official_contact"] = OfficialContact.model_validate(
            case_fixture(ctx)["official_contact"]
        )
