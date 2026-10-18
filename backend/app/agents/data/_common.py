"""Shared fetch-with-cache helper for data agents. Owner D."""

import json
import os
import time
from pathlib import Path
from typing import Awaitable, Callable

ROOT = Path(__file__).resolve().parents[4]
_CACHE_DIR = ROOT / ".agent_cache"
_CACHE_DIR.mkdir(exist_ok=True)

_TIMEOUT_SECONDS = 8
_CACHE_TTL_SECONDS = 24 * 60 * 60


def _cache_path(key: str) -> Path:
    safe = key.replace("/", "_").replace(":", "_")
    return _CACHE_DIR / f"{safe}.json"


def _load_cache(key: str) -> dict | None:
    p = _cache_path(key)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return None
    return None


def _offline() -> bool:
    return os.getenv("DATA_OFFLINE", "0") == "1"


def _cache_first() -> bool:
    return os.getenv("DATA_CACHE_FIRST", "0") == "1"


def _is_fresh(cached: dict) -> bool:
    as_of = cached.get("as_of")
    if isinstance(as_of, bool) or not isinstance(as_of, (int, float)):
        return False
    return time.time() - float(as_of) <= _CACHE_TTL_SECONDS


def _save_cache(key: str, data: dict) -> None:
    try:
        _cache_path(key).write_text(json.dumps(data))
    except Exception:
        pass


async def run_cached(
    key: str,
    fetch: Callable[[], Awaitable[dict]],
) -> dict:
    """Run *fetch* with a timeout; fall back to cache on failure.

    With DATA_OFFLINE=1, skips live calls and always returns the cached copy.
    With DATA_CACHE_FIRST=1, returns a fresh cached copy before live lookup.
    """
    cached = _load_cache(key)

    if _offline():
        if cached:
            cached["error"] = "DATA_OFFLINE – cached copy used"
            return cached
        return {"error": "DATA_OFFLINE – no cache available"}

    if cached and _cache_first() and _is_fresh(cached):
        cached["error"] = "DATA_CACHE_FIRST – cached copy used"
        return cached

    import asyncio

    try:
        result: dict = await asyncio.wait_for(fetch(), timeout=_TIMEOUT_SECONDS)
        result["as_of"] = time.time()
        _save_cache(key, result)
        return result
    except Exception as exc:
        if cached and _is_fresh(cached):
            cached["error"] = f"cached copy used (live fetch failed: {exc})"
            return cached
        return {"error": f"live fetch failed and no cache available: {exc}"}
