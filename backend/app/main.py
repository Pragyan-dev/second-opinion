"""Routes only. Pipeline implementation belongs in core/. Owner B."""

from fastapi import BackgroundTasks, FastAPI
from pydantic import BaseModel, Field

from app.bank.nessie import summary
from app.bank.payment_rules import PaymentExecution, check, execute
from app.config import configure_cors
from app.contracts import PageCapture, PaymentCheck, PaymentRequest, Report, StockXray
from app.core import orchestrator


class XrayRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12, pattern=r"^[A-Za-z][A-Za-z0-9.-]*$")


app = FastAPI(title="Second Opinion — fixture scaffold")
configure_cors(app)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/analyze", status_code=202)
def analyze(body: PageCapture, background: BackgroundTasks):
    job = orchestrator.create_report(body)
    background.add_task(orchestrator.run_report, job["report_id"], body)
    return job


@app.get("/v1/reports/{id}", response_model=Report)
def report(id: str):
    return orchestrator.get_job(id, "report")


@app.post("/v1/xray", status_code=202)
def create_xray(body: XrayRequest, background: BackgroundTasks):
    job = orchestrator.create_xray(body.symbol)
    background.add_task(orchestrator.run_xray, job["xray_id"], body.symbol)
    return job


@app.get("/v1/xray/{id}", response_model=StockXray)
def xray(id: str):
    return orchestrator.get_job(id, "xray")


@app.get("/v1/bank/{customer_id}/summary")
def bank_summary(customer_id: str):
    return summary(customer_id)


@app.post("/v1/payments/check", response_model=PaymentCheck)
def payment_check(body: PaymentRequest):
    return check(body)


@app.post("/v1/payments/execute")
def payment_execute(body: PaymentExecution):
    return execute(body)
