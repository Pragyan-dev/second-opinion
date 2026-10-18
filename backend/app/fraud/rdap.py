"""Domain age from RDAP registration events. Owner B."""

import asyncio
import json
import logging
from datetime import date, datetime, timezone

import httpx

from app.config import FIXTURES, settings
from app.contracts import Signal, Source
from app.core import cache
from app.fraud.net import registered_domain

log = logging.getLogger(__name__)

RDAP_URL = "https://rdap.org/domain/{domain}"
# Reserved demo domains have no live registration records.
FIXTURE_ONLY_SUFFIXES = (".example", ".test", ".localhost")


def fixture_only(domain: str) -> bool:
    return domain == "localhost" or domain.endswith(FIXTURE_ONLY_SUFFIXES)


def load_fixture(domain: str) -> dict | None:
    path = FIXTURES / "rdap" / f"{domain}.json"
    if path.parent != FIXTURES / "rdap" or not path.is_file():
        return None
    return json.loads(path.read_text())


def registration_date(data: dict) -> date | None:
    for event in data.get("events", []):
        if event.get("eventAction") == "registration" and event.get("eventDate"):
            return datetime.fromisoformat(event["eventDate"].replace("Z", "+00:00")).date()
    return None


def age_days(data: dict, today: date | None = None) -> int | None:
    registered = registration_date(data)
    if registered is None:
        return None
    # Fixtures carry their own reference date so demo ages stay stable.
    as_of = data.get("_fixture_as_of")
    today = date.fromisoformat(as_of) if as_of else (today or datetime.now(timezone.utc).date())
    return (today - registered).days


async def fetch_live(domain: str) -> dict:
    async with httpx.AsyncClient(follow_redirects=True, timeout=5) as client:
        response = await client.get(
            RDAP_URL.format(domain=domain), headers={"Accept": "application/rdap+json"}
        )
        response.raise_for_status()
        return response.json()


async def lookup(domain: str) -> tuple[dict, bool] | None:
    """Return (rdap_json, from_fixture) or None when no record is available."""
    if settings.use_fixture("rdap"):
        data = load_fixture(domain)
        return (data, True) if data is not None else None
    if fixture_only(domain):
        return None
    key = f"rdap:{domain}"
    cached = await cache.get(key)
    if cached is not None:
        return cached, False
    data = await fetch_live(domain)
    await cache.set(key, data, cache.RDAP_TTL)
    return data, False


def domain_signal(domain: str, age: int | None, from_fixture: bool) -> Signal:
    source = Source(
        title="RDAP registration record" + (" (cached fixture)" if from_fixture else ""),
        url=RDAP_URL.format(domain=domain),
    )
    if age is None:
        return Signal(
            id="domain_age",
            label="Domain age unknown",
            check="unknown",
            detail=f"No registration date was found for {domain}.",
            source=source,
        )
    check = "fail" if age < 90 else "warn" if age < 365 else "pass"
    label = {
        "fail": "Domain under 90 days old",
        "warn": "Domain under a year old",
        "pass": "Domain registered over a year ago",
    }[check]
    return Signal(
        id="domain_age",
        label=label,
        check=check,
        detail=f"{domain} was registered {age} days ago.",
        source=source,
        weight={"fail": 2, "warn": 1, "pass": 0}[check],
    )


class RdapStep:
    name = "rdap"
    writes = ("site_visit",)

    async def run(self, ctx: dict) -> None:
        visit = ctx.get("site_visit")
        site = ctx.get("site_domain") if visit else None
        emails = (visit.emails if visit else []) + ctx.get("entities", {}).get("emails", [])
        candidates = [site] + [registered_domain(e) for e in emails]
        domains = list(dict.fromkeys(d for d in candidates if d))
        if not domains:
            return

        async def one(domain):
            try:
                return domain, await lookup(domain)
            except Exception as exc:
                log.info("rdap lookup for %s failed: %s", domain, exc)
                return domain, None

        results = dict(await asyncio.gather(*(one(d) for d in domains)))
        ctx["domain_ages"] = {d: age_days(r[0]) if r else None for d, r in results.items()}
        primary = site or domains[0]
        found = results.get(primary)
        if found is None:
            ctx["signals"].append(
                Signal(
                    id="domain_age",
                    label="Domain age unknown",
                    check="unknown",
                    detail=f"The registration record for {primary} could not be read.",
                    source=Source(title="RDAP lookup", url=RDAP_URL.format(domain=primary)),
                )
            )
            return
        age = ctx["domain_ages"][primary]
        if visit and site:
            ctx["site_visit"] = visit.model_copy(update={"domain_age_days": age})
        ctx["signals"].append(domain_signal(primary, age, found[1]))
