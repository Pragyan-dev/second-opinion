"""Site visit fixture stub. Owner B."""

from app.config import fixture
from app.contracts import AgentResult, SiteVisit
from app.fraud.extract import fixture_name


class CrawlAgent:
    name = "crawl"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(B): fetch the first non-social capture link using httpx, with a Playwright
        # fallback. Visit up to 5 same-domain pages: home, about, contact, disclosures.
        # Collect claimed firm, CRD, phones, emails, and final URL after redirects.
        visit = SiteVisit.model_validate(fixture(fixture_name(ctx))["site_visit"])
        return AgentResult(agent=self.name, status="done", data={"site_visit": visit.model_dump()})
