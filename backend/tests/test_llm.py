"""OpenRouter client: json_schema path, json_object fallback, validation retry."""

import json

import pytest
from conftest import bad_request
from pydantic import BaseModel

from app.core import llm


class Firms(BaseModel):
    firms: list[str]
    count: int = 0


async def test_json_schema_path(fake_llm):
    fake = fake_llm(['{"firms": ["Brightwater"], "count": 1}'])
    result = await llm.structured("text", Firms, "system")
    assert result == Firms(firms=["Brightwater"], count=1)
    call = fake.calls[0]
    assert call["model"] == "test/model"
    fmt = call["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    assert fmt["json_schema"]["name"] == "Firms"
    schema = fmt["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["firms", "count"]
    assert "default" not in schema["properties"]["count"]


async def test_json_object_fallback_when_schema_rejected(fake_llm):
    fake = fake_llm([bad_request(), '```json\n{"firms": ["A"]}\n```'])
    result = await llm.structured("text", Firms, "system")
    assert result.firms == ["A"]
    assert fake.calls[1]["response_format"] == {"type": "json_object"}
    assert "JSON schema" in fake.calls[1]["messages"][0]["content"]
    # The model is remembered, so the next call skips json_schema.
    fake.responses.append('{"firms": []}')
    await llm.structured("text", Firms, "system")
    assert fake.calls[2]["response_format"] == {"type": "json_object"}


async def test_one_validation_retry_then_success(fake_llm):
    fake = fake_llm(['{"firms": "not a list"}', '{"firms": ["B"]}'])
    result = await llm.structured("text", Firms, "system")
    assert result.firms == ["B"] and len(fake.calls) == 2
    retry_messages = fake.calls[1]["messages"]
    assert retry_messages[-1]["role"] == "user"
    assert "did not validate" in retry_messages[-1]["content"]


async def test_validation_fails_twice_raises(fake_llm):
    fake_llm(["nope", json.dumps({"firms": 3})])
    with pytest.raises(llm.LLMError):
        await llm.structured("text", Firms, "system")


async def test_missing_key_raises():
    with pytest.raises(llm.LLMError):
        await llm.structured("text", Firms, "system")


async def test_text(fake_llm):
    fake_llm(["  Plain answer. "])
    assert await llm.text("prompt", "system") == "Plain answer."


def test_client_headers(monkeypatch):
    monkeypatch.setattr(llm.settings, "openrouter_api_key", "sk-test")
    client = llm.client()
    assert str(client.base_url).rstrip("/") == llm.BASE_URL
    assert client.default_headers["X-Title"] == "Second Opinion"
    assert client.default_headers["HTTP-Referer"].startswith("https://github.com/")
