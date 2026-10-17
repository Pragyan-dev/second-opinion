"""Official firm record from BrokerCheck: fixtures first, optional live search. Owner B."""

import asyncio
import json
import logging
import re

import httpx
from rapidfuzz import fuzz

from app.config import FIXTURES, settings
from app.contracts import OfficialContact, Signal, Source
from app.core import cache
from app.fraud.net import normalize_phone

log = logging.getLogger(__name__)

LEGAL_SUFFIXES = {"llc", "inc", "lp", "ltd", "co"}
MATCH_THRESHOLD = 85
THROTTLE_S = 2.0
FIRM_PAGE = "https://brokercheck.finra.org/firm/summary/{crd}"


def slugs(firm: str) -> list[str]:
    """Fixture names to try: hyphenated words, joined words, then the first word."""
    words = [w for w in re.sub(r"[^\w\s]", " ", firm.lower()).split() if w not in LEGAL_SUFFIXES]
    if not words:
        return []
    return list(dict.fromkeys(["-".join(words), "".join(words), words[0]]))


def _contact(data: dict) -> OfficialContact:
    return OfficialContact.model_validate({k: v for k, v in data.items() if not k.startswith("_")})


def _fixtures() -> list[OfficialContact]:
    return [_contact(json.loads(p.read_text())) for p in (FIXTURES / "brokercheck").glob("*.json")]


def fixture_by_firm(firm: str) -> OfficialContact | None:
    for slug in slugs(firm):
        path = FIXTURES / "brokercheck" / f"{slug}.json"
        if path.is_file():
            return _contact(json.loads(path.read_text()))
    return None


def fixture_by_crd(crd: str) -> OfficialContact | None:
    digits = re.sub(r"\D", "", crd)
    for contact in _fixtures():
        if contact.crd and (contact.crd == crd or re.sub(r"\D", "", contact.crd) == digits):
            return contact
    return None


class _Throttle:
    """At most one live request every THROTTLE_S seconds, per event loop."""

    def __init__(self):
        self.loop = None
        self.lock = None
        self.last = float("-inf")

    async def wait(self):
        loop = asyncio.get_running_loop()
        if self.loop is not loop:
            self.loop, self.lock = loop, asyncio.Lock()
        async with self.lock:
            delay = self.last + THROTTLE_S - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            self.last = loop.time()


_throttle = _Throttle()


def parse_search(data: dict, query: str) -> OfficialContact | None:
    """Pick the best firm hit from a BrokerCheck search response.

    TODO(B): confirm field names against a real response from the BrokerCheck network tab.
    """
    best, best_score = None, 0.0
    for hit in data.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        content = source.get("content", source)
        if isinstance(content, str):
            try:
                content = json.loads(content)
            except json.JSONDecodeError:
                continue
        basic = content.get("basicInformation", content)
        name = basic.get("firmName") or basic.get("firm_name") or source.get("firm_name")
        crd = basic.get("firmId") or basic.get("firm_source_id") or source.get("firm_source_id")
        if not name or not crd:
            continue
        score = fuzz.token_set_ratio(name.lower(), query.lower())
        if score > best_score:
            phone = next(
                (str(v) for k, v in _walk(content) if "phone" in k.lower() and v), None
            )
            best_score = score
            best = OfficialContact(
                firm=name,
                crd=str(crd),
                phone=normalize_phone(phone) if phone else None,
                website=None,
                source=Source(title="FINRA BrokerCheck", url=FIRM_PAGE.format(crd=crd)),
            )
    return best if best_score >= MATCH_THRESHOLD else None


def _walk(node, key=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v, key)
    else:
        yield key, node


async def fetch_search(query: str) -> dict:
    """One raw BrokerCheck search request (no cache, no throttle)."""
    async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
        response = await client.get(
            settings.brokercheck_search_url,
            params={
                "query": query,
                "hl": "true",
                "nrows": "12",
                "start": "0",
                "r": "25",
                "sort": "score desc",
                "wt": "json",
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()


async def live_search(query: str) -> OfficialContact | None:
    key = f"bc:{' '.join(slugs(query)[:1]) or query.lower()}"
    cached = await cache.get(key)
    if cached is not None:
        return _contact(cached["contact"]) if cached["contact"] else None
    await _throttle.wait()
    contact = parse_search(await fetch_search(query), query)
    stored = {"contact": contact.model_dump(mode="json") if contact else None}
    await cache.set(key, stored, cache.BROKERCHECK_TTL)
    return contact


def live_enabled() -> bool:
    return settings.live_brokercheck and not settings.use_fixture("brokercheck")


async def lookup(firm: str | None, crd: str | None) -> tuple[OfficialContact | None, bool]:
    """Return (contact, searched_live). Raises on live lookup errors."""
    if crd and (found := fixture_by_crd(crd)):
        return found, False
    if firm and (found := fixture_by_firm(firm)):
        return found, False
    if not live_enabled():
        return None, False
    for query in (crd, firm):
        if query and (found := await live_search(query)):
            return found, True
    return None, True


class BrokercheckStep:
    name = "brokercheck"
    writes = ("official_contact",)

    async def run(self, ctx: dict) -> None:
        visit = ctx.get("site_visit")
        firms = list(ctx.get("entities", {}).get("firms", []))
        if visit and visit.claimed_firm:
            firms.insert(0, visit.claimed_firm)
        crds = ([visit.claimed_crd] if visit and visit.claimed_crd else []) + ctx.get("crds", [])
        firms, crds = list(dict.fromkeys(firms)), list(dict.fromkeys(crds))
        if not firms and not crds:
            return
        searched, failed = False, None
        for firm, crd in [(None, c) for c in crds] + [(f, None) for f in firms]:
            try:
                contact, live = await lookup(firm, crd)
            except Exception as exc:
                log.info("brokercheck lookup failed: %s", exc)
                failed = exc
                continue
            searched = searched or live
            if contact:
                ctx["official_contact"] = contact
                ctx["signals"].append(
                    Signal(
                        id="firm_record",
                        label="Firm found in the official record",
                        check="pass",
                        detail=f"{contact.firm} has an official record. A matching name alone "
                        "does not verify who sent a message.",
                        source=contact.source,
                    )
                )
                return
        named = (firms or crds)[0]
        if searched and failed is None:
            ctx["signals"].append(
                Signal(
                    id="firm_not_found",
                    label="Firm not found in the official record",
                    check="fail",
                    detail=f"No BrokerCheck record matched {named}.",
                    source=Source(title="FINRA BrokerCheck", url="https://brokercheck.finra.org/"),
                    weight=3,
                )
            )
        else:
            reason = "the lookup failed" if failed else "live lookup is turned off"
            ctx["signals"].append(
                Signal(
                    id="firm_record",
                    label="Official record not checked",
                    check="unknown",
                    detail=f"No cached record for {named}, and {reason}.",
                )
            )
