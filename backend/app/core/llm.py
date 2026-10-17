"""OpenRouter LLM client through the OpenAI-compatible API. Owner B."""

import asyncio
import copy
import json
import re

import openai
from pydantic import BaseModel, ValidationError

from app.config import settings

BASE_URL = "https://openrouter.ai/api/v1"
FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)

_client: openai.AsyncOpenAI | None = None
# Models that rejected response_format json_schema; they go straight to json_object.
_no_json_schema: set[str] = set()


class LLMError(Exception):
    pass


def client() -> openai.AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.openrouter_api_key:
            raise LLMError("OPENROUTER_API_KEY is not set")
        _client = openai.AsyncOpenAI(
            base_url=BASE_URL,
            api_key=settings.openrouter_api_key,
            default_headers={
                "HTTP-Referer": settings.openrouter_referer,
                "X-Title": "Second Opinion",
            },
        )
    return _client


def strict_schema(schema: dict) -> dict:
    """Copy a Pydantic JSON schema into the shape strict structured outputs accept."""

    def visit(node):
        if isinstance(node, dict):
            node.pop("default", None)
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node["required"] = list(node["properties"])
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
        return node

    return visit(copy.deepcopy(schema))


def strip_fences(raw: str) -> str:
    match = FENCE.match(raw or "")
    return match.group(1) if match else (raw or "").strip()


def _schema_name(schema: type[BaseModel]) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", schema.__name__)[:64] or "result"


def _remaining(deadline: float) -> float:
    left = deadline - asyncio.get_running_loop().time()
    if left <= 0:
        raise LLMError("LLM deadline exceeded")
    return left


async def _complete(messages: list[dict], response_format: dict | None, deadline: float) -> str:
    if not settings.openrouter_model:
        raise LLMError("OPENROUTER_MODEL is not set")
    kwargs = {"model": settings.openrouter_model, "messages": messages}
    if response_format:
        kwargs["response_format"] = response_format
    left = _remaining(deadline)
    try:
        response = await asyncio.wait_for(
            client().chat.completions.create(**kwargs, timeout=left), left
        )
    except openai.BadRequestError:
        raise
    except (asyncio.TimeoutError, openai.APITimeoutError) as exc:
        raise LLMError("LLM request timed out") from exc
    except openai.OpenAIError as exc:
        raise LLMError(f"LLM request failed: {exc}") from exc
    if not response.choices:
        raise LLMError("LLM returned no choices")
    return response.choices[0].message.content or ""


def _json_object_system(system: str, schema: type[BaseModel]) -> str:
    return (
        f"{system}\n\nRespond with one JSON object only, no prose and no code fences. "
        f"It must validate against this JSON schema:\n{json.dumps(schema.model_json_schema())}"
    )


async def structured(
    prompt: str, schema: type[BaseModel], system: str, timeout: float = 12
) -> BaseModel:
    """Return `schema` parsed from the model. `timeout` bounds the whole call, retries included."""
    deadline = asyncio.get_running_loop().time() + timeout
    model = settings.openrouter_model
    json_schema_format = {
        "type": "json_schema",
        "json_schema": {
            "name": _schema_name(schema),
            "schema": strict_schema(schema.model_json_schema()),
            "strict": True,
        },
    }
    use_json_schema = model not in _no_json_schema
    system_text = system if use_json_schema else _json_object_system(system, schema)
    messages = [{"role": "system", "content": system_text}, {"role": "user", "content": prompt}]

    for attempt in range(2):
        if use_json_schema:
            try:
                raw = await _complete(messages, json_schema_format, deadline)
            except openai.BadRequestError:
                _no_json_schema.add(model)
                use_json_schema = False
                messages[0] = {"role": "system", "content": _json_object_system(system, schema)}
        if not use_json_schema:
            try:
                raw = await _complete(messages, {"type": "json_object"}, deadline)
            except openai.BadRequestError as exc:
                raise LLMError(f"LLM rejected the request: {exc}") from exc
        try:
            return schema.model_validate_json(strip_fences(raw))
        except ValidationError as exc:
            error = exc
            messages += [
                {"role": "assistant", "content": raw},
                {
                    "role": "user",
                    "content": "That JSON did not validate. Fix it and return only the corrected "
                    f"JSON object. Validation errors:\n{exc}",
                },
            ]
    raise LLMError(f"LLM output failed validation twice: {error}")


async def text(prompt: str, system: str, timeout: float = 12) -> str:
    deadline = asyncio.get_running_loop().time() + timeout
    messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    try:
        return (await _complete(messages, None, deadline)).strip()
    except openai.BadRequestError as exc:
        raise LLMError(f"LLM rejected the request: {exc}") from exc
