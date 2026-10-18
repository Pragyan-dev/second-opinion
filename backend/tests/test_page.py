"""The linked-page report: page warning signs, sensitive forms, and page vs message."""

import json
from pathlib import Path

import httpx
import pytest

from app.config import fixture, settings
from app.contracts import Capture, FraudReport, PageCheck, SiteVisit
from app.fraud import crawler, page
from app.fraud.scoring import score

ROOT = Path(__file__).resolve().parents[2]
DEMO = (ROOT / "demo-site/index.html").read_text()
HOSTED = "https://chirumer.github.io/temporary_hackathon_fake_site/"
SENDER = "Michael Myers <michael.myers@brightwater-capital.example>"


def visit(**extra) -> SiteVisit:
    fields = dict(
        start_url=HOSTED, final_url=HOSTED, pages_visited=[HOSTED],
        claimed_firm="Brightwater Capital", phones=["+12025550199"],
        emails=["offers@brightwater-capital.example"],
    )
    return SiteVisit(**(fields | extra))


def ctx_for(site=None, sender=SENDER, entities=None, html=DEMO):
    capture = Capture(source_type="email", url="u", title="t", text="", sender=sender)
    return {
        "capture": capture, "site_visit": site or visit(), "crawl_ok": True, "errors": {},
        "page_lines": crawler.text_lines(html), "page_title": crawler.page_title(html),
        "sensitive_fields": crawler.sensitive_fields(html),
        "entities": entities if entities is not None else {"firms": ["Brightwater Capital"]},
    }


def by_id(check: PageCheck) -> dict:
    return {r.id: r for r in check.reasons}


def test_demo_page_signs_are_quoted_from_the_page():
    check = page.check(ctx_for())
    reasons = by_id(check)
    assert {"countdown", "scarcity", "endorsement", "too_good", "payment_request",
            "secrecy", "urgency", "exclusivity"} <= set(reasons)
    assert reasons["endorsement"].evidence == "“E.T. approves it.”"
    assert reasons["scarcity"].evidence == "Only 7 VIP spots left · Closes in 24 hours"
    assert reasons["too_good"].evidence == "Guaranteed monthly returns"
    lines = crawler.text_lines(DEMO)
    assert all(r.evidence in " ".join(lines.split()) for r in check.reasons)
    assert check.title == "Brightwater Capital Advisors · Fictional demo"
    assert check.summary.startswith("The linked page (Brightwater Capital Advisors")


def test_page_hosted_away_from_its_contact_domain():
    signals = {s.id: s for s in page.check(ctx_for()).matches_message}
    assert signals["page_firm_match"].check == "pass"
    assert signals["page_email_match"].check == "pass"
    assert signals["page_host_match"].check == "warn"
    assert "chirumer.github.io" in signals["page_host_match"].detail


def test_page_that_differs_from_the_message():
    site = visit(final_url="https://other.test/", claimed_firm="Northwind Wealth",
                 emails=["help@other.test"], phones=["+12025550100"])
    entities = {"firms": ["Brightwater Capital"], "phones": ["+12025550199"], "emails": []}
    signals = {s.id: s for s in page.check(ctx_for(site, entities=entities)).matches_message}
    assert signals["page_firm_match"].check == "warn"
    assert signals["page_email_match"].check == "warn"
    assert signals["page_phone_match"].check == "warn"
    assert "page_host_match" not in signals  # the contact email is on the page's own domain


def test_sensitive_form_fields():
    html = """<html><body><form><label for="c">Card number</label><input id="c" name="x">
      <input type="password" name="pw"><input name="routing_number">
      <input type="hidden" name="password_token"><input name="email"></form></body></html>"""
    assert crawler.sensitive_fields(html) == ["card number", "password", "bank account"]
    reasons = by_id(page.check(ctx_for(html=html)))
    assert reasons["sensitive_form"].weight == 3
    assert "card number, password and bank account" in reasons["sensitive_form"].detail


