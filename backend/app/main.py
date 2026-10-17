"""V2 routes only. Workflow implementation belongs in core/. Owner B."""

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException
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


app = FastAPI(title="Second Opinion v2 fixture scaffold")
configure_cors(app)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/fraud/analyze", status_code=202)
def analyze(body: Capture, background: BackgroundTasks):
    if len(body.text) > 20000:
        raise HTTPException(422, "Captured text must be at most 20,000 characters")
    job = orchestrator.create_fraud(body)
    background.add_task(orchestrator.run_fraud, job["report_id"], body)
    return job


@app.get("/v1/fraud/{id}", response_model=FraudReport)
def fraud(id: str):
    return orchestrator.get_job(id, "fraud")


@app.post("/v1/stock/research", status_code=202)
def research(body: StockRequest, background: BackgroundTasks):
    job = orchestrator.create_stock(body.symbol)
    background.add_task(orchestrator.run_stock, job["research_id"], body.symbol, body.source_url)
    return job


@app.get("/v1/stock/{id}", response_model=StockReport)
def stock(id: str):
    return orchestrator.get_job(id, "stock")


@app.post("/v1/purchase/preview", response_model=OrderPreview)
async def purchase_preview(body: OrderTicket):
    return await preview(body)


@app.post("/v1/purchase/fund", dependencies=[Depends(require_human_confirmation)])
def purchase_fund(body: FundingRequest):
    return fund(body)
