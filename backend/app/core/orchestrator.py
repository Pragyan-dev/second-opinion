"""Parallel fixture pipeline; replace stubs within each owner's folder. Owner B."""

import asyncio
from uuid import uuid4

from fastapi import HTTPException

from app.agents import PITCH_AGENTS, STOCK_AGENTS
from app.config import fixture, settings
from app.contracts import AgentResult, PageCapture, Report, StockXray
from app.core.agent import Agent
from app.core.store import JobStore

AGENT_TIMEOUT = 8


def store():
    return JobStore(settings.database)


def create_report(capture: PageCapture):
    job_id = uuid4().hex
    payload = Report(
        report_id=job_id, status="pending", page_url=capture.url, entities={}
    ).model_dump()
    store().put(job_id, "report", payload)
    return {"report_id": job_id, "status": "pending"}


def create_xray(symbol: str):
    job_id = uuid4().hex
    payload = StockXray(
        xray_id=job_id, symbol=symbol.upper(), asset_type="stock", status="pending", sections={}
    ).model_dump()
    store().put(job_id, "xray", payload)
    return {"xray_id": job_id, "status": "pending"}


def get_job(job_id: str, kind: str):
    if job_id == "demo":
        return fixture("report_demo.json" if kind == "report" else "xray_demo.json")
    payload = store().get(job_id, kind)
    if payload is None:
        raise HTTPException(404, "Job not found")
    return payload


async def run_agents(job_id: str, kind: str, agents: list[Agent], ctx: dict):
    jobs = store()
    payload = jobs.get(job_id, kind)
    payload["status"] = "running"
    jobs.put(job_id, kind, payload)
    results = []

    async def run_one(agent):
        try:
            result = await asyncio.wait_for(agent.run(ctx), timeout=AGENT_TIMEOUT)
        except asyncio.TimeoutError:
            result = AgentResult(agent=agent.name, status="error", error="timeout")
        except Exception as exc:
            result = AgentResult(agent=agent.name, status="error", error=str(exc))
        results.append(result)
        jobs.put(f"{job_id}:{agent.name}", "agent", result.model_dump())
        if kind == "xray":
            payload["sections"][agent.name] = result.model_dump()
        elif result.status == "done":
            payload["signals"].extend(result.data.get("signals", []))
            for key in ("entities", "official_contact"):
                if key in result.data:
                    payload[key] = result.data[key]
        # Persist each completion before waiting for other agents.
        jobs.put(job_id, kind, payload)

    await asyncio.gather(*(run_one(agent) for agent in agents))
    failed = any(result.status != "done" for result in results)
    payload["status"] = "error" if failed else "done"
    if not failed:
        demo = fixture("report_demo.json" if kind == "report" else "xray_demo.json")
        keys = (
            ("band", "band_reason", "explanation") if kind == "report" else ("summary", "questions")
        )
        for key in keys:
            payload[key] = demo[key]
        # TODO(B): replace fixture aggregation with scoring and explanation agents.
    elif kind == "report":
        payload["band"] = "cant_tell"
        payload["band_reason"] = "One or more agents did not finish. Please retry."
    jobs.put(job_id, kind, payload)


async def run_report(job_id: str, capture: PageCapture):
    await run_agents(job_id, "report", PITCH_AGENTS, capture.model_dump())


async def run_xray(job_id: str, symbol: str):
    await run_agents(job_id, "xray", STOCK_AGENTS, {"symbol": symbol})
