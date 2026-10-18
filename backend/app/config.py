"""Environment configuration and read-only demo fixtures. Owner B."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
FIXTURES = ROOT / "contracts" / "fixtures"


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _aliases(value: str) -> dict[str, str]:
    pairs = (item.split("=", 1) for item in _csv(value) if "=" in item)
    return {host.strip().lower(): target.strip().rstrip("/") for host, target in pairs}


class Settings:
    def __init__(self):
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.openrouter_model = os.getenv("OPENROUTER_MODEL", "")
        self.openrouter_referer = os.getenv(
            "OPENROUTER_REFERER", "https://github.com/Pragyan-dev/second-opinion"
        )
        # latency, throughput or price; empty uses OpenRouter's default routing.
        self.openrouter_provider_sort = os.getenv("OPENROUTER_PROVIDER_SORT", "latency")
        # Jev runs on OpenRouter's Decisions API, so the OpenRouter key works by default.
        self.jev_api_key = os.getenv("JEV_API_KEY", "") or self.openrouter_api_key
        self.jev_api_url = os.getenv("JEV_API_URL", "https://openrouter.ai/api/alpha/decisions")
        self.jev_model = os.getenv("JEV_MODEL", "typesafe/jev-1.14")
        self.nessie_api_key = os.getenv("NESSIE_API_KEY", "")
        self.news_api_key = os.getenv("NEWS_API_KEY", "")
        self.robinhood_mcp_url = os.getenv("ROBINHOOD_MCP_URL", "")
        self.search_provider = os.getenv("SEARCH_PROVIDER", "").strip().lower()
        self.search_api_key = os.getenv("SEARCH_API_KEY", "")
        self.sec_user_agent = os.getenv("SEC_USER_AGENT", "")
        self.use_fixtures = os.getenv("USE_FIXTURES", "0") != "0"
        self.fixture_agents = set(_csv(os.getenv("FIXTURE_AGENTS", "")))
        self.agent_timeout_s = float(os.getenv("AGENT_TIMEOUT_S", "8"))
        self.crawl_allow_hosts = set(
            _csv(os.getenv("CRAWL_ALLOW_HOSTS", "localhost:5500,127.0.0.1:5500"))
        )
        # Demo only: fetch a fictional host from a local server but report the fictional URL.
        self.crawl_host_aliases = _aliases(
            os.getenv("CRAWL_HOST_ALIASES", "brightwater-capital.example=http://127.0.0.1:5500")
        )
        # Watch-only live view of the agent's browser (needs the optional Playwright extra).
        self.live_view_enabled = os.getenv("LIVE_VIEW_ENABLED", "1") == "1"
        self.live_view_max_pages = int(os.getenv("LIVE_VIEW_MAX_PAGES", "5"))
        self.live_view_seconds_per_page = float(os.getenv("LIVE_VIEW_SECONDS_PER_PAGE", "6"))
        self.live_view_timeout_s = float(os.getenv("LIVE_VIEW_TIMEOUT_S", "45"))
        self.live_brokercheck = os.getenv("LIVE_BROKERCHECK", "1") == "1"
        # TODO(B): confirm this endpoint in the BrokerCheck site's browser network tab.
        self.brokercheck_search_url = os.getenv(
            "BROKERCHECK_SEARCH_URL", "https://api.brokercheck.finra.org/search/firm"
        )
        self.funding_offline = os.getenv("BANK_OFFLINE", "0") == "1" or not self.nessie_api_key
        self.database = Path(os.getenv("DATABASE_PATH", str(ROOT / "jobs.sqlite")))

    def use_fixture(self, agent: str) -> bool:
        """True when this agent must serve fixtures instead of calling its live service."""
        return self.use_fixtures or agent in self.fixture_agents


settings = Settings()


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def configure_cors(app):
    from fastapi.middleware.cors import CORSMiddleware

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_origin_regex=r"chrome-extension://[a-z]+",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
