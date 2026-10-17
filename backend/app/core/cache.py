"""JSON cache keyed by a canonical request hash. Owner B."""

import hashlib
import json
from pathlib import Path
from uuid import uuid4


class JsonCache:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)

    def path(self, request: dict) -> Path:
        key = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()
        return self.directory / f"{key}.json"

    def get(self, request: dict):
        path = self.path(request)
        return json.loads(path.read_text()) if path.exists() else None

    def put(self, request: dict, value: dict):
        path = self.path(request)
        temporary = self.directory / f"{uuid4().hex}.tmp"
        temporary.write_text(json.dumps(value))
        temporary.replace(path)
