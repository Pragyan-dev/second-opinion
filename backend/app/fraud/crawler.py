"""Read-only website visit. Owner B.

The crawler only issues GET requests, never submits forms, skips non-HTML responses so nothing
is downloaded, reads at most 2 MB per response, and refuses private, loopback and link-local
addresses on every hop unless the host is in CRAWL_ALLOW_HOSTS.
"""

import logging
import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx
import phonenumbers
import trafilatura
from selectolax.lexbor import LexborHTMLParser as HTMLParser

from app.config import settings
from app.contracts import Capture, Signal, SiteVisit, Source
from app.core import cache
from app.core.steps import case_fixture
from app.fraud.extract import CRD_RE, EMAIL_RE
from app.fraud.net import BlockedURL, check_url_allowed, normalize_phone, registered_domain

log = logging.getLogger(__name__)

SKIP_DOMAINS = {
    "x.com",
    "twitter.com",
    "t.co",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "google.com",
    "gmail.com",
}
KEYWORDS = ("about", "contact", "team", "disclosure", "legal", "adv", "crs")
FILE_EXTENSIONS = re.compile(
    r"\.(pdf|zip|exe|dmg|docx?|xlsx?|pptx?|csv|png|jpe?g|gif|mp4|mp3)$", re.IGNORECASE
)
TITLE_SPLIT = re.compile(r"\s+[|·–—:-]\s+")
MAX_PAGES = 5
MAX_BYTES = 2 * 1024 * 1024
MIN_TEXT = 200
TEXT_CAP = 12000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


@dataclass
class Page:
    url: str
    status: int
    html: str = ""
    chain: list[str] = field(default_factory=list)


class Aliases:
    """Demo host aliases: fetch from a local origin, report the fictional URL."""

    def __init__(self, mapping: dict[str, str]):
        self.forward = {}
        self.reverse = {}
        for host, target in mapping.items():
            target = urlsplit(target)
            self.forward[host] = (target.scheme, target.netloc)
            self.reverse[(target.scheme, target.netloc)] = host

    def fetch_url(self, url: str) -> str:
        parts = urlsplit(url)
        alias = self.forward.get((parts.hostname or "").lower())
        if alias is None:
            return url
        return urlunsplit((alias[0], alias[1], parts.path or "/", parts.query, ""))

    def logical(self, url: str, scheme: str = "https") -> str:
        parts = urlsplit(url)
        host = self.reverse.get((parts.scheme, parts.netloc))
        if host is None:
            return url
        return urlunsplit((scheme, host, parts.path or "/", parts.query, ""))


def pick_start_url(capture: Capture) -> str | None:
    if capture.source_type == "website":
        return capture.url
    for link in capture.links:
        if urlsplit(link).scheme not in ("http", "https"):
            continue
        if registered_domain(link) in SKIP_DOMAINS:
            continue
        return link
    return None


