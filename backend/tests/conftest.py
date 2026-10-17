"""Shared test setup: fixture mode on, temporary database, no real network, fake LLM."""

import asyncio
import os
import socket
import tempfile
from pathlib import Path
from types import SimpleNamespace

os.environ["USE_FIXTURES"] = "1"
os.environ.setdefault("DATABASE_PATH", str(Path(tempfile.mkdtemp()) / "jobs.sqlite"))

import httpx2  # noqa: E402
import openai  # noqa: E402
import pytest  # noqa: E402

from app.config import settings  # noqa: E402
from app.core import llm, store  # noqa: E402

_real_connect = socket.socket.connect


def _guarded_connect(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6):
        raise RuntimeError(f"Tests must not open network connections: {address}")
    return _real_connect(self, address)


def _blocked_getaddrinfo(host, *args, **kwargs):
    raise RuntimeError(f"Tests must not resolve hostnames: {host}")


@pytest.fixture(autouse=True)
def no_network(monkeypatch, tmp_path):
    monkeypatch.setattr(socket.socket, "connect", _guarded_connect)
    monkeypatch.setattr(socket, "getaddrinfo", _blocked_getaddrinfo)
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    monkeypatch.setattr(settings, "use_fixtures", True)
    monkeypatch.setattr(settings, "fixture_agents", set())
    monkeypatch.setattr(llm, "_client", None)
    monkeypatch.setattr(llm, "_no_json_schema", set())
    yield
    # aiosqlite worker threads are not daemons; an open connection would hang pytest at exit.
    if store._state.conn is not None:
        asyncio.run(store.close())


def bad_request(message="response_format json_schema is not supported"):
    request = httpx2.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
    return openai.BadRequestError(
        message, response=httpx2.Response(400, request=request), body=None
    )


class FakeLLM:
    """Stands in for AsyncOpenAI. `responses` items are strings, exceptions, or callables."""

    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.calls: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self.responses:
            raise AssertionError("FakeLLM ran out of responses")
        item = self.responses.pop(0)
        if callable(item):
            item = item(kwargs)
        if isinstance(item, Exception):
            raise item
        message = SimpleNamespace(content=item)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture
def fake_llm(monkeypatch):
    def install(responses=None):
        fake = FakeLLM(responses)
        monkeypatch.setattr(llm, "_client", fake)
        monkeypatch.setattr(settings, "openrouter_model", "test/model")
        return fake

    return install