def test_clean_page():
    html = "<html><head><title>Lunch</title></head><body><p>Menu for Thursday.</p></body></html>"
    check = page.check(ctx_for(visit(claimed_firm=None, emails=[], phones=[]), html=html))
    assert check.reasons == [] and check.matches_message == []
    assert "shows none of the common" in check.summary


async def test_step_skips_websites_and_failed_visits():
    ctx = ctx_for()
    ctx["capture"] = Capture(source_type="website", url="u", title="t", text="")
    await page.PageStep().run(ctx)
    assert "page" not in ctx
    ctx = ctx_for() | {"crawl_ok": False}
    await page.PageStep().run(ctx)
    assert "page" not in ctx


async def test_fixture_mode_uses_the_case_fixture():
    ctx = ctx_for() | {"case": "fraud_clone.json"}
    await page.PageStep().run(ctx)
    assert ctx["page"] == PageCheck.model_validate(fixture("fraud_clone.json")["page"])
    ctx = ctx_for() | {"case": "fraud_real.json"}
    await page.PageStep().run(ctx)
    assert ctx["page"] is None


async def test_llm_summary_and_verbatim_reasons(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    answer = {
        "summary": "The page offers a fictional BRWT allocation with a countdown and VIP spots.",
        "reasons": [
            {"id": "too_good", "detail": "dup", "evidence": "Guaranteed monthly returns"},
            {"id": "credential_request", "detail": "Invented.", "evidence": "enter your password"},
            {"id": "sensitive_form", "detail": "Asks for details.", "evidence": "Contact"},
        ],
    }
    fake_llm([json.dumps(answer)])
    ctx = ctx_for()
    await page.PageStep().run(ctx)
    found = by_id(ctx["page"])
    assert ctx["page"].summary == answer["summary"]
    assert found["too_good"].detail != "dup"  # the pattern reason is kept
    assert "credential_request" not in found  # its evidence is not on the page
    assert found["sensitive_form"].evidence == "Contact"


async def test_llm_failure_keeps_pattern_result(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    ctx = ctx_for()
    await page.PageStep().run(ctx)
    assert "page_llm" in ctx["errors"]
    assert ctx["page"] == page.check(ctx_for())


def test_scoring_counts_page_signs_and_mismatches():
    check = page.check(ctx_for())
    base = {"entities": {"firms": ["A"]}, "signals": [], "jev_scores": []}
    likelihood, _, reason = score(base | {"page": check})
    assert likelihood == min(page_cap(), 5 * (sum(r.weight for r in check.reasons) + 1))
    assert "warning signs on the linked page" in reason
    clean = check.model_copy(update={"reasons": [], "matches_message": []})
    assert score(base | {"page": clean})[0] == 1


def page_cap() -> int:
    from app.fraud.scoring import PAGE_CAP

    return PAGE_CAP


@pytest.mark.respx(assert_all_called=False)
async def test_crawl_returns_page_lines_title_and_fields(respx_mock, monkeypatch):
    from app.fraud import net

    async def resolve(host):
        return ["93.184.216.34"]

    monkeypatch.setattr(net, "resolve", resolve)
    body = DEMO.replace("</body>", '<form><input type="password" name="pw"></form></body>')
    respx_mock.get("https://site.test/").mock(
        return_value=httpx.Response(200, text=body, headers={"content-type": "text/html"})
    )
    result = await crawler.crawl("https://site.test/", [])
    assert "Only 7 VIP spots left · Closes in 24 hours" in result["page_lines"].split("\n")
    assert result["page_title"] == "Brightwater Capital Advisors · Fictional demo"
    assert result["sensitive_fields"] == ["password"]


def test_clone_fixture_page_quotes_the_demo_site():
    report = FraudReport.model_validate(fixture("fraud_clone.json"))
    lines = " ".join(crawler.text_lines(DEMO).split())
    assert report.page and report.page.reasons
    assert all(r.evidence in lines for r in report.page.reasons if r.evidence)
