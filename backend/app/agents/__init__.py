"""Registries: B owns workflow wiring; D owns independent data adapters."""

from app.agents.data.history import HistoryAgent
from app.agents.data.income import IncomeAgent
from app.agents.data.market import MarketAgent
from app.agents.data.red_flags import RedFlagsAgent
from app.agents.llm.explainer import ExplainerAgent
from app.agents.llm.news import NewsAgent
from app.fraud.brokercheck import BrokercheckAgent
from app.fraud.crawler import CrawlAgent
from app.fraud.extract import ExtractAgent
from app.fraud.jev import JevAgent
from app.fraud.rdap import RdapAgent
from app.fraud.scoring import ScoringAgent

FRAUD_STEPS = [
    ExtractAgent(),
    CrawlAgent(),
    BrokercheckAgent(),
    RdapAgent(),
    JevAgent(),
    ScoringAgent(),
    ExplainerAgent(),
]
STOCK_AGENTS = [MarketAgent(), HistoryAgent(), IncomeAgent(), RedFlagsAgent(), NewsAgent()]
