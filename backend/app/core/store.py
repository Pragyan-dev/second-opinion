"""SQLite JSON job storage. Owner B."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class JobStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS jobs "
                "(id TEXT PRIMARY KEY, kind TEXT, payload TEXT, updated_at TEXT)"
            )

    def connect(self):
        return sqlite3.connect(self.path)

    def put(self, job_id: str, kind: str, payload: dict):
        with self.connect() as connection:
            connection.execute(
                "INSERT INTO jobs VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "kind=excluded.kind, payload=excluded.payload, updated_at=excluded.updated_at",
                (job_id, kind, json.dumps(payload), datetime.now(timezone.utc).isoformat()),
            )

    def get(self, job_id: str, kind: str):
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload FROM jobs WHERE id=? AND kind=?", (job_id, kind)
            ).fetchone()
        return json.loads(row[0]) if row else None
