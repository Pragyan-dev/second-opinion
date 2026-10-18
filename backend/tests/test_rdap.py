"""RDAP fixtures for fictional domains and a mocked rdap.org response."""

from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from app.config import fixture, settings
from app.contracts import SiteVisit
from app.fraud import rdap

pytestmark = pytest.mark.respx(assert_all_called=False)


def ctx_with_site(url, emails=()):
    visit = SiteVisit(start_url=url, final_url=url, pages_visited=[url], emails=list(emails))
    domain = rdap.registered_domain(url)
    return {"site_visit": visit, "site_domain": domain, "signals": [], "errors": {}, "entities": {}}


async def test_example_domains_read_fixtures_only_in_fixture_mode(respx_mock):
    route = respx_mock.get(url__regex=r"https://rdap\.org/.*")
    ctx = ctx_with_site(
        "https://brightwater-capital.example/", ["help@brightwater-advisors.example"]
    )
    await rdap.RdapStep().run(ctx)
    assert not route.called
    assert ctx["site_visit"].domain_age_days == 21
    assert ctx["domain_ages"] == {
        "brightwater-capital.example": 21,
        "brightwater-advisors.example": 3287,
    }
    signal = ctx["signals"][0]
    assert signal.id == "domain_age" and signal.check == "fail"
    assert signal.source.url == "https://rdap.org/domain/brightwater-capital.example"


async def test_fixture_only_domain_without_fixture_is_unknown(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    route = respx_mock.get(url__regex=r"https://rdap\.org/.*")
    ctx = ctx_with_site("https://nothing-here.example/")
    await rdap.RdapStep().run(ctx)
    assert not route.called and ctx["signals"][0].check == "unknown"


async def test_live_reserved_domain_does_not_use_bundled_age(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    route = respx_mock.get(url__regex=r"https://rdap\.org/.*")
    ctx = ctx_with_site("https://brightwater-capital.example/")
    await rdap.RdapStep().run(ctx)
    assert not route.called
    assert ctx["site_visit"].domain_age_days is None
    assert ctx["signals"][0].check == "unknown"


async def test_live_public_domain_ignores_existing_fixture(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    registered = (datetime.now(timezone.utc) - timedelta(days=500)).isoformat()
    route = respx_mock.get("https://rdap.org/domain/troweprice.com").mock(
        return_value=httpx.Response(200, json={
            "events": [{"eventAction": "registration", "eventDate": registered}]
        })
    )
    ctx = ctx_with_site("https://www.troweprice.com/")
    await rdap.RdapStep().run(ctx)
    assert route.called and ctx["site_visit"].domain_age_days == 500
    assert "fixture" not in ctx["signals"][0].source.title


async def test_live_rdap_parses_registration_date(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    registered = (datetime.now(timezone.utc) - timedelta(days=200)).strftime("%Y-%m-%dT%H:%M:%SZ")
    respx_mock.get("https://rdap.org/domain/newfirm.com").mock(
        return_value=httpx.Response(
            302, headers={"location": "https://rdap.verisign.com/com/v1/domain/newfirm.com"}
        )
    )
    respx_mock.get("https://rdap.verisign.com/com/v1/domain/newfirm.com").mock(
        return_value=httpx.Response(
            200,
            json={
                "ldhName": "NEWFIRM.COM",
                "events": [
                    {"eventAction": "expiration", "eventDate": "2030-01-01T00:00:00Z"},
                    {"eventAction": "registration", "eventDate": registered},
                ],
            },
        )
    )
    ctx = ctx_with_site("https://www.newfirm.com/")
    await rdap.RdapStep().run(ctx)
    assert ctx["site_visit"].domain_age_days == 200
    assert ctx["signals"][0].check == "warn"


async def test_live_failure_is_unknown(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    respx_mock.get("https://rdap.org/domain/down.com").mock(return_value=httpx.Response(503))
    ctx = ctx_with_site("https://down.com/")
    await rdap.RdapStep().run(ctx)
    assert ctx["signals"][0].check == "unknown"
    assert ctx["site_visit"].domain_age_days is None


async def test_fixture_mode_never_calls_network(respx_mock):
    route = respx_mock.get(url__regex=r"https://rdap\.org/.*")
    ctx = ctx_with_site("https://unknown-live.com/")
    await rdap.RdapStep().run(ctx)
    assert not route.called and ctx["signals"][0].check == "unknown"


def test_thresholds_and_fixture_dates():
    assert rdap.domain_signal("a.com", 89, False).check == "fail"
    assert rdap.domain_signal("a.com", 364, False).check == "warn"
    assert rdap.domain_signal("a.com", 365, False).check == "pass"
    data = fixture("rdap/brightwater-advisors.example.json")
    assert rdap.registration_date(data) == date(2017, 10, 17)
    assert rdap.age_days({"events": data["events"]}, today=date(2017, 10, 27)) == 10
