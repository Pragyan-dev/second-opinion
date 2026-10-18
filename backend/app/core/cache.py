"""Async TTL cache stored in the jobs SQLite database. Owner B."""

import json
import time

from app.core.store import connection

CRAWL_TTL = 3600
BROKERCHECK_TTL = 24 * 3600
RDAP_TTL = 24 * 3600
NEWS_TTL = 6 * 3600


async def get(key: str):
    async with connection() as db:
        async with db.execute("SELECT value, expires_at FROM cache WHERE key=?", (key,)) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        if row[1] < time.time():
            await db.execute("DELETE FROM cache WHERE key=?", (key,))
            await db.commit()
            return None
    return json.loads(row[0])


async def set(key: str, value, ttl_s: float):
    async with connection() as db:
        await db.execute(
            "INSERT INTO cache VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET "
            "value=excluded.value, expires_at=excluded.expires_at",
            (key, json.dumps(value), time.time() + ttl_s),
        )
        await db.commit()
