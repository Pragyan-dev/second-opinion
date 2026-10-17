"""aiosqlite job store and TTL cache."""

import time

from app.core import cache, store


async def test_job_roundtrip_and_merge():
    await store.create_job("j1", "fraud", {"url": "u"}, {"status": "running", "signals": []})
    await store.update_result("j1", {"signals": [1], "band": "low"})
    await store.update_result("j1", {"explanation": "x"})
    await store.set_status("j1", "done")
    job = await store.get_job("j1", "fraud")
    assert job["status"] == "done"
    assert job["result"] == {"status": "done", "signals": [1], "band": "low", "explanation": "x"}
    assert await store.get_job("j1", "stock") is None
    assert await store.get_job("missing") is None
    await store.close()


async def test_cache_ttl(monkeypatch):
    await cache.set("rdap:a.com", {"age": 1}, 60)
    assert await cache.get("rdap:a.com") == {"age": 1}
    now = time.time()
    monkeypatch.setattr(cache.time, "time", lambda: now + 61)
    assert await cache.get("rdap:a.com") is None
    assert await cache.get("missing") is None
    await store.close()
