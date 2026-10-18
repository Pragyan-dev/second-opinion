"""BrokerCheck fixture slugs, CRD lookup, and a mocked live search."""

import asyncio
import json

import httpx
import pytest

from app.config import settings
from app.contracts import SiteVisit
from app.fraud import brokercheck

pytestmark = pytest.mark.respx(assert_all_called=False)


def ctx_for(firms=(), crd=None, claimed=None):
    visit = SiteVisit(
        start_url="https://a.test/",
        final_url="https://a.test/",
        pages_visited=[],
        claimed_firm=claimed,
        claimed_crd=crd,
    )
    return {"site_visit": visit, "entities": {"firms": list(firms)}, "crds": [], "signals": []}


def test_slugs():
    assert brokercheck.slugs("Brightwater Capital Advisors, LLC") == [
        "brightwater-capital-advisors",
        "brightwatercapitaladvisors",
        "brightwater",
    ]
    assert brokercheck.slugs("T. Rowe Price") == ["t-rowe-price", "troweprice", "t"]


async def test_fixture_by_firm_name():
    ctx = ctx_for(["Brightwater Capital Advisors"])
    await brokercheck.BrokercheckStep().run(ctx)
    contact = ctx["official_contact"]
    assert contact.phone == "+1-202-555-0148"
    assert contact.website == "https://brightwater-advisors.example"
    assert ctx["signals"][0].id == "firm_record" and ctx["signals"][0].check == "pass"


async def test_fixture_by_crd_and_placeholder_keys_stripped():
    ctx = ctx_for(crd="DEMO-482619")
    await brokercheck.BrokercheckStep().run(ctx)
    assert ctx["official_contact"].firm == "Brightwater Capital Advisors"
    ctx = ctx_for(["T. Rowe Price"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert ctx["official_contact"].website == "https://www.troweprice.com/"


async def test_unknown_firm_without_live_lookup_is_unknown():
    ctx = ctx_for(["Nobody Wealth Partners"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert "official_contact" not in ctx
    assert ctx["signals"][0].check == "unknown"


def search_hit(name, crd, branches=0, bd=None):
    source = {"firm_name": name, "firm_source_id": crd, "firm_branches_count": branches}
    if bd:
        source["firm_bd_sec_number"] = bd
    return {"_source": source}


def test_best_hit_prefers_broker_dealer_then_branches():
    hits = [
        search_hit("T. ROWE PRICE JAPAN, INC.", "290585"),
        search_hit("T. ROWE PRICE ADVISORY SERVICES, INC.", "108958", branches=505),
        search_hit("T. ROWE PRICE INVESTMENT SERVICES, INC.", "8348", branches=34, bd="25130"),
        search_hit("Unrelated Partners", "1"),
    ]
    assert brokercheck.best_hit({"hits": {"hits": hits}}, "T. Rowe Price") == "8348"
    assert brokercheck.best_hit({"hits": {"hits": hits[3:]}}, "T. Rowe Price") is None


def firm_detail(name, crd, phone):
    content = {
        "basicInformation": {"firmId": int(crd), "firmName": name},
        "firmAddressDetails": {"businessPhoneNumber": phone},
    }
    return {"hits": {"hits": [{"_source": {"content": json.dumps(content)}}]}}


async def test_live_search_match_and_not_found(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0)
    hits = [
        search_hit("ACME WEALTH PARTNERS JAPAN, INC.", "999", branches=0),
        search_hit("ACME WEALTH PARTNERS, LLC", "1234", branches=40),
    ]
    search = respx_mock.get(settings.brokercheck_search_url)
    search.side_effect = [
        httpx.Response(200, json={"hits": {"hits": hits}}),
        httpx.Response(200, json={"hits": {"hits": []}}),
    ]
    detail = respx_mock.get(f"{settings.brokercheck_search_url}/1234").mock(
        return_value=httpx.Response(
            200, json=firm_detail("ACME WEALTH PARTNERS, LLC", "1234", "(202) 555-0177")
        )
    )
    ctx = ctx_for(["Acme Wealth Partners"])
    await brokercheck.BrokercheckStep().run(ctx)
    contact = ctx["official_contact"]
    assert contact.crd == "1234" and contact.phone == "+12025550177"
    assert contact.website is None and contact.source.url.endswith("/1234")
    assert search.calls[0].request.url.params["query"] == "Acme Wealth Partners"
    assert detail.call_count == 1

    ctx = ctx_for(["Ghost Capital"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert ctx["signals"][0].id == "firm_not_found" and ctx["signals"][0].check == "fail"
    # Cached: no third search.
    await brokercheck.BrokercheckStep().run(ctx_for(["Ghost Capital"]))
    assert search.call_count == 2


async def test_live_lookup_by_crd_uses_detail_endpoint(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0)
    detail = respx_mock.get(f"{settings.brokercheck_search_url}/8348").mock(
        return_value=httpx.Response(
            200,
            json=firm_detail("T. ROWE PRICE INVESTMENT SERVICES, INC.", "8348", "(410) 345-2000"),
        )
    )
    ctx = ctx_for(crd="CRD 8348")
    await brokercheck.BrokercheckStep().run(ctx)
    assert detail.called and ctx["official_contact"].phone == "+14103452000"


async def test_live_firm_with_bundled_placeholder_uses_real_lookup(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0)
    route = respx_mock.get(settings.brokercheck_search_url).mock(
        return_value=httpx.Response(200, json={"hits": {"hits": [
            search_hit("T. ROWE PRICE INVESTMENT SERVICES, INC.", "8348", bd="25130")
        ]}})
    )
    respx_mock.get(f"{settings.brokercheck_search_url}/8348").mock(
        return_value=httpx.Response(200, json=firm_detail(
            "T. ROWE PRICE INVESTMENT SERVICES, INC.", "8348", "(410) 345-2000"
        ))
    )
    ctx = ctx_for(["T. Rowe Price"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert route.called
    contact = ctx["official_contact"]
    assert contact.crd == "8348" and contact.phone == "+14103452000"
    assert contact.firm == "T. ROWE PRICE INVESTMENT SERVICES, INC."
    assert contact.website is None and contact.source.title == "FINRA BrokerCheck"


async def test_live_failure_never_substitutes_a_placeholder(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    respx_mock.get(settings.brokercheck_search_url).mock(return_value=httpx.Response(503))
    ctx = ctx_for(["T. Rowe Price"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert "official_contact" not in ctx
    assert ctx["signals"][0].check == "unknown"


async def test_live_disabled_does_not_enable_fixture_fallback(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", False)
    assert await brokercheck.lookup("Brightwater Capital Advisors", "DEMO-482619") == (
        None, False
    )


async def test_live_error_is_unknown(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0)
    respx_mock.get(settings.brokercheck_search_url).mock(return_value=httpx.Response(500))
    ctx = ctx_for(["Acme Wealth Partners"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert ctx["signals"][0].check == "unknown"


async def test_throttle_spaces_requests(monkeypatch):
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0.2)
    throttle = brokercheck._Throttle()
    loop = asyncio.get_running_loop()
    start = loop.time()
    for _ in range(3):
        await throttle.wait()
    assert loop.time() - start >= 0.4
