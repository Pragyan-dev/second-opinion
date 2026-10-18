"""Deterministic fixture streaming for the v2 routes. Owner B."""

from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException

from app.config import configure_cors, fixture
from app.contracts import Capture, FraudReport, OrderPreview, StockReport
from app.fraud.extract import fixture_name
from app.main import (
    StockRequest,
    health,
    live_preview,
    live_status,
    live_stream,
    purchase_fund,
    purchase_preview,
)
from app.purchase.nessie import require_human_confirmation

app = FastAPI(title="Second Opinion v2 streaming mock")
configure_cors(app)
jobs: dict[str, dict] = {}


def snapshot(id: str, kind: str):
    key = f"{kind}:{id}"
    if key not in jobs:
        if kind == "fraud" and id in {"demo", "real-demo", "clone-demo"}:
            jobs[key] = {
                "fixture": "fraud_real.json" if id == "real-demo" else "fraud_clone.json",
                "calls": 0,
            }
        elif kind == "stock" and id == "demo":
            jobs[key] = {"fixture": "stock_demo.json", "calls": 0}
        else:
            raise HTTPException(404, "Job not found")
    job = jobs[key]
    job["calls"] += 1
    data = fixture(job["fixture"])
    data["report_id" if kind == "fraud" else "research_id"] = id
    if kind == "fraud":
        data["page_url"] = job.get("url", data["page_url"])
        data["source_type"] = job.get("source_type", data["source_type"])
        total = len(data["signals"])
        data["signals"] = data["signals"][: job["calls"]]
        if job["calls"] <= total:
            for field in ("band", "band_reason", "explanation", "fraud_likelihood"):
                data[field] = None
    else:
        data["symbol"] = job.get("symbol", data["symbol"])
        total = len(data["sections"])
        data["sections"] = dict(list(data["sections"].items())[: job["calls"]])
        if job["calls"] <= total:
            data.update(summary=None, articles=[], pros=[], cons=[], questions=[])
    data["status"] = "done" if job["calls"] > total else "running"
    return data


app.get("/health")(health)


@app.post("/v1/fraud/analyze", status_code=202)
def analyze(body: Capture):
    if len(body.text) > 20000:
        raise HTTPException(422, "Captured text must be at most 20,000 characters")
    id = uuid4().hex
    jobs[f"fraud:{id}"] = {
        "fixture": fixture_name(body.model_dump()),
        "calls": 0,
        "url": body.url,
        "source_type": body.source_type,
    }
    return {"report_id": id, "status": "pending"}


@app.get("/v1/fraud/{id}", response_model=FraudReport)
def fraud(id: str):
    return snapshot(id, "fraud")


@app.post("/v1/stock/research", status_code=202)
def research(body: StockRequest):
    id = uuid4().hex
    jobs[f"stock:{id}"] = {"fixture": "stock_demo.json", "calls": 0, "symbol": body.symbol.upper()}
    return {"research_id": id, "status": "pending"}


@app.get("/v1/stock/{id}", response_model=StockReport)
def stock(id: str):
    return snapshot(id, "stock")


app.get("/v1/fraud/{id}/live.json")(live_status)
app.get("/v1/fraud/{id}/live.mjpg")(live_stream)
app.get("/v1/fraud/{id}/preview.jpg")(live_preview)
app.post("/v1/purchase/preview", response_model=OrderPreview)(purchase_preview)
app.post("/v1/purchase/fund", dependencies=[Depends(require_human_confirmation)])(purchase_fund)
