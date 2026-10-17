"""Route smoke coverage for both API implementations and the parallel pipeline."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app import main, mock
from app.config import fixture, settings
from app.contracts import AgentResult, PaymentCheck, Report, StockXray
from app.core import orchestrator


@pytest.fixture(params=[main.app, mock.app], ids=["real", "mock"])
def client(request, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "test.sqlite")
    mock.jobs.clear()
    with TestClient(request.param) as client:
        yield client


@pytest.fixture
def payment():
    return {
        "customer_id": "demo",
        "from_account_id": "checking-demo",
        "payee_account_id": "brightwater-demo",
        "payee_name": "Brightwater demo",
        "amount": 5000,
        "report_id": "demo",
    }


def finish(client, route):
    snapshots = []
    for _ in range(15):
        response = client.get(route)
        assert response.status_code == 200
        snapshots.append(response.json())
        if snapshots[-1]["status"] == "done":
            return snapshots
    pytest.fail("Job never completed")


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_analyze(client):
    response = client.post(
        "/v1/analyze", json={"url": "http://localhost:5500", "title": "Demo", "text": "$BRWT"}
    )
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
    assert response.json()["report_id"]


def test_report(client):
    job = client.post(
        "/v1/analyze", json={"url": "http://localhost:5500", "title": "Demo", "text": "$BRWT"}
    ).json()
    snapshots = finish(client, f"/v1/reports/{job['report_id']}")
    report = Report.model_validate(snapshots[-1])
    assert report.band == "high" and len(report.signals) == 8
    if client.app is mock.app:
        assert [len(x["signals"]) for x in snapshots] == [1, 2, 3, 4, 5, 6, 7, 8, 8]
        assert all(x["band"] is None for x in snapshots[:-1])


def test_create_xray(client):
    response = client.post("/v1/xray", json={"symbol": "BRWT"})
    assert response.status_code == 202 and response.json()["xray_id"]


def test_xray(client):
    job = client.post("/v1/xray", json={"symbol": "BRWT"}).json()
    snapshots = finish(client, f"/v1/xray/{job['xray_id']}")
    xray = StockXray.model_validate(snapshots[-1])
    assert xray.symbol == "BRWT" and set(xray.sections) == {"market", "income", "red_flags", "news"}
    if client.app is mock.app:
        assert [len(x["sections"]) for x in snapshots] == [1, 2, 3, 4, 4]


def test_reserved_demo_ids(client):
    Report.model_validate(finish(client, "/v1/reports/demo")[-1])
    StockXray.model_validate(finish(client, "/v1/xray/demo")[-1])


def test_bank_summary(client):
    response = client.get("/v1/bank/demo/summary")
    assert response.status_code == 200
    assert len(response.json()["accounts"]) == 2
    assert len(response.json()["transactions"]) == 30


def test_payment_check(client, payment):
    response = client.post("/v1/payments/check", json=payment)
    assert response.status_code == 200
    result = PaymentCheck.model_validate(response.json())
    assert result.hold_recommended and result.level == "stop"


def test_payment_execute(client, payment):
    assert client.post("/v1/payments/execute", json=payment).status_code == 409
    response = client.post("/v1/payments/execute", json={**payment, "override_hold": True})
    assert response.status_code == 200 and response.json()["transfer_id"].startswith("mock-")


def test_validation_and_missing_job(client, payment):
    assert client.get("/v1/reports/does-not-exist").status_code == 404
    assert client.get("/v1/xray/does-not-exist").status_code == 404
    assert client.post("/v1/analyze", json={}).status_code == 422
    assert client.post("/v1/xray", json={"symbol": ""}).status_code == 422
    assert client.post("/v1/payments/check", json={**payment, "amount": -1}).status_code == 422


@pytest.mark.parametrize("origin", ["http://localhost:3000", "chrome-extension://abcdef"])
def test_cors(client, origin):
    response = client.options(
        "/v1/analyze",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.headers["access-control-allow-origin"] == origin


def test_fixture_consistency():
    report = Report.model_validate(fixture("report_demo.json"))
    assert report.official_contact.model_dump() == fixture("brokercheck/brightwater.json")
    assert (
        PaymentCheck.model_validate(fixture("payment_demo.json")).linked_report == report.report_id
    )
    StockXray.model_validate(fixture("xray_demo.json"))


def test_parallel_timeout_and_incremental_persistence(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    monkeypatch.setattr(orchestrator, "AGENT_TIMEOUT", 0.02)
    job = orchestrator.create_xray("BRWT")

    class Fast:
        name = "fast"

        async def run(self, ctx):
            return AgentResult(agent=self.name, status="done", data={"price": 1})

    class Slow:
        name = "slow"

        async def run(self, ctx):
            await asyncio.sleep(0.005)
            snapshot = orchestrator.store().get(job["xray_id"], "xray")
            assert snapshot["sections"]["fast"]["status"] == "done"
            await asyncio.sleep(1)

    asyncio.run(orchestrator.run_agents(job["xray_id"], "xray", [Fast(), Slow()], {}))
    result = orchestrator.get_job(job["xray_id"], "xray")
    assert result["status"] == "error"
    assert result["sections"]["slow"]["error"] == "timeout"
    stored_agent = orchestrator.store().get(f'{job["xray_id"]}:slow', "agent")
    assert stored_agent["status"] == "error" and stored_agent["error"] == "timeout"
