"""End-to-end orchestrator behavior in fixture mode, through the real routes."""

import asyncio

import httpx
import pytest

from app import agents, main
from app.config import fixture, settings
from app.contracts import AgentResult, FraudReport, StockReport
from app.core import orchestrator, store


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    await orchestrator.shutdown()


async def poll(client, path, limit=10.0):
    snapshots = []
    end = asyncio.get_running_loop().time() + limit
    while asyncio.get_running_loop().time() < end:
        response = await client.get(path)
        assert response.status_code == 200
        snapshots.append(response.json())
        if snapshots[-1]["status"] in ("done", "error"):
            return snapshots
        await asyncio.sleep(0.01)
    pytest.fail(f"{path} did not finish in {limit} s")


def step(name):
    return next(s for stage in agents.FRAUD_STAGES for s in stage if s.name == name)


async def test_real_low_clone_high_with_partial_results(client, monkeypatch):
    gate = asyncio.Event()
    explainer = step("explainer")
    original = explainer.run

    async def gated(ctx):
        await gate.wait()
        await original(ctx)

    monkeypatch.setattr(explainer, "run", gated)
    results = {}
    for name in ("x_post_troweprice.json", "email_brightwater.json"):
        response = await client.post("/v1/fraud/analyze", json=fixture(f"captures/{name}"))
        assert response.status_code == 202
        path = f"/v1/fraud/{response.json()['report_id']}"
        # Before the explainer runs, earlier steps are already visible.
        for _ in range(500):
            partial = (await client.get(path)).json()
            if partial["band"]:
                break
            await asyncio.sleep(0.01)
        assert partial["status"] == "running" and partial["signals"] and partial["entities"]
        assert partial["site_visit"] and partial["explanation"] is None
        gate.set()
        results[name] = FraudReport.model_validate((await poll(client, path))[-1])
        gate.clear()

    real, clone = results["x_post_troweprice.json"], results["email_brightwater.json"]
    assert real.status == clone.status == "done"
    assert real.band == "low" and real.fraud_likelihood < 25
    assert clone.band == "high" and clone.fraud_likelihood > 60
    assert clone.explanation and clone.stock_research_id
    stock = await poll(client, f"/v1/stock/{clone.stock_research_id}")
    assert StockReport.model_validate(stock[-1]).status == "done"


async def test_step_that_raises_still_finishes(client, monkeypatch):
    async def boom(ctx):
        raise RuntimeError("rdap is down")

    monkeypatch.setattr(step("rdap"), "run", boom)
    capture = fixture("captures/email_brightwater.json")
    report_id = (await client.post("/v1/fraud/analyze", json=capture)).json()["report_id"]
    report = FraudReport.model_validate((await poll(client, f"/v1/fraud/{report_id}"))[-1])
    assert report.status == "done"
    error = next(s for s in report.signals if s.id == "rdap_error")
    assert error.check == "unknown"
    assert report.band == "high"


async def test_step_timeout_becomes_unknown_signal(client, monkeypatch):
    monkeypatch.setattr(settings, "agent_timeout_s", 0.05)

    async def slow(ctx):
        await asyncio.sleep(5)

    monkeypatch.setattr(step("jev"), "run", slow)
    capture = fixture("captures/x_post_troweprice.json")
    report_id = (await client.post("/v1/fraud/analyze", json=capture)).json()["report_id"]
    report = (await poll(client, f"/v1/fraud/{report_id}"))[-1]
    assert report["status"] == "done"
    assert any(s["id"] == "jev_error" for s in report["signals"])


async def test_stock_parallel_timeout_and_incremental_sections(client, monkeypatch):
    monkeypatch.setattr(settings, "agent_timeout_s", 0.2)
    seen = {}

    class Fast:
        name = "fast"

        async def run(self, ctx):
            return AgentResult(agent=self.name, status="done", data={"price": 1})

    class Slow:
        name = "slow"

        async def run(self, ctx):
            await asyncio.sleep(0.05)
            job = await store.get_job(ctx["research_id"])
            seen["fast"] = job["result"]["sections"].get("fast", {}).get("status")
            await asyncio.sleep(5)

    class Broken:
        name = "broken"

        async def run(self, ctx):
            raise ValueError("bad data")

    research_id = await orchestrator.start_stock_job("brwt", None, [Fast(), Slow(), Broken()])
    report = (await poll(client, f"/v1/stock/{research_id}"))[-1]
    assert seen["fast"] == "done"
    assert report["status"] == "done" and report["symbol"] == "BRWT"
    assert report["sections"]["slow"]["error"] == "timeout"
    assert report["sections"]["broken"]["status"] == "error"


async def test_orchestrator_crash_sets_error(client, monkeypatch):
    async def crash(job_id, step, ctx):
        raise RuntimeError("orchestrator bug")

    monkeypatch.setattr(orchestrator, "run_step", crash)
    capture = fixture("captures/x_post_troweprice.json")
    report_id = (await client.post("/v1/fraud/analyze", json=capture)).json()["report_id"]
    assert (await poll(client, f"/v1/fraud/{report_id}"))[-1]["status"] == "error"


async def test_missing_and_demo_ids(client):
    assert (await client.get("/v1/fraud/nope")).status_code == 404
    assert (await client.get("/v1/stock/nope")).status_code == 404
    assert (await client.get("/v1/fraud/clone-demo")).json()["band"] == "high"
