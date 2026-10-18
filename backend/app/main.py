"""V2 routes only. Workflow implementation belongs in core/. Owner B."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.config import configure_cors
from app.contracts import (
    Capture,
    FraudReport,
    FundingRequest,
    OrderPreview,
    OrderTicket,
    StockReport,
)
from app.core import orchestrator
from app.purchase.nessie import fund, require_human_confirmation
from app.purchase.preview import preview


class StockRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12, pattern=r"^[A-Za-z][A-Za-z0-9.-]*$")
    source_url: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await orchestrator.shutdown()


app = FastAPI(title="Second Opinion v2", lifespan=lifespan)
configure_cors(app)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/fraud/analyze", status_code=202)
async def analyze(body: Capture):
    if len(body.text) > 20000:
        raise HTTPException(422, "Captured text must be at most 20,000 characters")
    return {"report_id": await orchestrator.start_fraud_job(body), "status": "pending"}


@app.get("/v1/fraud/{id}", response_model=FraudReport)
async def fraud(id: str):
    report = await orchestrator.get_report(id, "fraud")
    if report is None:
        raise HTTPException(404, "Job not found")
    return report


@app.post("/v1/stock/research", status_code=202)
async def research(body: StockRequest):
    research_id = await orchestrator.start_stock_job(body.symbol, body.source_url)
    return {"research_id": research_id, "status": "pending"}


@app.get("/v1/stock/{id}", response_model=StockReport)
async def stock(id: str):
    report = await orchestrator.get_report(id, "stock")
    if report is None:
        raise HTTPException(404, "Job not found")
    return report


@app.post("/v1/purchase/preview", response_model=OrderPreview)
async def purchase_preview(body: OrderTicket):
    return await preview(body)


@app.post("/v1/purchase/fund", dependencies=[Depends(require_human_confirmation)])
def purchase_fund(body: FundingRequest):
    return fund(body)
