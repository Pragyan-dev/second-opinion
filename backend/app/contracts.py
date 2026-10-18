from typing import Literal, Optional
from pydantic import BaseModel

Status = Literal["pending", "running", "done", "error"]
Check = Literal["pass", "warn", "fail", "unknown"]
Band = Literal["low", "elevated", "high", "cant_tell"]
SourceType = Literal["website", "email", "social_post", "stock_page"]

class Capture(BaseModel):
    source_type: SourceType
    url: str
    title: str
    text: str                        # max 20,000 chars
    sender: Optional[str] = None     # email From line or X handle as shown on screen
    links: list[str] = []
    emails: list[str] = []
    phones: list[str] = []
    tickers: list[str] = []
    email_title: Optional[str] = None   # email subject; when set, used instead of title
    email_body: Optional[str] = None    # plain-text body, links as "text <url>"; max 20,000 chars

class Source(BaseModel):
    title: str
    url: str

class Signal(BaseModel):
    id: str
    label: str
    check: Check
    detail: str
    source: Optional[Source] = None
    weight: int = 0

class JevScore(BaseModel):
    flag: str
    label: str
    confidence: float                # 0 to 1
    evidence: str

class SiteVisit(BaseModel):
    start_url: str
    final_url: str
    pages_visited: list[str]
    claimed_firm: Optional[str] = None
    claimed_crd: Optional[str] = None
    phones: list[str] = []
    emails: list[str] = []
    domain_age_days: Optional[int] = None

class OfficialContact(BaseModel):
    firm: str
    crd: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    source: Source

class ProCon(BaseModel):
    text: str
    source: Optional[Source] = None

class PhishingReason(BaseModel):
    id: str
    label: str
    detail: str
    evidence: str = ""               # quoted verbatim from the email, or empty
    weight: int = 1                  # 1 minor, 2 notable, 3 strong

class PhishingCheck(BaseModel):
    email_title: str
    sender: Optional[str] = None
    link_requested: Optional[str] = None   # the link the email asks the reader to open
    summary: str
    reasons: list[PhishingReason] = []

class PageCheck(BaseModel):
    url: str                          # the page as finally loaded, after redirects
    title: str = ""
    claimed_firm: Optional[str] = None
    summary: str
    reasons: list[PhishingReason] = []   # warning signs, evidence quoted verbatim from the page
    sensitive_fields: list[str] = []     # what the page's forms ask for, e.g. "card number"
    matches_message: list[Signal] = []   # the page's firm and contacts against the message's

class FraudReport(BaseModel):
    report_id: str
    status: Status
    source_type: SourceType
    page_url: str
    entities: dict[str, list[str]]
    site_visit: Optional[SiteVisit] = None
    phishing: Optional[PhishingCheck] = None  # emails only
    page: Optional[PageCheck] = None          # the linked page, when one was visited
    signals: list[Signal] = []
    jev_scores: list[JevScore] = []
    fraud_likelihood: Optional[int] = None   # 0 to 100, None when evidence is too thin
    band: Optional[Band] = None
    band_reason: Optional[str] = None
    explanation: Optional[str] = None
    official_contact: Optional[OfficialContact] = None
    stock_pros: list[ProCon] = []
    stock_cons: list[ProCon] = []
    stock_research_id: Optional[str] = None

class AgentResult(BaseModel):
    agent: str
    status: Status
    data: dict = {}
    sources: list[Source] = []
    error: Optional[str] = None

class Article(BaseModel):
    title: str
    url: str
    outlet: str
    published: str
    summary: str
    relevance: float
    is_press_release: bool

class StockReport(BaseModel):
    research_id: str
    symbol: str
    asset_type: Literal["stock", "etf", "unknown"]
    status: Status
    sections: dict[str, AgentResult]
    summary: Optional[str] = None
    articles: list[Article] = []
    pros: list[ProCon] = []
    cons: list[ProCon] = []
    questions: list[str] = []

class OrderTicket(BaseModel):
    symbol: str
    side: Literal["buy"] = "buy"
    quantity: float
    order_type: Literal["market", "limit"]
    limit_price: Optional[float] = None
    time_in_force: Literal["gfd", "gtc"] = "gfd"
    research_id: Optional[str] = None

class OrderPreview(BaseModel):
    symbol: str
    name: str
    last_price: float
    est_total: float
    tradable: Optional[bool] = None
    buying_power_ok: Optional[bool] = None
    warnings: list[str] = []
    data_source: Literal["robinhood_mcp", "cached", "simulated"]
    status: Literal["awaiting_human"] = "awaiting_human"

class FundingRequest(BaseModel):
    customer_id: str
    from_account_id: str
    to_account_id: str
    amount: float
    human_confirmed: bool
