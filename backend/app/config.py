"""Environment configuration and read-only demo fixtures. Owner B."""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
FIXTURES = ROOT / "contracts" / "fixtures"


class Settings:
    def __init__(self):
        self.llm_api_key = os.getenv("LLM_API_KEY", "")
        self.llm_model = os.getenv("LLM_MODEL", "")
        self.jev_api_key = os.getenv("JEV_API_KEY", "")
        self.nessie_api_key = os.getenv("NESSIE_API_KEY", "")
        self.news_api_key = os.getenv("NEWS_API_KEY", "")
        self.robinhood_mcp_url = os.getenv("ROBINHOOD_MCP_URL", "")
        self.search_provider = os.getenv("SEARCH_PROVIDER", "")
        self.search_api_key = os.getenv("SEARCH_API_KEY", "")
        self.sec_user_agent = os.getenv("SEC_USER_AGENT", "")
        self.use_fixtures = os.getenv("USE_FIXTURES", "1") != "0" or not all(
            (self.llm_api_key, self.jev_api_key, self.news_api_key, self.sec_user_agent)
        )
        self.funding_offline = os.getenv("BANK_OFFLINE", "0") == "1" or not self.nessie_api_key
        self.database = Path(os.getenv("DATABASE_PATH", str(ROOT / "jobs.sqlite")))


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
