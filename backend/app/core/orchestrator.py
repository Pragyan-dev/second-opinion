"""Job lifecycle and the fraud and stock pipelines. Owner B.

Fraud runs as a dependency graph of stages over one shared ctx dict:
extract -> crawl -> [brokercheck, rdap, jev] -> contact_match -> scoring -> explainer.
Stock runs every STOCK_AGENTS entry in parallel, then the Explainer writes the summary.
Every step's contribution is saved as soon as it finishes, so GET returns partial results.
"""

import asyncio
import logging
from uuid import uuid4

from app.config import fixture, settings
from app.contracts import AgentResult, Capture, FraudReport, StockReport
from app.core import store
from app.core.steps import dump, error_signal
from app.fraud.extract import fixture_name

log = logging.getLogger(__name__)

LONG_TIMEOUTS = {"crawl": 15.0, "explainer": 15.0}
DEMO_FRAUD = {
    "demo": "fraud_clone.json",
    "clone-demo": "fraud_clone.json",
    "real-demo": "fraud_real.json",
}

# Strong references so running pipelines are not garbage collected.
_tasks: set[asyncio.Task] = set()
_by_id: dict[str, asyncio.Task] = {}
# Set when a stock job's sections are written, before its own summary runs.
_sections_ready: dict[str, asyncio.Event] = {}


def timeout_for(name: str) -> float:
    return LONG_TIMEOUTS.get(name, settings.agent_timeout_s)


def _spawn(job_id: str, coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    _by_id[job_id] = task

    def forget(done: asyncio.Task):
        _tasks.discard(done)
        if _by_id.get(job_id) is done:
            _by_id.pop(job_id, None)
            _sections_ready.pop(job_id, None)

    task.add_done_callback(forget)
    return task


async def shutdown():
    """Stop running pipelines and close the database (FastAPI lifespan exit)."""
    for task in list(_tasks):
        task.cancel()
    await asyncio.gather(*_tasks, return_exceptions=True)
    from app.fraud import live_browser

    await live_browser.shutdown()
    await store.close()


# Fraud


async def start_fraud_job(capture: Capture, stages=None) -> str:
    report_id = uuid4().hex
    report = FraudReport(
        report_id=report_id,
        status="running",
        source_type=capture.source_type,
        page_url=capture.url,
        entities={},
    )
    await store.create_job(
        report_id, "fraud", capture.model_dump(), dump(report), status="running"
    )
    _spawn(report_id, run_fraud(report_id, capture, stages))
    return report_id


async def run_step(job_id: str, step, ctx: dict):
    try:
        await asyncio.wait_for(step.run(ctx), timeout_for(step.name))
    except asyncio.TimeoutError:
        ctx["errors"][step.name] = "timeout"
        ctx["signals"].append(error_signal(step.name, "timed out"))
    except Exception as exc:
        log.exception("fraud step %s failed", step.name)
        ctx["errors"][step.name] = str(exc) or type(exc).__name__
        ctx["signals"].append(error_signal(step.name, type(exc).__name__))
    partial = {key: dump(ctx[key]) for key in step.writes if key in ctx}
    partial["signals"] = dump(ctx["signals"])
    await store.update_result(job_id, partial)


async def run_fraud(report_id: str, capture: Capture, stages=None):
    if stages is None:
        from app.agents import FRAUD_STAGES as stages
    ctx = {
        "report_id": report_id,
        "capture": capture,
        "case": fixture_name(capture.model_dump()),
        "signals": [],
        "errors": {},
    }
    try:
        for stage in stages:
            await asyncio.gather(*(run_step(report_id, step, ctx) for step in stage))
        await store.set_status(report_id, "done")
    except Exception:
        log.exception("fraud pipeline crashed")
        await store.set_status(report_id, "error")


# Stock


async def start_stock_job(symbol: str, source_url: str | None = None, agents=None) -> str:
    research_id = uuid4().hex
    report = StockReport(
        research_id=research_id,
        symbol=symbol.upper(),
        asset_type="stock",
        status="running",
        sections={},
    )
    await store.create_job(
        research_id,
        "stock",
        {"symbol": symbol.upper(), "source_url": source_url},
        dump(report),
        status="running",
    )
    _sections_ready[research_id] = asyncio.Event()
    _spawn(research_id, run_stock(research_id, symbol, source_url, agents))
    return research_id


async def run_stock(research_id: str, symbol: str, source_url: str | None = None, agents=None):
    if agents is None:
        from app.agents import STOCK_AGENTS as agents
    ctx = {"research_id": research_id, "symbol": symbol.upper(), "source_url": source_url}
    sections: dict[str, AgentResult] = {}

    async def one(agent):
        try:
            result = await asyncio.wait_for(agent.run(ctx), timeout_for(agent.name))
            result = AgentResult.model_validate(dump(result))
        except asyncio.TimeoutError:
            result = AgentResult(agent=agent.name, status="error", error="timeout")
        except Exception as exc:
            log.exception("stock agent %s failed", agent.name)
            result = AgentResult(
                agent=agent.name, status="error", error=str(exc) or type(exc).__name__
            )
        sections[agent.name] = result
        await store.update_result(research_id, {"sections": dump(sections)})

    try:
        await asyncio.gather(*(one(agent) for agent in agents))
        ctx["sections"] = sections
        if research_id in _sections_ready:
            _sections_ready[research_id].set()
        from app.agents.llm.explainer import explain_stock

        try:
            summary = await asyncio.wait_for(explain_stock(ctx), timeout_for("explainer"))
            await store.update_result(research_id, dump(summary))
        except Exception:
            log.exception("stock explainer failed")
        await store.set_status(research_id, "done")
    except Exception:
        log.exception("stock pipeline crashed")
        await store.set_status(research_id, "error")


# Reads


async def get_report(job_id: str, kind: str) -> dict | None:
    if kind == "fraud" and job_id in DEMO_FRAUD:
        return fixture(DEMO_FRAUD[job_id])
    if kind == "stock" and job_id == "demo":
        return fixture("stock_demo.json")
    job = await store.get_job(job_id, kind)
    return job["result"] if job else None


async def wait_for_sections(job_id: str, timeout: float) -> dict | None:
    """Wait up to `timeout` seconds for a stock job's sections (not its summary)."""
    ready = _sections_ready.get(job_id)
    if ready is not None and timeout > 0:
        try:
            await asyncio.wait_for(ready.wait(), timeout)
        except asyncio.TimeoutError:
            pass
    job = await store.get_job(job_id)
    return job["result"] if job else None


async def wait_for_job(job_id: str, timeout: float) -> dict | None:
    """Wait up to `timeout` seconds for a job started in this process, then return its result."""
    task = _by_id.get(job_id)
    if task is not None and timeout > 0:
        await asyncio.wait({task}, timeout=timeout)
    job = await store.get_job(job_id)
    return job["result"] if job else None
