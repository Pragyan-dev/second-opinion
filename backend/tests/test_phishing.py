"""Phishing reasons, the requested link, and the email_title/email_body capture fields."""

import json

import pytest
from fastapi.testclient import TestClient

from app import main, mock
from app.config import settings
from app.contracts import Capture, FraudReport, PhishingReason
from app.fraud import crawler, phishing
from app.fraud.extract import email_content, regex_entities
from app.fraud.scoring import score

# The fake email sample from the demo inbox, as Mailpit serves it.
SAMPLE = """Dear Ryan,

I hope this email finds you well.

My name is Michael Myers, Senior Wealth Manager at Brightwater Capital.

Following up on our recent market analysis, I am reaching out to present an exclusive, \
time-sensitive investment opportunity normally reserved for our institutional clients.

We have secured a limited allocation for a high-growth Pre-IPO tech stock. Based on current \
market trends, our analysts project a guaranteed return of 18.5% within the first quarter, with \
minimal risk to your principal capital.

If you are interested in learning more, you can visit our portal below to explore the investor \
onboarding experience.

Investor Portal
https://brightwater-capitals.example/

Please review our website for details about disclosures. We look forward to growing your portfolio

Regards,
Michael Myers
Investment Relations
Brightwater Capitals"""
SENDER = "Michael Myers <michael.myers@brightwater-capital.example>"


def sample(**extra) -> Capture:
    fields = dict(
        source_type="email",
        url="http://localhost:8025/view/abc",
        title="fake email",
        text=SAMPLE,
        sender=SENDER,
        email_title="fake email",
        email_body=SAMPLE,
    )
    return Capture(**(fields | extra))


def ids(check) -> list[str]:
    return [r.id for r in check.reasons]


def test_sample_gives_reasons_and_the_requested_link():
    check = phishing.check(sample())
    assert check.link_requested == "https://brightwater-capitals.example/"
    assert check.email_title == "fake email" and check.sender == SENDER
    assert ids(check)[0] == "lookalike_domain"
    assert {"lookalike_domain", "too_good", "urgency", "link_request"} <= set(ids(check))
    asks = next(r for r in check.reasons if r.id == "link_request")
    assert "visit our portal below" in asks.evidence
    assert check.summary.startswith("This email could be phishing")
    # Every quote is verbatim from the email.
    squashed = " ".join(SAMPLE.split())
    assert all(r.evidence in squashed for r in check.reasons if r.evidence)


def test_link_text_that_shows_another_address():
    body = "Your account is locked. Sign in at paypal.com/login <https://login.evil.test/x> today."
    check = phishing.check(sample(email_body=body, sender="PayPal <service@paypal.com>"))
    assert {"link_text_mismatch", "threat", "link_request"} <= set(ids(check))
    assert check.link_requested == "https://login.evil.test/x"


def test_free_mail_business_and_suspicious_link():
    body = "Dear customer, verify your bank account at http://192.0.2.7/verify within 24 hours."
    check = phishing.check(sample(email_body=body, sender="Acme Bank <acme.bank@gmail.com>"))
    found = set(ids(check))
    assert {"free_mail_sender", "credential_request", "generic_greeting"} <= found
    assert {"suspicious_link", "urgency"} <= found


def test_ordinary_email_has_no_signs():
    body = "Hi Ryan,\n\nLunch moved to Thursday at noon.\n\nThanks, Sam"
    sender = "Sam <sam@team.test>"
    check = phishing.check(sample(email_body=body, email_title="Lunch", sender=sender))
    assert check.reasons == [] and check.link_requested is None
    assert check.summary == "We found none of the common signs of phishing in this email."


def test_email_fields_take_precedence_over_title_and_text():
    capture = sample(title="t", text="old text", email_body="Call +1 202 555 0199 now")
    assert email_content(capture) == ("fake email", "Call +1 202 555 0199 now")
    assert regex_entities(capture)["phones"] == ["+12025550199"]
    plain = Capture(source_type="email", url="u", title="Subject", text="Body")
    assert email_content(plain) == ("Subject", "Body")


