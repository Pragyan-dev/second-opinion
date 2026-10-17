"""Deterministic poll-by-poll fixture streaming. Run on port 8001. Owner B."""

from uuid import uuid4

from fastapi import FastAPI, HTTPException

from app.config import configure_cors, fixture
from app.contracts import PageCapture, PaymentCheck, Report, StockXray
from app.main import (
    XrayRequest,
    bank_summary,
    health,
    payment_check,
    payment_execute,
)

app = FastAPI(title="Second Opinion — streaming mock")
configure_cors(app)
jobs: dict[str, dict] = {}


def snapshot(id: str, kind: str):
    key = f"{kind}:{id}"
    job = jobs.get(key)
    if id == "demo" and job is None:
        job = {"kind": kind, "calls": 0}
        jobs[key] = job
    if job is None or job["kind"] != kind:
        raise HTTPException(404, "Job not found")
    job["calls"] += 1
    data = fixture("report_demo.json" if kind == "report" else "xray_demo.json")
    data["report_id" if kind == "report" else "xray_id"] = id
    if kind == "report":
        data["page_url"] = job.get("url", data["page_url"])
        data["signals"] = data["signals"][: job["calls"]]
        total = len(fixture("report_demo.json")["signals"])
        if job["calls"] <= total:
            for key in ("band", "band_reason", "explanation"):
                data[key] = None
    else:
        data["symbol"] = job.get("symbol", data["symbol"])
        total = len(data["sections"])
        data["sections"] = dict(list(data["sections"].items())[: job["calls"]])
        if job["calls"] <= total:
            data["summary"], data["questions"] = None, []
    data["status"] = "done" if job["calls"] > total else "running"
    return data


app.get("/health")(health)


@app.post("/v1/analyze", status_code=202)
def analyze(body: PageCapture):
    id = uuid4().hex
    jobs[f"report:{id}"] = {"kind": "report", "calls": 0, "url": body.url}
    return {"report_id": id, "status": "pending"}


@app.get("/v1/reports/{id}", response_model=Report)
def report(id: str):
    return snapshot(id, "report")


@app.post("/v1/xray", status_code=202)
def create_xray(body: XrayRequest):
    id = uuid4().hex
    jobs[f"xray:{id}"] = {"kind": "xray", "calls": 0, "symbol": body.symbol.upper()}
    return {"xray_id": id, "status": "pending"}


@app.get("/v1/xray/{id}", response_model=StockXray)
def xray(id: str):
    return snapshot(id, "xray")


app.get("/v1/bank/{customer_id}/summary")(bank_summary)
app.post("/v1/payments/check", response_model=PaymentCheck)(payment_check)
app.post("/v1/payments/execute")(payment_execute)

# TODO(B): replace in-memory poll counters with a mock clock if demos need replay controls.
