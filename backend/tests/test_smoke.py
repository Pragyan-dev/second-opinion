"""V2 route coverage, fixture validation, sequencing, and incremental persistence."""

import asyncio
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
    FundingRequest,
    OfficialContact,
    OrderPreview,
    OrderTicket,
    StockReport,
)
from app.purchase.nessie import fund
from app.purchase.preview import preview

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


def test_preview_uses_mock_quotes():
    apple = asyncio.run(preview(OrderTicket(symbol="AAPL", quantity=2, order_type="market")))
    assert apple.name == "Apple"
    assert apple.last_price == 227.50
    assert apple.est_total == 455.0
    assert apple.data_source == "simulated"
    assert apple.tradable is True

    meep = asyncio.run(preview(OrderTicket(symbol="MEEP", quantity=10, order_type="market")))
    assert meep.name == "Meep Meep Mining Co"
    assert meep.est_total == 4.2

    pickles = asyncio.run(preview(OrderTicket(symbol="QXZQ", quantity=1, order_type="market")))
    assert pickles.tradable is False

    unknown = asyncio.run(preview(OrderTicket(symbol="ZZZZ", quantity=1, order_type="market")))
    assert unknown.last_price == 10.0
    assert unknown.name == "ZZZZ simulated stock review"


@pytest.mark.parametrize(
    ("module_name", "cache_key", "payload"),
    [
        (
            "market",
            "market_AAPL",
            {
                "price": 10,
                "vol_30d": 1,
                "vol_90d": 2,
                "move_per_1000_usd": 1,
                "spy_move_per_1000_usd": 0.5,
                "max_drawdown_1y": -3,
                "volume_vs_30d": 1.2,
            },
        ),
        (
            "income",
            "income_AAPL",
            {
                "pays_dividend": True,
                "yield_ttm": 0.01,
                "frequency": "quarterly",
                "last_ex_date": "2026-01-01",
                "years_uninterrupted": 4,
                "price_return_1y": 0.1,
                "total_return_1y": 0.12,
            },
        ),
        (
            "red_flags",
            "red_flags_AAPL",
            {
                "exchange": "NASDAQ",
                "otc_tier": None,
                "caveat_emptor": False,
                "sec_suspension": False,
                "recent_name_change": False,
            },
        ),
        (
            "history",
            "history_AAPL",
            {
                "prices_1y": [],
                "prices_5y": [],
                "high_52w": 11,
                "low_52w": 8,
                "return_1y": 0.1,
                "return_5y": 0.4,
                "max_drawdown_1y": -0.2,
                "earnings_dates": [],
            },
        ),
    ],
)
def test_agents_offline_live_path(monkeypatch, tmp_path, module_name, cache_key, payload):
    import importlib

    from app.agents.data import _common

    monkeypatch.setattr(_common, "_CACHE_DIR", tmp_path)
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "fixture_agents", set())
    monkeypatch.setenv("DATA_OFFLINE", "1")
    _common._save_cache(cache_key, {**payload, "as_of": time.time() - 48 * 60 * 60})
    agent = importlib.import_module(f"app.agents.data.{module_name}")
    cls = next(
        obj
        for name, obj in agent.__dict__.items()
        if isinstance(obj, type) and name.endswith("Agent")
    )
    result = asyncio.run(cls().run({"symbol": "AAPL"}))
    assert result.status == "done"
    assert result.error and "cached copy" in result.error
    for field, value in payload.items():
        assert result.data[field] == value


def test_fund_parses_live_nessie_transfer(monkeypatch, tmp_path):
    import httpx

    from app.purchase import nessie

    class Response:
        status_code = 201
        text = ""

        def json(self):
            return {"objectCreated": {"_id": "transfer-live"}}

    monkeypatch.setattr(settings, "funding_offline", False)
    monkeypatch.setattr(settings, "nessie_api_key", "test-key")
    monkeypatch.setattr(nessie, "_FIXTURES_NESSIE", tmp_path)
    monkeypatch.setattr(httpx, "post", lambda *args, **kwargs: Response())
    result = fund(
        FundingRequest(
            customer_id="customer",
            from_account_id="checking",
            to_account_id="brokerage",
            amount=1,
            human_confirmed=True,
        )
    )
    assert result == {"transfer_id": "transfer-live"}
    assert (tmp_path / "transfer.json").exists()


def test_cache_rejects_stale_copy_unless_offline(monkeypatch, tmp_path):
    from app.agents.data import _common

    monkeypatch.setattr(_common, "_CACHE_DIR", tmp_path)
    monkeypatch.delenv("DATA_OFFLINE", raising=False)
    monkeypatch.delenv("DATA_CACHE_FIRST", raising=False)

    async def fail():
        raise RuntimeError("down")

    _common._save_cache("quote", {"price": 1, "as_of": time.time()})
    fresh = asyncio.run(_common.run_cached("quote", fail))
    assert fresh["price"] == 1
    assert "cached copy" in fresh["error"]

    _common._save_cache("quote", {"price": 1, "as_of": time.time() - 25 * 60 * 60})
    stale = asyncio.run(_common.run_cached("quote", fail))
    assert "price" not in stale
    assert "no cache" in stale["error"]

    monkeypatch.setenv("DATA_OFFLINE", "1")
    offline = asyncio.run(_common.run_cached("quote", fail))
    assert offline["price"] == 1
    assert "DATA_OFFLINE" in offline["error"]


def test_cache_first_uses_fresh_copy_without_live_lookup(monkeypatch, tmp_path):
    from app.agents.data import _common

    monkeypatch.setattr(_common, "_CACHE_DIR", tmp_path)
    monkeypatch.setenv("DATA_CACHE_FIRST", "1")
    calls = 0

    async def fetch():
        nonlocal calls
        calls += 1
        return {"price": 2}

    _common._save_cache("quote", {"price": 1, "as_of": time.time()})
    result = asyncio.run(_common.run_cached("quote", fetch))

    assert result["price"] == 1
    assert "DATA_CACHE_FIRST" in result["error"]
    assert calls == 0


def test_cache_first_fetches_when_copy_is_stale(monkeypatch, tmp_path):
    from app.agents.data import _common

    monkeypatch.setattr(_common, "_CACHE_DIR", tmp_path)
    monkeypatch.setenv("DATA_CACHE_FIRST", "1")

    async def fetch():
        return {"price": 2}

    _common._save_cache("quote", {"price": 1, "as_of": time.time() - 25 * 60 * 60})
    result = asyncio.run(_common.run_cached("quote", fetch))

    assert result["price"] == 2


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
        "/v1/fraud/{id}/live.json",
        "/v1/fraud/{id}/live.mjpg",
        "/v1/fraud/{id}/preview.jpg",
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
