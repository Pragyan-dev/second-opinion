"""SQLite job storage on one shared aiosqlite connection. Owner B."""

import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite

from app.config import settings

SCHEMA = (
    "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, kind TEXT, status TEXT, "
    "input JSON, result JSON, created_at TEXT, updated_at TEXT)",
    "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value JSON, expires_at REAL)",
)


@dataclass
class _State:
    loop: asyncio.AbstractEventLoop | None = None
    path: Path | None = None
    conn: aiosqlite.Connection | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_state = _State()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@asynccontextmanager
async def connection():
    """Yield the shared connection while holding the lock.

    The connection is reopened when the event loop or the database path changes, which happens
    between TestClient instances and when tests point settings.database at a temporary file.
    """
    global _state
    loop = asyncio.get_running_loop()
    if _state.loop is not loop or _state.path != settings.database:
        await close()
        _state = _State(loop=loop, path=settings.database)
    state = _state
    async with state.lock:
        if state.conn is None:
            state.path.parent.mkdir(parents=True, exist_ok=True)
            state.conn = await aiosqlite.connect(state.path)
            await state.conn.execute("PRAGMA journal_mode=WAL")
            for statement in SCHEMA:
                await state.conn.execute(statement)
            await state.conn.commit()
        yield state.conn


async def close():
    conn, _state.conn = _state.conn, None
    if conn is not None:
        try:
            await conn.close()
        except Exception:
            pass


async def create_job(job_id: str, kind: str, input: dict, result: dict, status: str = "pending"):
    now = _now()
    async with connection() as db:
        await db.execute(
            "INSERT INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?)",
            (job_id, kind, status, json.dumps(input), json.dumps(result), now, now),
        )
        await db.commit()


async def _read(db, job_id: str):
    async with db.execute("SELECT kind, status, result FROM jobs WHERE id=?", (job_id,)) as cur:
        return await cur.fetchone()


async def update_result(job_id: str, partial: dict):
    """Shallow-merge `partial` into the stored result."""
    async with connection() as db:
        row = await _read(db, job_id)
        if row is None:
            return
        result = json.loads(row[2])
        result.update(partial)
        await db.execute(
            "UPDATE jobs SET result=?, updated_at=? WHERE id=?",
            (json.dumps(result), _now(), job_id),
        )
        await db.commit()


async def set_status(job_id: str, status: str):
    async with connection() as db:
        row = await _read(db, job_id)
        if row is None:
            return
        result = json.loads(row[2])
        result["status"] = status
        await db.execute(
            "UPDATE jobs SET status=?, result=?, updated_at=? WHERE id=?",
            (status, json.dumps(result), _now(), job_id),
        )
        await db.commit()


async def get_job(job_id: str, kind: str | None = None) -> dict | None:
    """Return {id, kind, status, result} or None."""
    async with connection() as db:
        row = await _read(db, job_id)
    if row is None or (kind is not None and row[0] != kind):
        return None
    return {"id": job_id, "kind": row[0], "status": row[1], "result": json.loads(row[2])}
