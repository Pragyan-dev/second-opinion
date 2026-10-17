"""Crawler against a respx-served fake site. No real network."""

import httpx
import pytest

from app.config import settings
from app.contracts import Capture
from app.fraud import crawler, net

pytestmark = pytest.mark.respx(assert_all_called=False)

HOME = """<html><head><title>Acme Wealth Partners | Home</title></head><body>
<h1>Acme Wealth Partners</h1>
<p>Welcome. We have served clients for many years with careful planning and plain answers.
This paragraph exists so the extracted text is long enough to skip the browser fallback,
and it keeps going for a while with more ordinary words about planning and service.</p>
<a href="/about">About us</a> <a href="/contact-us">Get in touch: contact</a>
<a href="/files/adv.pdf">ADV brochure</a> <a href="https://other.example/about">Partner</a>
<a href="mailto:Help@acme.test?subject=hi">Email</a> <a href="tel:+1-202-555-0101">Call</a>
<form action="/subscribe" method="post"><input name="email"></form>
</body></html>"""
ABOUT = """<html><body><p>About Acme Wealth Partners. CRD #123456. Our team has decades of
experience. More words here so the page has real content in it for extraction.</p></body></html>"""
CONTACT = """<html><body><p>Reach us at (202) 555-0102 or team@acme.test any weekday.
More words here so the page has real content in it for extraction.</p></body></html>"""


def html(body, status=200):
    return httpx.Response(status, text=body, headers={"content-type": "text/html; charset=utf-8"})


@pytest.fixture
def public_dns(monkeypatch):
    async def resolve(host):
        return ["93.184.216.34"]

    monkeypatch.setattr(net, "resolve", resolve)


def website(url):
    return Capture(source_type="website", url=url, title="t", text="")


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)


def ctx_for(capture, firms=()):
    return {"capture": capture, "signals": [], "errors": {}, "entities": {"firms": list(firms)}}


async def test_three_page_site_with_redirect(respx_mock, public_dns, live):
    respx_mock.get("https://acme.test/").mock(
        return_value=httpx.Response(301, headers={"location": "https://www.acme.test/home"})
    )
    respx_mock.get("https://www.acme.test/home").mock(return_value=html(HOME))
    respx_mock.get("https://www.acme.test/about").mock(return_value=html(ABOUT))
    respx_mock.get("https://www.acme.test/contact-us").mock(return_value=html(CONTACT))
    pdf = respx_mock.get("https://www.acme.test/files/adv.pdf").mock(
        return_value=httpx.Response(
            200, content=b"%PDF", headers={"content-type": "application/pdf"}
        )
    )
    subscribe = respx_mock.post("https://www.acme.test/subscribe")

    ctx = ctx_for(website("https://acme.test/"))
    await crawler.CrawlStep().run(ctx)

    visit = ctx["site_visit"]
    assert visit.start_url == "https://acme.test/"
    assert visit.final_url == "https://www.acme.test/home"
    assert visit.pages_visited == [
        "https://www.acme.test/home",
        "https://www.acme.test/about",
        "https://www.acme.test/contact-us",
    ]
    assert visit.phones == ["+12025550102", "+12025550101"]
    assert visit.emails == ["team@acme.test", "help@acme.test"]
    assert visit.claimed_firm == "Acme Wealth Partners"
    assert visit.claimed_crd == "123456"
    assert ctx["redirect_chain"] == ["https://acme.test/", "https://www.acme.test/home"]
    assert ctx["site_domain"] == "acme.test" and ctx["crawl_ok"]
    assert not any(s.id == "redirect_offsite" for s in ctx["signals"])
    assert not pdf.called and not subscribe.called
    # Second run is served from the cache.
    respx_mock.reset()
    again = ctx_for(website("https://acme.test/"))
    await crawler.CrawlStep().run(again)
    assert again["site_visit"] == visit and not respx_mock.calls


