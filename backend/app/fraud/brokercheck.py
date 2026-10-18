"""Official firm records from BrokerCheck, with fixtures only in explicit fixture mode. Owner B."""

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


def _words(firm: str) -> list[str]:
    """Lowercase name words without punctuation or legal suffixes."""
    return [w for w in re.sub(r"[^\w\s]", " ", firm.lower()).split() if w not in LEGAL_SUFFIXES]


def slugs(firm: str) -> list[str]:
    """Fixture names to try: hyphenated words, joined words, then the first word."""
    words = _words(firm)
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


def best_hit(data: dict, query: str) -> str | None:
    """CRD of the search hit whose name best matches the query.

    Search hits carry firm_name and firm_source_id (the CRD) but no phone. Ties, common for
    firms with many affiliates, go first to broker-dealers (only their detail records list a
    business phone), then to the hit with the most branches.
    """
    ranked = []
    for hit in data.get("hits", {}).get("hits", []):
        source = hit.get("_source", {})
        name, crd = source.get("firm_name"), source.get("firm_source_id")
        if name and crd:
            score = fuzz.token_set_ratio(" ".join(_words(name)), " ".join(_words(query)))
            broker_dealer = 1 if source.get("firm_bd_sec_number") else 0
            branches = source.get("firm_branches_count") or 0
            ranked.append((score, broker_dealer, branches, str(crd)))
    if not ranked:
        return None
    score, _, _, crd = max(ranked)
    return crd if score >= MATCH_THRESHOLD else None


def parse_firm(data: dict) -> OfficialContact | None:
    """Official contact from a firm detail response (GET {search url}/{crd})."""
    hits = data.get("hits", {}).get("hits", [])
    if not hits:
        return None
    content = hits[0].get("_source", {}).get("content", {})
    if isinstance(content, str):
        content = json.loads(content)
    basic = content.get("basicInformation", {})
    name, crd = basic.get("firmName"), basic.get("firmId")
    if not name or not crd:
        return None
    phone = content.get("firmAddressDetails", {}).get("businessPhoneNumber")
    return OfficialContact(
        firm=name,
        crd=str(crd),
        phone=normalize_phone(phone) if phone else None,
        website=None,  # BrokerCheck does not list firm websites.
        source=Source(title="FINRA BrokerCheck", url=FIRM_PAGE.format(crd=crd)),
    )


async def _get(url: str, query: str = "") -> dict:
    await _throttle.wait()
    async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
        response = await client.get(
            url,
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


async def fetch_search(query: str) -> dict:
    """One raw BrokerCheck firm search (no cache)."""
    return await _get(settings.brokercheck_search_url, query)


async def fetch_firm(crd: str) -> dict:
    """One raw BrokerCheck firm detail request (no cache)."""
    return await _get(f"{settings.brokercheck_search_url.rstrip('/')}/{crd}")


async def live_search(query: str) -> OfficialContact | None:
    """Firm by CRD (digits) or by name, cached 24 h including misses."""
    digits = re.sub(r"\D", "", query)
    by_crd = bool(digits) and digits == query.strip()
    key = f"bc:crd:{digits}" if by_crd else f"bc:{' '.join(slugs(query)[:1]) or query.lower()}"
    cached = await cache.get(key)
    if cached is not None:
        return _contact(cached["contact"]) if cached["contact"] else None
    crd = digits if by_crd else best_hit(await fetch_search(query), query)
    contact = parse_firm(await fetch_firm(crd)) if crd else None
    stored = {"contact": contact.model_dump(mode="json") if contact else None}
    await cache.set(key, stored, cache.BROKERCHECK_TTL)
    return contact


def live_enabled() -> bool:
    return settings.live_brokercheck and not settings.use_fixture("brokercheck")


async def lookup(firm: str | None, crd: str | None) -> tuple[OfficialContact | None, bool]:
    """Return (contact, searched_live). Raises on live lookup errors."""
    if settings.use_fixture("brokercheck"):
        if crd and (found := fixture_by_crd(crd)):
            return found, False
        if firm and (found := fixture_by_firm(firm)):
            return found, False
        return None, False
    if not live_enabled():
        return None, False
    crd_digits = re.sub(r"\D", "", crd or "")
    for query in (crd_digits, firm):
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
