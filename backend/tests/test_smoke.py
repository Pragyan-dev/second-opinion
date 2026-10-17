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
    AgentResult,
    Capture,
    FraudReport,
    FundingRequest,
    OfficialContact,
    OrderPreview,
    OrderTicket,
    StockReport,
)
from app.core import orchestrator
from app.purchase.nessie import fund
from app.purchase.preview import preview
from app.purchase.robinhood_mcp import RobinhoodClient, RobinhoodUnavailable

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(params=[main.app, mock.app], ids=["real", "mock"])
def client(request, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    mock.jobs.clear()
    with TestClient(request.param) as client:
        yield client


def finish(client, path):
    snapshots = []
    for _ in range(15):
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


def test_preview_est_total_when_portfolio_fails(monkeypatch):
    async def call_tool(self, name, arguments):
        if name == "get_equity_quotes":
            return {"last_trade_price": "10", "simple_name": "Brightwater"}
        if name == "get_equity_tradability":
            return {"is_tradable": True}
        raise RuntimeError("portfolio unavailable")

    monkeypatch.setattr(RobinhoodClient, "call_tool", call_tool)
    result = asyncio.run(preview(OrderTicket(symbol="BRWT", quantity=2, order_type="market")))
    assert result.est_total == 20
    assert result.data_source == "robinhood_mcp"
    assert result.buying_power_ok is None


def test_preview_fixture_name_follows_requested_symbol():
    result = asyncio.run(preview(OrderTicket(symbol="AAPL", quantity=1, order_type="market")))
    assert result.symbol == "AAPL"
    assert result.name == "AAPL simulated stock review"
    assert result.data_source == "simulated"
    same = asyncio.run(preview(OrderTicket(symbol="BRWT", quantity=1, order_type="market")))
    assert same.name == "BRWT fictional demonstration stock"


def test_preview_uses_cached_quote_when_yfinance_fails(monkeypatch):
    async def unavailable(self, name, arguments):
        raise RobinhoodUnavailable("offline")

    async def cached_quote(key, fetch):
        return {
            "last_price": 12.5,
            "name": "AAPL",
            "error": "cached copy used (live fetch failed: down)",
        }

    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(RobinhoodClient, "call_tool", unavailable)
    monkeypatch.setattr("app.agents.data._common.run_cached", cached_quote)
    result = asyncio.run(preview(OrderTicket(symbol="AAPL", quantity=2, order_type="market")))
    assert result.data_source == "cached"
    assert result.est_total == 25
    assert result.last_price == 12.5


def test_preview_falls_back_to_simulated_yfinance(monkeypatch):
    async def unavailable(self, name, arguments):
        raise RobinhoodUnavailable("down")

    async def live_quote(key, fetch):
        return {"last_price": 3.0, "name": "AAPL"}

    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(RobinhoodClient, "call_tool", unavailable)
    monkeypatch.setattr("app.agents.data._common.run_cached", live_quote)
    result = asyncio.run(preview(OrderTicket(symbol="AAPL", quantity=2, order_type="market")))
    assert result.data_source == "simulated"
    assert result.last_price == 3.0
    assert result.est_total == 6


def test_preview_with_mocked_robinhood_http(monkeypatch):
    class Response:
        def __init__(self, payload, status=200):
            self.status_code = status
            self.headers = {}
            self.content = b"" if payload is None else b"{}"
            self._payload = payload

        def json(self):
            return self._payload

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json, headers):
            assert headers["Authorization"] == "Bearer test-token"
            method = json["method"]
            if method == "initialize":
                return Response({"jsonrpc": "2.0", "id": json["id"], "result": {}})
            if method == "notifications/initialized":
                return Response(None, status=202)
            name = json["params"]["name"]
            if name == "get_equity_quotes":
                assert json["params"]["arguments"] == {"symbols": ["AAPL"]}
                data = {"results": [{"quote": {"last_trade_price": "4", "symbol": "AAPL"}}]}
            elif name == "get_equity_tradability":
                data = {"results": [{"tradeable": True}]}
            else:
                assert name == "get_portfolio"
                data = {"buying_power": {"buying_power": "100"}}
            return Response(
                {
                    "jsonrpc": "2.0",
                    "id": json["id"],
                    "result": {"structuredContent": {"data": data}},
                }
            )

    monkeypatch.setattr(settings, "robinhood_mcp_url", "https://agent.robinhood.com/mcp/trading")
    monkeypatch.setattr(settings, "robinhood_mcp_token", "test-token")
    monkeypatch.setattr("app.purchase.robinhood_mcp.httpx.AsyncClient", Client)
    result = asyncio.run(preview(OrderTicket(symbol="AAPL", quantity=2, order_type="market")))
    assert result.data_source == "robinhood_mcp"
    assert result.last_price == 4
    assert result.est_total == 8
    assert result.tradable is True
    assert result.buying_power_ok is True


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
    monkeypatch.setenv("USE_FIXTURES", "0")
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
        if relative.startswith("nessie/") or relative.startswith("robinhood/"):
            found.add(relative)
            continue
        model = (
            Capture
            if relative.startswith("captures/")
            else OfficialContact
            if relative.startswith("brokercheck/")
            else models[relative]
        )
        model.model_validate(json.loads(path.read_text()))
        found.add(relative)
    assert len(found) >= 9
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


