"""Jev flags from the LLM, verbatim evidence check, and Jev API mapping."""

import json

import httpx
import pytest

from app.config import fixture, settings
from app.contracts import Capture, SiteVisit
from app.fraud import jev

pytestmark = pytest.mark.respx(assert_all_called=False)


def ctx_for(crawl_text=""):
    capture = Capture.model_validate(fixture("captures/email_brightwater.json"))
    visit = SiteVisit(
        start_url="https://brightwater-capital.example/",
        final_url="https://brightwater-capital.example/",
        pages_visited=[],
    )
    return {
        "capture": capture,
        "case": "fraud_clone.json",
        "crawl_text": crawl_text,
        "site_visit": visit,
        "signals": [],
        "errors": {},
    }


def llm_answer(**overrides):
    flags = {flag: {"confidence": 0.0, "evidence": ""} for flag in jev.FLAGS}
    flags.update(overrides)
    return json.dumps(flags)


async def test_llm_scores_and_verbatim_check(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    fake_llm(
        [
            llm_answer(
                guaranteed_returns={"confidence": 0.97, "evidence": "Guaranteed monthly returns"},
                urgency_deadline={
                    "confidence": 0.9,
                    "evidence": "Priority allocation  closes in 24 hours.",
                },
                private_channel={"confidence": 0.8, "evidence": "Text us on Signal for details"},
                unusual_payment={"confidence": 0.7, "evidence": "$5,000 wire transfer"},
            )
        ]
    )
    ctx = ctx_for(crawl_text="Reserve your position with a $5,000 wire transfer.")
    await jev.JevStep().run(ctx)
    scores = {s.flag: s for s in ctx["jev_scores"]}
    assert list(scores) == list(jev.FLAGS)
    assert scores["guaranteed_returns"].confidence == 0.97
    assert scores["urgency_deadline"].evidence == "Priority allocation closes in 24 hours."
    # Invented quote is dropped and zeroed.
    assert scores["private_channel"].confidence == 0 and scores["private_channel"].evidence == ""
    signals = {s.id: s for s in ctx["signals"]}
    assert set(signals) == {"guaranteed_returns", "urgency_deadline", "unusual_payment"}
    assert signals["guaranteed_returns"].source.url == ctx["capture"].url
    assert signals["unusual_payment"].source.title == "Visited website"


async def test_input_capped(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    fake = fake_llm([llm_answer()])
    await jev.JevStep().run(ctx_for(crawl_text="x" * 50000))
    assert len(fake.calls[0]["messages"][1]["content"]) < jev.TEXT_CAP + 100


async def test_llm_failure_raises_for_orchestrator(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    with pytest.raises(jev.llm.LLMError):
        await jev.JevStep().run(ctx_for())


async def test_jev_api_when_configured(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "jev_api_key", "k")
    monkeypatch.setattr(settings, "jev_api_url", "https://jev.test/score")
    route = respx_mock.post("https://jev.test/score").mock(
        return_value=httpx.Response(
            200,
            json={
                "guaranteed_returns": {
                    "confidence": 0.9,
                    "evidence": "Guaranteed monthly returns",
                }
            },
        )
    )
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    assert route.called and route.calls[0].request.headers["authorization"] == "Bearer k"
    assert ctx["jev_scores"][0].confidence == 0.9 and len(ctx["jev_scores"]) == 6


async def test_fixture_mode():
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    assert [s.flag for s in ctx["jev_scores"]] == ["guaranteed_returns", "urgency", "whatsapp"]
    assert len(ctx["signals"]) == 3
