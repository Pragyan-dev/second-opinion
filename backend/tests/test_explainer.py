"""Explainer wording rules, citation filtering, and the stock summary."""

import json

import pytest

from app.agents.llm import explainer
from app.config import fixture, settings
from app.contracts import AgentResult, Capture, Signal, Source


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)


RECORD = Source(title="Official record", url="https://records.test/bw")


def fraud_ctx(tickers=()):
    return {
        "capture": Capture.model_validate(fixture("captures/email_brightwater.json")),
        "case": "fraud_clone.json",
        "entities": {"tickers": list(tickers), "firms": ["Brightwater Capital Advisors"]},
        "signals": [
            Signal(
                id="phone_match", label="Phone differs", check="fail", detail="x", source=RECORD
            ),
            Signal(id="website_match", label="Website differs", check="fail", detail="y"),
        ],
        "errors": {},
    }


async def test_fraud_explanation(fake_llm, live):
    fake = fake_llm(["The phone number does not match the official record."])
    ctx = fraud_ctx()
    await explainer.ExplainerStep().run(ctx)
    assert ctx["explanation"] == "The phone number does not match the official record."
    assert ctx["stock_research_id"] is None and ctx["stock_pros"] == []
    assert "Phone differs" in fake.calls[0]["messages"][1]["content"]


async def test_forbidden_wording_retried_once(fake_llm, live):
    fake = fake_llm(["You should sell now.", "The website does not match the official record."])
    ctx = fraud_ctx()
    await explainer.ExplainerStep().run(ctx)
    assert ctx["explanation"] == "The website does not match the official record."
    assert len(fake.calls) == 2


async def test_second_failure_uses_template(fake_llm, live):
    fake_llm(["Buy it today.", "This firm is a fraud."])
    ctx = fraud_ctx()
    await explainer.ExplainerStep().run(ctx)
    assert ctx["explanation"] == (
        "We compared the message and the linked website with the official record. "
        "The phone number and website do not match the official record. Confirm the sender "
        "using the contact details in the official record."
    )
    assert not explainer.unsafe(ctx["explanation"])


async def test_llm_unavailable_uses_template(live):
    ctx = fraud_ctx()
    await explainer.ExplainerStep().run(ctx)
    assert "do not match the official record" in ctx["explanation"]


async def test_tickers_start_stock_job_and_drop_uncited(fake_llm, live, monkeypatch):
    started = {}

    async def start(symbol, source_url=None):
        started["symbol"] = symbol
        return "stock-1"

    async def wait(job_id, timeout):
        section = AgentResult(
            agent="market",
            status="done",
            data={"price": 0.84},
            sources=[Source(title="Market data", url="https://data.test/brwt")],
        )
        return {"sections": {"market": section.model_dump()}}

    monkeypatch.setattr(explainer.orchestrator, "start_stock_job", start)
    monkeypatch.setattr(explainer.orchestrator, "wait_for_sections", wait)
    pros_cons = {
        "pros": [
            {"text": "A year of price history exists.", "source_url": "https://data.test/brwt"}
        ],
        "cons": [
            {"text": "Contact details differ.", "source_url": "https://records.test/bw"},
            {"text": "Invented claim.", "source_url": "https://made-up.test/"},
        ],
    }
    fake_llm(["The phone does not match the official record.", json.dumps(pros_cons)])
    ctx = fraud_ctx(tickers=["BRWT"])
    await explainer.ExplainerStep().run(ctx)
    assert started["symbol"] == "BRWT" and ctx["stock_research_id"] == "stock-1"
    assert [p.text for p in ctx["stock_pros"]] == ["A year of price history exists."]
    assert ctx["stock_pros"][0].source.title == "Market data"
    assert [c.text for c in ctx["stock_cons"]] == ["Contact details differ."]


def stock_ctx():
    demo = fixture("stock_demo.json")
    sections = {k: AgentResult.model_validate(v) for k, v in demo["sections"].items()}
    return {"symbol": "BRWT", "sections": sections}


async def test_explain_stock_live(fake_llm, live):
    answer = {
        "summary": "BRWT trades on OTC markets with high volume.",
        "pros": [
            {
                "text": "Price history is available.",
                "source_url": "https://example.com/fixtures/brwt",
            }
        ],
        "cons": [
            {
                "text": "Coverage is mostly press releases.",
                "source_url": "https://example.com/news/brwt-1",
            },
            {"text": "Uncited.", "source_url": "https://elsewhere.test/"},
        ],
        "questions": ["Who audits the company?"],
    }
    fake_llm([json.dumps(answer)])
    out = await explainer.explain_stock(stock_ctx())
    assert out["summary"].startswith("BRWT trades")
    assert len(out["pros"]) == 1 and len(out["cons"]) == 1
    assert out["questions"][0] == "Who audits the company?" and len(out["questions"]) == 3
    assert len(out["articles"]) == 9


async def test_explain_stock_template_on_forbidden(fake_llm, live):
    bad = {"summary": "Invest now.", "pros": [], "cons": [], "questions": []}
    fake_llm([json.dumps(bad), json.dumps(bad)])
    out = await explainer.explain_stock(stock_ctx())
    assert out["pros"] == [] and out["questions"] == explainer.DEFAULT_QUESTIONS
    assert not explainer.unsafe(out["summary"])


async def test_explain_stock_fixture_mode():
    out = await explainer.explain_stock(stock_ctx())
    assert out["summary"] == fixture("stock_demo.json")["summary"] and len(out["articles"]) == 9
