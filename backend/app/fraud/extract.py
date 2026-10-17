"""Entity extraction. Owner B."""

from app.core.steps import case_fixture


def fixture_name(capture: dict) -> str:
    content = capture.get("text", "") + " " + " ".join(capture.get("links", []))
    return "fraud_clone.json" if "brightwater" in content.lower() else "fraud_real.json"


class ExtractStep:
    name = "extract"
    writes = ("entities",)

    async def run(self, ctx: dict) -> None:
        ctx["entities"] = case_fixture(ctx)["entities"]