async def test_private_ip_outside_allowlist_is_refused(respx_mock, live):
    route = respx_mock.get("http://10.0.0.5/").mock(return_value=html(HOME))
    ctx = ctx_for(website("http://10.0.0.5/"))
    await crawler.CrawlStep().run(ctx)
    assert not route.called and "site_visit" not in ctx and not ctx["crawl_ok"]
    assert ctx["signals"][0].id == "site_unreachable" and ctx["signals"][0].check == "unknown"


async def test_redirect_into_private_network_is_refused(respx_mock, public_dns, live):
    respx_mock.get("https://evil.test/").mock(
        return_value=httpx.Response(302, headers={"location": "http://169.254.169.254/latest"})
    )
    metadata = respx_mock.get("http://169.254.169.254/latest").mock(return_value=html(HOME))
    ctx = ctx_for(website("https://evil.test/"))
    await crawler.CrawlStep().run(ctx)
    assert not metadata.called and ctx["signals"][0].id == "site_unreachable"


async def test_hostname_resolving_to_loopback_is_refused(respx_mock, monkeypatch, live):
    async def resolve(host):
        return ["127.0.0.1"]

    monkeypatch.setattr(net, "resolve", resolve)
    route = respx_mock.get("https://sneaky.test/").mock(return_value=html(HOME))
    ctx = ctx_for(website("https://sneaky.test/"))
    await crawler.CrawlStep().run(ctx)
    assert not route.called and ctx["signals"][0].id == "site_unreachable"


async def test_allowlisted_local_demo_alias(respx_mock, live):
    route = respx_mock.get("http://127.0.0.1:5500/").mock(
        return_value=html(HOME.replace("Acme Wealth Partners", "Brightwater Capital Advisors"))
    )
    capture = Capture(
        source_type="email",
        url="https://mail.google.com/x",
        title="t",
        text="",
        links=["https://x.com/someone", "https://brightwater-capital.example/"],
    )
    ctx = ctx_for(capture, ["Brightwater Capital Advisors"])
    await crawler.CrawlStep().run(ctx)
    assert route.called
    visit = ctx["site_visit"]
    assert visit.start_url == "https://brightwater-capital.example/"
    assert visit.final_url == "https://brightwater-capital.example/"
    assert ctx["site_domain"] == "brightwater-capital.example"


async def test_offsite_redirect_warns(respx_mock, public_dns, live):
    respx_mock.get("https://short.test/go").mock(
        return_value=httpx.Response(302, headers={"location": "https://landing.example/"})
    )
    respx_mock.get("https://landing.example/").mock(return_value=html(HOME))
    ctx = ctx_for(website("https://short.test/go"))
    await crawler.CrawlStep().run(ctx)
    signal = next(s for s in ctx["signals"] if s.id == "redirect_offsite")
    assert signal.check == "warn" and ctx["site_domain"] == "landing.example"


async def test_response_capped_at_two_megabytes(respx_mock, public_dns):
    big = "<html><body>" + "a" * (3 * 1024 * 1024) + "</body></html>"
    respx_mock.get("https://big.test/").mock(return_value=html(big))
    async with httpx.AsyncClient() as client:
        page = await crawler.fetch(client, "https://big.test/")
    assert len(page.html) == crawler.MAX_BYTES


def test_start_url_skips_social_and_mail():
    capture = Capture(
        source_type="social_post",
        url="https://x.com/a/status/1",
        title="t",
        text="",
        links=[
            "https://t.co/abc",
            "https://mail.google.com/x",
            "mailto:a@b.c",
            "https://firm.test/",
        ],
    )
    assert crawler.pick_start_url(capture) == "https://firm.test/"
    assert crawler.pick_start_url(website("https://site.test/p")) == "https://site.test/p"


async def test_fixture_mode_uses_case_fixture():
    ctx = ctx_for(Capture(source_type="email", url="u", title="t", text="brightwater"))
    ctx["case"] = "fraud_clone.json"
    await crawler.CrawlStep().run(ctx)
    assert ctx["site_visit"].claimed_firm == "Brightwater Capital Advisors"
    assert ctx["site_domain"] == "brightwater-capital.example" and ctx["crawl_ok"]
