"""Regex and LLM entity extraction."""

from app.config import fixture, settings
from app.contracts import Capture
from app.fraud.extract import ExtractStep, heuristic_firms, regex_entities


def ctx_for(name):
    capture = Capture.model_validate(fixture(f"captures/{name}"))
    case = "fraud_clone.json" if "brightwater" in name else "fraud_real.json"
    return {"capture": capture, "case": case, "signals": [], "errors": {}}


def test_regex_pass():
    capture = Capture(
        source_type="email",
        url="https://mail.example/1",
        title="Hi",
        text="Call (202) 555-0199 or mail Bob@Firm.example. CRD #123456. Watch $brwt now: "
        "https://firm.example/offer.",
        tickers=["ACME"],
    )
    found = regex_entities(capture)
    assert found["phones"] == ["+12025550199"]
    assert found["emails"] == ["bob@firm.example"]
    assert found["crds"] == ["123456"]
    assert found["tickers"] == ["BRWT", "ACME"]
    assert found["urls"] == ["https://firm.example/offer"]
    assert found["domains"] == ["firm.example"]


async def test_fixture_mode_merges_fixture_names():
    ctx = ctx_for("email_brightwater.json")
    await ExtractStep().run(ctx)
    entities = ctx["entities"]
    assert entities["firms"] == ["Brightwater Capital Advisors"]
    assert entities["phones"] == ["+12025550199"]
    assert "brightwater-capital.example" in entities["domains"]
    assert entities["tickers"] == ["BRWT"]


async def test_live_mode_uses_llm(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    fake = fake_llm(
        ['{"firms": ["Brightwater Capital Advisors"], "people": ["Ann"], '
         '"claimed_affiliations": ["FINRA member"]}']
    )
    ctx = ctx_for("email_brightwater.json")
    await ExtractStep().run(ctx)
    assert ctx["entities"]["firms"] == ["Brightwater Capital Advisors"]
    assert ctx["entities"]["people"] == ["Ann"]
    assert ctx["claimed_affiliations"] == ["FINRA member"]
    assert "untrusted" in fake.calls[0]["messages"][0]["content"]


async def test_live_mode_without_llm_falls_back_to_heuristics(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    ctx = ctx_for("email_brightwater.json")
    await ExtractStep().run(ctx)
    assert ctx["entities"]["firms"][0] == "Brightwater Capital Advisors"
    assert "extract_llm" in ctx["errors"]


def test_heuristic_firms_ignores_plain_names():
    capture = Capture(source_type="email", url="u", title="t", text="hello", sender="Ann <a@b.c>")
    assert heuristic_firms(capture) == []