def test_parallel_timeout_and_persistence(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    monkeypatch.setattr(orchestrator, "AGENT_TIMEOUT", 0.02)
    job = orchestrator.create_stock("BRWT")

    class Fast:
        name = "fast"

        async def run(self, ctx):
            return AgentResult(agent=self.name, status="done", data={"price": 1})

    class Slow:
        name = "slow"

        async def run(self, ctx):
            await asyncio.sleep(0.005)
            assert (
                orchestrator.get_job(job["research_id"], "stock")["sections"]["fast"]["status"]
                == "done"
            )
            await asyncio.sleep(1)

    asyncio.run(orchestrator.run_agents(job["research_id"], "stock", [Fast(), Slow()], {}))
    result = orchestrator.get_job(job["research_id"], "stock")
    assert result["status"] == "error" and result["sections"]["slow"]["error"] == "timeout"
    assert orchestrator.store().get(f"{job['research_id']}:slow", "agent")["error"] == "timeout"


def test_fraud_sequencing(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    capture = Capture.model_validate(fixture("captures/email_brightwater.json"))
    job = orchestrator.create_fraud(capture)
    events = []

    async def scenario():
        ready = asyncio.Event()

        class Extract:
            name = "extract"

            async def run(self, ctx):
                events.append("extract")
                return AgentResult(
                    agent=self.name, status="done", data={"entities": {"firms": ["Demo"]}}
                )

        class Crawl:
            name = "crawl"

            async def run(self, ctx):
                assert ctx["entities"]["firms"] == ["Demo"]
                events.append("crawl")
                return AgentResult(
                    agent=self.name,
                    status="done",
                    data={"site_visit": fixture("fraud_clone.json")["site_visit"]},
                )

        class First:
            name = "first"

            async def run(self, ctx):
                assert ctx["site_visit"]["claimed_firm"] == "Brightwater Capital Advisors"
                events.append("first")
                await asyncio.wait_for(ready.wait(), 0.2)
                return AgentResult(agent=self.name, status="done")

        class Second:
            name = "second"

            async def run(self, ctx):
                assert events[:2] == ["extract", "crawl"]
                ready.set()
                return AgentResult(agent=self.name, status="done")

        await orchestrator.run_agents(
            job["report_id"],
            "fraud",
            [Extract(), Crawl(), First(), Second()],
            capture.model_dump(),
            sequential_prefix=2,
        )

    asyncio.run(scenario())
    assert orchestrator.get_job(job["report_id"], "fraud")["status"] == "done"
