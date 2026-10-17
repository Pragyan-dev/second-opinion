"""Registries: B owns wiring; D can replace data agents independently."""

from app.agents.data.income import IncomeAgent
from app.agents.data.market import MarketAgent
from app.agents.data.red_flags import RedFlagsAgent
from app.agents.llm.explainer import ExplainerAgent
from app.agents.llm.news import NewsAgent
from app.pitch.brokercheck import BrokercheckAgent
from app.pitch.extract import ExtractAgent
from app.pitch.jev import JevAgent
from app.pitch.rdap import RdapAgent
from app.pitch.scoring import ScoringAgent

STOCK_AGENTS = [MarketAgent(), IncomeAgent(), RedFlagsAgent(), NewsAgent()]
PITCH_AGENTS = [
    ExtractAgent(),
    BrokercheckAgent(),
    RdapAgent(),
    JevAgent(),
    ScoringAgent(),
    ExplainerAgent(),
]
