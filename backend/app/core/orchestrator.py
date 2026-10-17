"""Sequential capture discovery followed by parallel fixture agents. Owner B."""

import asyncio
from uuid import uuid4

from fastapi import HTTPException

from app.agents import FRAUD_STEPS, STOCK_AGENTS
from app.config import fixture, settings
from app.contracts import AgentResult, Capture, FraudReport, StockReport
from app.core.agent import Agent
from app.core.store import JobStore

AGENT_TIMEOUT = 8
TERMINAL_FIELDS = {
    "fraud_likelihood",
    "band",
    "band_reason",
    "explanation",
    "stock_pros",
    "stock_cons",
    "stock_research_id",
}


def store():
    return JobStore(settings.database)


def create_fraud(capture: Capture):
    job_id = uuid4().hex
    payload = FraudReport(
        report_id=job_id,
        status="pending",
        source_type=capture.source_type,
        page_url=capture.url,
        entities={},
    ).model_dump()
    store().put(job_id, "fraud", payload)
    return {"report_id": job_id, "status": "pending"}


def create_stock(symbol: str):
    job_id = uuid4().hex
    payload = StockReport(
        research_id=job_id, symbol=symbol.upper(), asset_type="stock", status="pending", sections={}
    ).model_dump()
    store().put(job_id, "stock", payload)
    return {"research_id": job_id, "status": "pending"}


def get_job(job_id: str, kind: str):
    if kind == "fraud" and job_id in {"demo", "clone-demo", "real-demo"}:
        return fixture("fraud_real.json" if job_id == "real-demo" else "fraud_clone.json")
    if kind == "stock" and job_id == "demo":
        return fixture("stock_demo.json")
    payload = store().get(job_id, kind)
    if payload is None:
        raise HTTPException(404, "Job not found")
    return payload


async def run_agents(
    job_id: str, kind: str, agents: list[Agent], ctx: dict, sequential_prefix: int = 0
):
    jobs = store()
    payload = jobs.get(job_id, kind)
    payload["status"] = "running"
    jobs.put(job_id, kind, payload)
    results, final_fields = [], {}

    async def run_one(agent):
        try:
            result = await asyncio.wait_for(agent.run(ctx), timeout=AGENT_TIMEOUT)
        except asyncio.TimeoutError:
            result = AgentResult(agent=agent.name, status="error", error="timeout")
        except Exception as exc:
            result = AgentResult(agent=agent.name, status="error", error=str(exc))
        results.append(result)
        jobs.put(f"{job_id}:{agent.name}", "agent", result.model_dump())
        if kind == "stock":
            payload["sections"][agent.name] = result.model_dump()
        elif result.status == "done":
            payload["signals"].extend(result.data.get("signals", []))
            for key, value in result.data.items():
                if key in TERMINAL_FIELDS:
                    final_fields[key] = value
                elif key in {"entities", "site_visit", "official_contact", "jev_scores"}:
                    payload[key] = value
                    ctx[key] = value
        jobs.put(job_id, kind, payload)
        return result

    # Extraction populates entities before crawling; crawling populates site_visit
    # before any remaining fraud step starts. Stock agents have no sequential prefix.
    for agent in agents[:sequential_prefix]:
        if (await run_one(agent)).status != "done":
            break
    else:
        await asyncio.gather(*(run_one(agent) for agent in agents[sequential_prefix:]))
    failed = any(result.status != "done" for result in results)
    payload["status"] = "error" if failed else "done"
    if kind == "fraud":
        if failed:
            payload.update(
                band="cant_tell",
                fraud_likelihood=None,
                band_reason="One or more agents did not finish. Please retry.",
            )
        else:
            payload.update(final_fields)
    elif not failed:
        demo = fixture("stock_demo.json")
        payload.update(
            {key: demo[key] for key in ("summary", "articles", "pros", "cons", "questions")}
        )
        # TODO(B): aggregate stock sections into a sourced report instead of fixture metadata.
    jobs.put(job_id, kind, payload)


async def run_fraud(job_id: str, capture: Capture):
    await run_agents(job_id, "fraud", FRAUD_STEPS, capture.model_dump(), sequential_prefix=2)


async def run_stock(job_id: str, symbol: str, source_url: str | None = None):
    await run_agents(job_id, "stock", STOCK_AGENTS, {"symbol": symbol, "source_url": source_url})