def _strip_fragment(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", parts.query, ""))


async def fetch(client: httpx.AsyncClient, url: str) -> Page:
    async with client.stream("GET", url) as response:
        chain = [str(r.url) for r in response.history] + [str(response.url)]
        page = Page(url=str(response.url), status=response.status_code, chain=chain)
        content_type = response.headers.get("content-type", "").lower()
        if response.status_code >= 400 or "html" not in content_type:
            return page
        body = bytearray()
        async for chunk in response.aiter_bytes():
            body += chunk
            if len(body) >= MAX_BYTES:
                del body[MAX_BYTES:]
                break
        page.html = body.decode(response.encoding or "utf-8", errors="replace")
        return page


def visible_text(html: str) -> str:
    tree = HTMLParser(html)
    for node in tree.css("script, style, noscript"):
        node.decompose()
    body = tree.body or tree.root
    return " ".join(body.text(separator=" ").split()) if body else ""


def page_text(html: str) -> str:
    """Main text via trafilatura, falling back to all visible text for thin results."""
    main = trafilatura.extract(html, favor_recall=True) or ""
    if len(main) >= MIN_TEXT:
        return main
    full = visible_text(html)
    return full if len(full) > len(main) else main


def links_of(html: str, base: str) -> list[tuple[str, str]]:
    return [
        (urljoin(base, a.attributes.get("href") or ""), a.text(strip=True))
        for a in HTMLParser(html).css("a[href]")
    ]


def contact_links(links: list[tuple[str, str]]) -> tuple[list[str], list[str]]:
    phones, emails = [], []
    for href, _ in links:
        if href.lower().startswith("tel:"):
            phone = normalize_phone(href[4:])
            if phone:
                phones.append(phone)
        elif href.lower().startswith("mailto:"):
            address = href[7:].split("?", 1)[0].strip().lower()
            if EMAIL_RE.fullmatch(address):
                emails.append(address)
    return phones, emails


def candidate_pages(links: list[tuple[str, str]], site: str, seen: set[str]) -> list[str]:
    picked = []
    for href, label in links:
        if urlsplit(href).scheme not in ("http", "https"):
            continue
        url = _strip_fragment(href)
        path = urlsplit(url).path.lower()
        if url in seen or url in picked or FILE_EXTENSIONS.search(path):
            continue
        if registered_domain(url) != site:
            continue
        haystack = f"{path} {label.lower()}"
        if any(word in haystack for word in KEYWORDS):
            picked.append(url)
    return picked


def claimed_firm(html: str, text: str, firms: list[str]) -> str | None:
    tree = HTMLParser(html)
    meta = tree.css_first('meta[property="og:site_name"]')
    if meta and (meta.attributes.get("content") or "").strip():
        return meta.attributes["content"].strip()
    lowered = text.lower()
    for firm in firms:
        if firm.lower() in lowered:
            return firm
    title = tree.css_first("title")
    if title and title.text(strip=True):
        return TITLE_SPLIT.split(title.text(strip=True))[0].strip() or None
    return None


async def render_with_browser(url: str) -> str | None:
    """Optional Playwright render for script-heavy pages. Skips quietly if not installed."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return None

    async def route(request_route):
        request = request_route.request
        if request.resource_type not in ("document", "script", "xhr", "fetch"):
            return await request_route.abort()
        try:
            await check_url_allowed(request.url)
        except BlockedURL:
            return await request_route.abort()
        await request_route.continue_()

    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            try:
                context = await browser.new_context(accept_downloads=False, user_agent=USER_AGENT)
                page = await context.new_page()
                await page.route("**/*", route)
                await page.goto(url, wait_until="networkidle", timeout=8000)
                return await page.content()
            finally:
                await browser.close()
    except Exception as exc:
        log.info("playwright render skipped: %s", exc)
        return None


def _dedupe(values) -> list[str]:
    return list(dict.fromkeys(v for v in values if v))


async def crawl(start: str, firms: list[str]) -> dict:
    """Visit the start URL and up to four same-site pages. Returns a cacheable dict."""
    aliases = Aliases(settings.crawl_host_aliases)
    scheme = urlsplit(start).scheme or "https"

    async def guard(request: httpx.Request):
        await check_url_allowed(str(request.url))

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=5,
        max_redirects=5,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
        event_hooks={"request": [guard]},
    ) as client:
        first = await fetch(client, aliases.fetch_url(start))
        if first.status >= 400 or not first.html:
            raise CrawlFailed(f"start page returned HTTP {first.status} with no HTML")
        final = aliases.logical(first.url, scheme)
        site = registered_domain(final)
        pages = [(final, first.html)]
        texts = [page_text(first.html)]
        if len(texts[0]) < MIN_TEXT:
            rendered = await render_with_browser(first.url)
            if rendered:
                pages[0] = (final, rendered)
                texts[0] = page_text(rendered)
        links = links_of(pages[0][1], final)
        seen = {final}
        for url in candidate_pages(links, site, seen)[: MAX_PAGES - 1]:
            try:
                page = await fetch(client, aliases.fetch_url(url))
            except Exception as exc:
                # A broken sub-page never fails the visit.
                log.info("skipping %s: %s", url, exc)
                continue
            logical = aliases.logical(page.url, scheme)
            if not page.html or logical in seen or registered_domain(logical) != site:
                continue
            seen.add(logical)
            pages.append((logical, page.html))
            texts.append(page_text(page.html))
            links += links_of(page.html, logical)

    main_text = "\n\n".join(texts)
    # Contacts and CRD come from all visible text, since main-text extraction drops footers.
    full_text = "\n\n".join(visible_text(html) for _, html in pages)
    tel, mail = contact_links(links)
    phones = [
        phonenumbers.format_number(m.number, phonenumbers.PhoneNumberFormat.E164)
        for m in phonenumbers.PhoneNumberMatcher(full_text, "US")
    ]
    crd = CRD_RE.search(full_text)
    visit = SiteVisit(
        start_url=start,
        final_url=final,
        pages_visited=[url for url, _ in pages],
        claimed_firm=claimed_firm(pages[0][1], main_text + " " + full_text, firms),
        claimed_crd=crd.group(1) if crd else None,
        phones=_dedupe(phones + tel),
        emails=_dedupe([e.lower() for e in EMAIL_RE.findall(full_text)] + mail),
    )
    return {
        "site_visit": visit.model_dump(mode="json"),
        "crawl_text": main_text[:TEXT_CAP],
        "redirect_chain": [aliases.logical(url, scheme) for url in first.chain],
    }


class CrawlFailed(Exception):
    pass


class CrawlStep:
    name = "crawl"
    writes = ("site_visit",)

    async def run(self, ctx: dict) -> None:
        ctx["crawl_ok"] = False
        ctx["crawl_text"] = ""
        if settings.use_fixture(self.name):
            ctx["site_visit"] = SiteVisit.model_validate(case_fixture(ctx)["site_visit"])
            ctx["redirect_chain"] = [ctx["site_visit"].start_url, ctx["site_visit"].final_url]
            ctx["crawl_ok"] = True
        else:
            start = pick_start_url(ctx["capture"])
            if start is None:
                return
            key = f"crawl:{start}"
            result = await cache.get(key)
            if result is None:
                try:
                    result = await crawl(start, ctx.get("entities", {}).get("firms", []))
                except (httpx.HTTPError, BlockedURL, CrawlFailed) as exc:
                    ctx["signals"].append(
                        Signal(
                            id="site_unreachable",
                            label="Website could not be visited",
                            check="unknown",
                            detail=f"The linked website was not read: {exc}",
                            source=Source(title="Linked website", url=start),
                        )
                    )
                    return
                await cache.set(key, result, cache.CRAWL_TTL)
            ctx["site_visit"] = SiteVisit.model_validate(result["site_visit"])
            ctx["crawl_text"] = result["crawl_text"]
            ctx["redirect_chain"] = result["redirect_chain"]
            ctx["crawl_ok"] = True
        visit = ctx["site_visit"]
        ctx["site_domain"] = registered_domain(visit.final_url)
        start_domain = registered_domain(visit.start_url)
        if ctx["site_domain"] != start_domain:
            ctx["signals"].append(
                Signal(
                    id="redirect_offsite",
                    label="Link redirects to another site",
                    check="warn",
                    detail=f"The link to {start_domain} ended on {ctx['site_domain']}.",
                    source=Source(title="Final page after redirects", url=visit.final_url),
                    weight=1,
                )
            )
