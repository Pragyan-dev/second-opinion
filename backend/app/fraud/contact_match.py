"""Compare crawled and captured contacts with the official record. Owner B."""

from rapidfuzz import fuzz

from app.contracts import OfficialContact, Signal
from app.fraud.net import normalize_phone, registered_domain

FIRM_MATCH = 85
CONTACT_SIGNALS = ("phone_match", "email_domain_match", "website_match")


def firm_matches(claimed: str | None, official: str) -> bool | None:
    if not claimed:
        return None
    return fuzz.token_set_ratio(claimed.lower(), official.lower()) >= FIRM_MATCH


def _signal(id: str, label: str, check: str, detail: str, contact: OfficialContact | None):
    return Signal(
        id=id,
        label=label,
        check=check,
        detail=detail,
        source=contact.source if contact else None,
        weight=3 if check == "fail" else 0,
    )


def compare(
    phones: list[str],
    email_domains: list[str],
    site_domain: str | None,
    claimed_firm: str | None,
    contact: OfficialContact | None,
) -> list[Signal]:
    official_phone = normalize_phone(contact.phone) if contact and contact.phone else None
    official_domain = registered_domain(contact.website) if contact and contact.website else None

    def make(id, label, check, detail):
        return _signal(id, label, check, detail, contact)

    if not official_phone:
        phone = make("phone_match", "Phone not checked", "unknown",
                     "The official record has no phone number to compare.")
    elif not phones:
        phone = make("phone_match", "Phone not checked", "unknown",
                     "No phone number was found to compare.")
    elif official_phone in phones:
        phone = make("phone_match", "Phone matches", "pass",
                     f"{official_phone} matches the official record.")
    else:
        phone = make("phone_match", "Phone differs", "fail",
                     f"{', '.join(phones)} does not match the official record ({official_phone}).")

    if not official_domain:
        email = make("email_domain_match", "Email domain not checked", "unknown",
                     "The official record has no website to compare email domains with.")
    elif not email_domains:
        email = make("email_domain_match", "Email domain not checked", "unknown",
                     "No email address was found to compare.")
    elif all(domain == official_domain for domain in email_domains):
        email = make("email_domain_match", "Email domain matches", "pass",
                     f"Email addresses use {official_domain}, as in the official record.")
    else:
        others = ", ".join(d for d in email_domains if d != official_domain)
        email = make("email_domain_match", "Email domain differs", "fail",
                     f"Email domain {others} does not match the official record "
                     f"({official_domain}).")

    name_note = ""
    if contact and (name := firm_matches(claimed_firm, contact.firm)) is not None:
        verb = "matches" if name else "does not match"
        name_note = f" The firm name {verb} {contact.firm}."
    if not official_domain or not site_domain:
        missing = "the official record has no website" if not official_domain else "no site"
        website = make("website_match", "Website not checked", "unknown",
                       f"Not compared because {missing} was available.{name_note}")
    elif site_domain == official_domain:
        website = make("website_match", "Website matches", "pass",
                       f"{site_domain} matches the official record.{name_note}")
    else:
        website = make("website_match", "Website differs", "fail",
                       f"{site_domain} does not match the official record "
                       f"({official_domain}).{name_note}")
    return [phone, email, website]


class ContactMatchStep:
    name = "contact_match"
    writes = ()

    async def run(self, ctx: dict) -> None:
        visit = ctx.get("site_visit")
        entities = ctx.get("entities", {})
        raw_phones = (visit.phones if visit else []) + entities.get("phones", [])
        phones = list(dict.fromkeys(p for p in map(normalize_phone, raw_phones) if p))
        emails = (visit.emails if visit else []) + entities.get("emails", [])
        domains = list(dict.fromkeys(d for d in map(registered_domain, emails) if d))
        claimed = (visit.claimed_firm if visit else None) or next(
            iter(entities.get("firms", [])), None
        )
        ctx["signals"].extend(
            compare(phones, domains, ctx.get("site_domain"), claimed, ctx.get("official_contact"))
        )
