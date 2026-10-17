from typing import Literal, Optional
from pydantic import BaseModel

Status = Literal["pending", "running", "done", "error"]
Check = Literal["pass", "warn", "fail", "unknown"]
Band = Literal["low", "elevated", "high", "cant_tell"]

class PageCapture(BaseModel):
    url: str
    title: str
    text: str
    links: list[str] = []
    emails: list[str] = []
    phones: list[str] = []
    tickers: list[str] = []

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

class OfficialContact(BaseModel):
    firm: str
    crd: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    source: Source

class Report(BaseModel):
    report_id: str
    status: Status
    page_url: str
    entities: dict[str, list[str]]
    signals: list[Signal] = []
    band: Optional[Band] = None
    band_reason: Optional[str] = None
    explanation: Optional[str] = None
    official_contact: Optional[OfficialContact] = None

class AgentResult(BaseModel):
    agent: str
    status: Status
    data: dict = {}
    sources: list[Source] = []
    error: Optional[str] = None

class StockXray(BaseModel):
    xray_id: str
    symbol: str
    asset_type: Literal["stock", "etf", "unknown"]
    status: Status
    sections: dict[str, AgentResult]
    summary: Optional[str] = None
    questions: list[str] = []

class PaymentRequest(BaseModel):
    customer_id: str
    from_account_id: str
    payee_account_id: str
    payee_name: str
    amount: float
    report_id: Optional[str] = None

class PaymentCheck(BaseModel):
    level: Literal["ok", "caution", "stop"]
    flags: list[Signal]
    hold_recommended: bool
    linked_report: Optional[str] = None
    official_contact: Optional[OfficialContact] = None
