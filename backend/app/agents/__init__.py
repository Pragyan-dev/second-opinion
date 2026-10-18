"""Registries: B owns workflow wiring; D owns independent data adapters."""

from app.agents.data.history import HistoryAgent
from app.agents.data.income import IncomeAgent
from app.agents.data.market import MarketAgent
from app.agents.data.red_flags import RedFlagsAgent
from app.agents.llm.explainer import ExplainerStep
from app.agents.llm.news import NewsAgent
from app.fraud.brokercheck import BrokercheckStep
from app.fraud.contact_match import ContactMatchStep
from app.fraud.crawler import CrawlStep
from app.fraud.extract import ExtractStep
from app.fraud.jev import JevStep
from app.fraud.live_browser import LiveBrowseStep
from app.fraud.phishing import PhishingStep
from app.fraud.rdap import RdapStep
from app.fraud.scoring import ScoringStep

# Each inner list runs in parallel; lists run in order.
FRAUD_STAGES = [
    # PhishingStep picks the link the email asks the reader to open, so it runs before the crawl.
    [ExtractStep(), PhishingStep()],
    [CrawlStep()],
    [BrokercheckStep(), RdapStep(), JevStep(), LiveBrowseStep()],
    [ContactMatchStep()],
    [ScoringStep()],
    [ExplainerStep()],
]
STOCK_AGENTS = [MarketAgent(), HistoryAgent(), IncomeAgent(), RedFlagsAgent(), NewsAgent()]