async def test_step_skips_non_email():
    ctx = {"capture": Capture(source_type="website", url="u", title="t", text=""), "errors": {}}
    await phishing.PhishingStep().run(ctx)
    assert "phishing" not in ctx


async def test_llm_reasons_need_verbatim_evidence(fake_llm, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    answer = {
        "link_url": "",
        "summary": "The email could be phishing: it promises returns and points to another site.",
        "reasons": [
            {"id": "impersonation", "detail": "A title.", "evidence": "Senior Wealth Manager"},
            {"id": "secrecy", "detail": "Invented.", "evidence": "keep this between us"},
            {"id": "not_a_reason", "detail": "x", "evidence": "Dear Ryan"},
        ],
    }
    fake_llm([json.dumps(answer)])
    ctx = {"capture": sample(), "errors": {}}
    await phishing.PhishingStep().run(ctx)
    found = ids(ctx["phishing"])
    assert "impersonation" in found and "secrecy" not in found and "not_a_reason" not in found
    assert ctx["phishing"].summary == answer["summary"]
    assert ctx["link_requested"] == "https://brightwater-capitals.example/"


async def test_llm_failure_keeps_pattern_result(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    ctx = {"capture": sample(), "errors": {}}
    await phishing.PhishingStep().run(ctx)  # no API key: the LLM call fails
    assert "phishing_llm" in ctx["errors"]
    assert ctx["phishing"] == phishing.check(sample())


async def test_crawl_opens_the_requested_link(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    visited = []

    async def fake_crawl(start, firms):
        visited.append(start)
        raise crawler.CrawlFailed("offline test")

    monkeypatch.setattr(crawler, "crawl", fake_crawl)
    capture = sample(links=["https://first.test/", "https://brightwater-capitals.example/"])
    ctx = {"capture": capture, "signals": [], "errors": {}, "entities": {"firms": []},
           "link_requested": "https://brightwater-capitals.example/"}
    await crawler.CrawlStep().run(ctx)
    assert visited == ["https://brightwater-capitals.example/"]
    # Without a requested link, a URL written in the text is still followed.
    ctx = {"capture": sample(links=[], email_body="See https://plain.test/page"), "signals": [],
           "errors": {}, "entities": {}, "urls": ["https://plain.test/page"]}
    await crawler.CrawlStep().run(ctx)
    assert visited[-1] == "https://plain.test/page"


def test_scoring_counts_phishing_signs_without_a_firm_or_site():
    ctx = {"entities": {"firms": []}, "crawl_ok": False, "signals": [], "jev_scores": [],
           "phishing": phishing.check(sample())}
    likelihood, band, reason = score(ctx)
    assert likelihood == phishing_points(ctx) and band != "cant_tell"
    assert "common phishing signs in the email" in reason
    only_asks = ctx["phishing"].model_copy(update={"reasons": [
        PhishingReason(id="link_request", label="Asks you to open a link", detail="d")
    ]})
    assert score(ctx | {"phishing": only_asks})[1] == "cant_tell"


def phishing_points(ctx) -> int:
    from app.fraud.scoring import PHISHING_CAP, PHISHING_POINTS

    weight = sum(r.weight for r in ctx["phishing"].reasons if r.id != "link_request")
    return min(PHISHING_CAP, PHISHING_POINTS * weight)


@pytest.fixture(params=[main.app, mock.app], ids=["real", "mock"])
def client(request, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "database", tmp_path / "jobs.sqlite")
    mock.jobs.clear()
    with TestClient(request.param) as client:
        yield client


def test_analyze_reports_phishing_for_email_fields(client):
    capture = sample().model_dump()
    response = client.post("/v1/fraud/analyze", json=capture)
    assert response.status_code == 202
    path = f"/v1/fraud/{response.json()['report_id']}"
    for _ in range(200):
        report = FraudReport.model_validate(client.get(path).json())
        if report.status == "done":
            break
    assert report.phishing is not None
    assert report.phishing.link_requested == "https://brightwater-capitals.example/"
    assert "lookalike_domain" in ids(report.phishing)


def test_email_body_length_is_limited(client):
    capture = sample(email_body="a" * 20001).model_dump()
    response = client.post("/v1/fraud/analyze", json=capture)
    assert response.status_code == 422
