"""Website visit. Owner B."""

from app.contracts import SiteVisit
from app.core.steps import case_fixture


class CrawlStep:
    name = "crawl"
    writes = ("site_visit",)

    async def run(self, ctx: dict) -> None:
        ctx["site_visit"] = SiteVisit.model_validate(case_fixture(ctx)["site_visit"])
        ctx["crawl_ok"] = True
