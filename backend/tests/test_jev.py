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


async def test_llm_failure_uses_keyword_scores(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    ctx = ctx_for(crawl_text="Reserve your position with a $5,000 wire transfer. Call us.")
    await jev.JevStep().run(ctx)
    assert "jev_llm" in ctx["errors"]
    scores = {s.flag: s for s in ctx["jev_scores"]}
    assert scores["guaranteed_returns"].evidence == "Guaranteed monthly returns."
    assert scores["urgency_deadline"].evidence == "Priority allocation closes in 24 hours."
    assert scores["private_channel"].confidence == jev.KEYWORD_CONFIDENCE
    payment = scores["unusual_payment"].evidence
    assert payment == "Reserve your position with a $5,000 wire transfer."
    assert scores["authority_claim"].confidence == 0
    assert scores["authority_claim"].evidence == ""


DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions"


def decisions_answer(**yes):
    return {
        "answers": {
            flag: {"distribution": {"yes": yes.get(flag, 0.02), "no": 1 - yes.get(flag, 0.02)}}
            for flag in jev.FLAGS
        }
    }


@pytest.fixture
def jev_live(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "jev_api_key", "or-key")
    monkeypatch.setattr(settings, "jev_api_url", DECISIONS_URL)


async def test_jev_decisions_api(respx_mock, jev_live):
    route = respx_mock.post(DECISIONS_URL).mock(
        return_value=httpx.Response(
            200, json=decisions_answer(guaranteed_returns=0.93, authority_claim=0.81)
        )
    )
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    request = route.calls[0].request
    assert request.headers["authorization"] == "Bearer or-key"
    body = json.loads(request.content)
    assert body["model"] == "typesafe/jev-1.14"
    assert "Guaranteed monthly returns" in body["state"]
    assert set(body["questions"]) == set(jev.FLAGS)
    assert all(q["type"] == "noul" and q["instructions"] for q in body["questions"].values())
    scores = {s.flag: s for s in ctx["jev_scores"]}
    assert scores["guaranteed_returns"].confidence == 0.93
    # Evidence is the verbatim sentence from the keyword matcher.
    assert scores["guaranteed_returns"].evidence == "Guaranteed monthly returns."
    assert scores["urgency_deadline"].confidence == 0.02
    signals = {s.id: s for s in ctx["signals"]}
    assert set(signals) == {"guaranteed_returns", "authority_claim"}
    assert signals["authority_claim"].detail == "Jev rated this at 0.81."


@pytest.mark.parametrize(
    "answer,expected",
    [
        (0.4, 0.4),
        ("yes", 1.0),
        ({"probabilities": {"Yes": 0.7, "No": 0.3}}, 0.7),
        ({"distribution": [{"label": "no", "p": 0.2}, {"label": "yes", "p": 0.8}]}, 0.8),
        ({"p_yes": 0.55}, 0.55),
        ({"answer": "no"}, 0.0),
    ],
)
def test_yes_probability_shapes(answer, expected):
    assert jev.yes_probability(answer) == expected


def test_parse_decisions_list_shape_and_missing_flags():
    data = {"results": [{"name": flag, "score": 0.5} for flag in jev.FLAGS]}
    assert set(jev.parse_decisions(data).values()) == {0.5}
    with pytest.raises(ValueError):
        jev.parse_decisions({"answers": {"guaranteed_returns": 0.9}})


async def test_unrecognised_jev_response_falls_back_to_llm(respx_mock, jev_live, fake_llm):
    respx_mock.post(DECISIONS_URL).mock(return_value=httpx.Response(200, json={"weird": 1}))
    claim = {"confidence": 0.9, "evidence": "Guaranteed monthly returns"}
    fake = fake_llm([llm_answer(guaranteed_returns=claim)])
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    assert "jev_api" in ctx["errors"] and len(fake.calls) == 1
    assert ctx["jev_scores"][0].confidence == 0.9


async def test_jev_http_error_falls_back(respx_mock, jev_live):
    respx_mock.post(DECISIONS_URL).mock(return_value=httpx.Response(402))
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    assert "jev_api" in ctx["errors"] and "jev_llm" in ctx["errors"]
    assert {s.flag: s for s in ctx["jev_scores"]}["guaranteed_returns"].confidence == 0.7


async def test_fixture_mode():
    ctx = ctx_for()
    await jev.JevStep().run(ctx)
    assert [s.flag for s in ctx["jev_scores"]] == ["guaranteed_returns", "urgency", "whatsapp"]
    assert len(ctx["signals"]) == 3
