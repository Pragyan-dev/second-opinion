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


async def test_live_search_match_and_not_found(respx_mock, monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "live_brokercheck", True)
    monkeypatch.setattr(brokercheck, "THROTTLE_S", 0)
    content = {"basicInformation": {"firmId": 1234, "firmName": "ACME WEALTH PARTNERS"},
               "phone": "(202) 555-0177"}
    hit = {"_source": {"content": json.dumps(content)}}
    route = respx_mock.get(settings.brokercheck_search_url)
    route.side_effect = [
        httpx.Response(200, json={"hits": {"hits": [hit]}}),
        httpx.Response(200, json={"hits": {"hits": []}}),
    ]
    ctx = ctx_for(["Acme Wealth Partners"])
    await brokercheck.BrokercheckStep().run(ctx)
    contact = ctx["official_contact"]
    assert contact.crd == "1234" and contact.phone == "+12025550177"
    assert contact.source.url.endswith("/1234")
    assert route.calls[0].request.url.params["query"] == "Acme Wealth Partners"

    ctx = ctx_for(["Ghost Capital"])
    await brokercheck.BrokercheckStep().run(ctx)
    assert ctx["signals"][0].id == "firm_not_found" and ctx["signals"][0].check == "fail"
    # Cached: no third request.
    await brokercheck.BrokercheckStep().run(ctx_for(["Ghost Capital"]))
    assert route.call_count == 2


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
