"""V2 route coverage, fixture validation, sequencing, and incremental persistence."""

import html
import json
import re
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main, mock
from app.config import FIXTURES, fixture, settings
from app.contracts import (
    Capture,
    FraudReport,
    OfficialContact,
    OrderPreview,
    StockReport,
)

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(params=[main.app, mock.app], ids=["real", "mock"])
def client(request, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    mock.jobs.clear()
    with TestClient(request.param) as client:
        yield client


def finish(client, path):
    snapshots = []
    for _ in range(100):
        if snapshots and client.app is main.app:
            time.sleep(0.05)
        response = client.get(path)
        assert response.status_code == 200
        snapshots.append(response.json())
        if snapshots[-1]["status"] == "done":
            return snapshots
        assert snapshots[-1]["status"] != "error", snapshots[-1]
    pytest.fail("Job never completed")


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


@pytest.mark.parametrize(
    "capture_file,band", [("x_post_troweprice.json", "low"), ("email_brightwater.json", "high")]
)
def test_fraud_routes(client, capture_file, band):
    capture = fixture(f"captures/{capture_file}")
    response = client.post("/v1/fraud/analyze", json=capture)
    assert response.status_code == 202 and response.json()["status"] == "pending"
    snapshots = finish(client, f"/v1/fraud/{response.json()['report_id']}")
    report = FraudReport.model_validate(snapshots[-1])
    assert report.band == band and report.source_type == capture["source_type"]
    assert report.page_url == capture["url"] and report.site_visit
    if client.app is mock.app:
        assert [len(x["signals"]) for x in snapshots] == list(range(1, len(report.signals) + 1)) + [
            len(report.signals)
        ]
        assert all(x["fraud_likelihood"] is None for x in snapshots[:-1])


def test_clone_selected_from_link(client):
    capture = fixture("captures/x_post_troweprice.json")
    capture["links"] = ["https://brightwater-capital.example/"]
    job = client.post("/v1/fraud/analyze", json=capture).json()
    assert finish(client, f"/v1/fraud/{job['report_id']}")[-1]["band"] == "high"


def test_stock_routes(client):
    response = client.post(
        "/v1/stock/research", json={"symbol": "BRWT", "source_url": "https://example.com/stock"}
    )
    assert response.status_code == 202 and response.json()["status"] == "pending"
    snapshots = finish(client, f"/v1/stock/{response.json()['research_id']}")
    report = StockReport.model_validate(snapshots[-1])
    assert report.symbol == "BRWT" and set(report.sections) == {
        "market",
        "history",
        "income",
        "red_flags",
        "news",
    }
    assert len(report.articles) >= 6 and report.pros and report.cons
    if client.app is mock.app:
        assert [len(x["sections"]) for x in snapshots] == [1, 2, 3, 4, 5, 5]
        assert all(not x["articles"] for x in snapshots[:-1])


def test_preview_route(client):
    response = client.post(
        "/v1/purchase/preview", json={"symbol": "BRWT", "quantity": 10, "order_type": "market"}
    )
    assert response.status_code == 200
    result = OrderPreview.model_validate(response.json())
    assert result.status == "awaiting_human" and result.data_source == "simulated"
    assert result.est_total == 8.4
    limit = client.post(
        "/v1/purchase/preview",
        json={"symbol": "BRWT", "quantity": 5, "order_type": "limit", "limit_price": 0.8},
    )
    assert limit.status_code == 200 and limit.json()["est_total"] == 4


def test_confirmed_funding_route(client):
    response = client.post(
        "/v1/purchase/fund",
        json={
            "customer_id": "demo",
            "from_account_id": "checking-demo",
            "to_account_id": "investment-demo",
            "amount": 8.4,
            "human_confirmed": True,
        },
    )
    assert response.status_code == 200 and response.json()["transfer_id"]


def test_invalid_input_and_missing_jobs(client):
    assert client.get("/v1/fraud/missing").status_code == 404
    assert client.get("/v1/stock/missing").status_code == 404
    assert client.post("/v1/fraud/analyze", json={}).status_code == 422
    capture = fixture("captures/email_brightwater.json")
    assert (
        client.post("/v1/fraud/analyze", json={**capture, "text": "a" * 20001}).status_code == 422
    )
    assert client.post("/v1/stock/research", json={"symbol": ""}).status_code == 422
    for body in [
        {"symbol": "BRWT", "quantity": -1, "order_type": "market"},
        {"symbol": "BRWT", "quantity": 1, "order_type": "limit"},
        {"symbol": "BRWT", "quantity": 1, "order_type": "market", "side": "sell"},
    ]:
        assert client.post("/v1/purchase/preview", json=body).status_code == 422


@pytest.mark.parametrize("origin", ["http://localhost:3000", "chrome-extension://abcdef"])
def test_cors(client, origin):
    response = client.options(
        "/v1/fraud/analyze",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.headers["access-control-allow-origin"] == origin


def test_same_route_contracts():
    expected = {
        "/health",
        "/v1/fraud/analyze",
        "/v1/fraud/{id}",
        "/v1/stock/research",
        "/v1/stock/{id}",
        "/v1/purchase/preview",
        "/v1/purchase/fund",
    }
    assert set(main.app.openapi()["paths"]) == set(mock.app.openapi()["paths"]) == expected


def test_all_json_fixtures_validate():
    models = {
        "fraud_real.json": FraudReport,
        "fraud_clone.json": FraudReport,
        "stock_demo.json": StockReport,
        "preview_demo.json": OrderPreview,
    }
    found = set()
    for path in FIXTURES.rglob("*.json"):
        relative = path.relative_to(FIXTURES).as_posix()
        data = json.loads(path.read_text())
        found.add(relative)
        if relative.startswith("nessie/") or relative.startswith("robinhood/"):
            continue
        if relative.startswith("rdap/"):
            assert any(e["eventAction"] == "registration" for e in data["events"]), relative
            continue
        model = (
            Capture
            if relative.startswith("captures/")
            else OfficialContact
            if relative.startswith("brokercheck/")
            else models[relative]
        )
        model.model_validate(data)
    assert len(found) >= 12
    assert set(models) <= found


def test_fixture_evidence_and_history():
    clone = FraudReport.model_validate(fixture("fraud_clone.json"))
    real = FraudReport.model_validate(fixture("fraud_real.json"))
    assert clone.official_contact.model_dump() == fixture("brokercheck/brightwater.json")
    assert clone.band == "high" and 85 <= clone.fraud_likelihood <= 95
    assert clone.site_visit.domain_age_days < 90
    assert any(s.id == "contact_match" and s.check == "fail" for s in clone.signals)
    assert real.band == "low" and 0 <= real.fraud_likelihood <= 10
    assert all(score.confidence <= 0.2 for score in real.jev_scores)
    page = html.unescape(re.sub("<[^>]+>", " ", (ROOT / "demo-site/index.html").read_text()))
    page = " ".join(page.split())
    for score in clone.jev_scores:
        assert 0 <= score.confidence <= 1 and score.evidence in page
    history = fixture("stock_demo.json")["sections"]["history"]["data"]
    assert set(history) == {
        "prices_1y",
        "prices_5y",
        "high_52w",
        "low_52w",
        "return_1y",
        "return_5y",
        "max_drawdown_1y",
        "earnings_dates",
    }
    assert history["prices_1y"][-1]["close"] == fixture("preview_demo.json")["last_price"]
