"""One live call per external service, printed as OK, FAIL or SKIP with latency. Owner B.

Run from backend/: python -m app.fraud.probe
"""

import asyncio
import sys
import time

import httpx
from pydantic import BaseModel

from app.agents.llm import news
from app.config import settings
from app.core import llm
from app.fraud import brokercheck, jev, rdap

TIMEOUT_S = 20


class Ping(BaseModel):
    ok: bool
    word: str


class Skip(Exception):
    pass


async def probe_openrouter() -> str:
    if not settings.openrouter_api_key or not settings.openrouter_model:
        raise Skip("OPENROUTER_API_KEY or OPENROUTER_MODEL not set")
    result = await llm.structured(
        "Return ok true and the word 'ready'.", Ping, "You answer in JSON.", timeout=15
    )
    mode = "json_object" if settings.openrouter_model in llm._no_json_schema else "json_schema"
    return f"model={settings.openrouter_model} mode={mode} word={result.word}"


async def probe_rdap() -> str:
    data = await rdap.fetch_live("troweprice.com")
    registered = rdap.registration_date(data)
    return f"troweprice.com registered {registered} ({rdap.age_days(data)} days)"


async def probe_brokercheck() -> str:
    if not settings.live_brokercheck:
        raise Skip("LIVE_BROKERCHECK=0")
    data = await brokercheck.fetch_search("T. Rowe Price")
    hits = data.get("hits", {}).get("hits", [])
    contact = brokercheck.parse_search(data, "T. Rowe Price")
    found = f"{contact.firm} CRD {contact.crd} phone {contact.phone}" if contact else "no match"
    return f"{len(hits)} hits, best: {found}"


async def probe_search() -> str:
    search = news.PROVIDERS.get(settings.search_provider)
    if search is None or not settings.search_api_key:
        raise Skip("SEARCH_PROVIDER or SEARCH_API_KEY not set")
    async with httpx.AsyncClient(timeout=10) as client:
        items = await search(client, "TROW stock")
    return f"{settings.search_provider}: {len(items)} results"


async def probe_jev() -> str:
    if not settings.jev_api_key:
        raise Skip("JEV_API_KEY and OPENROUTER_API_KEY not set")
    data = await jev.request_jev("Guaranteed monthly returns. Offer closes in 24 hours.")
    keys = f"model={settings.jev_model} keys={sorted(data)[:8]}"
    try:
        parsed = jev.parse_decisions(data)
    except ValueError as exc:
        return f"{keys}; parser needs updating: {exc}; raw={str(data)[:300]}"
    return keys + " " + ", ".join(f"{flag}={p:.2f}" for flag, p in parsed.items())


PROBES = [
    ("openrouter", probe_openrouter),
    ("rdap", probe_rdap),
    ("brokercheck", probe_brokercheck),
    ("search", probe_search),
    ("jev", probe_jev),
]


async def main() -> int:
    failures = 0
    for name, probe in PROBES:
        start = time.perf_counter()
        try:
            detail = await asyncio.wait_for(probe(), TIMEOUT_S)
            status = "OK"
        except Skip as exc:
            status, detail = "SKIP", str(exc)
        except Exception as exc:
            status, detail = "FAIL", f"{type(exc).__name__}: {exc}"
            failures += 1
        ms = (time.perf_counter() - start) * 1000
        print(f"{name:<12} {status:<4} {ms:7.0f} ms  {detail}", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
