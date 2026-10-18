"""Contact comparison against the official record."""

from app.config import fixture
from app.contracts import OfficialContact, SiteVisit
from app.fraud.contact_match import ContactMatchStep, compare


def brightwater_ctx():
    visit = SiteVisit(
        start_url="https://brightwater-capital.example/",
        final_url="https://brightwater-capital.example/",
        pages_visited=["https://brightwater-capital.example/"],
        claimed_firm="Brightwater Capital Advisors",
        phones=["+12025550199"],
        emails=["offers@brightwater-capital.example"],
    )
    return {
        "site_visit": visit,
        "site_domain": "brightwater-capital.example",
        "official_contact": OfficialContact.model_validate(fixture("brokercheck/brightwater.json")),
        "entities": {},
        "signals": [],
    }


async def test_brightwater_clone_mismatches():
    ctx = brightwater_ctx()
    await ContactMatchStep().run(ctx)
    checks = {s.id: s for s in ctx["signals"]}
    assert checks["phone_match"].check == "fail"
    assert "+12025550148" in checks["phone_match"].detail
    assert checks["email_domain_match"].check == "fail"
    assert checks["website_match"].check == "fail"
    assert "The firm name matches" in checks["website_match"].detail
    official = fixture("brokercheck/brightwater.json")["source"]
    assert all(s.source.model_dump() == official for s in ctx["signals"])
    assert all("does not match the official record" in s.detail for s in ctx["signals"])


def test_matches_and_unknowns():
    contact = OfficialContact(
        firm="Acme Wealth Partners",
        phone="(202) 555-0101",
        website="https://www.acme.test/",
        source={"title": "Record", "url": "https://records.test/acme"},
    )
    signals = compare(["+12025550101"], ["acme.test"], "acme.test", "Acme Wealth", contact)
    assert [s.check for s in signals] == ["pass", "pass", "pass"]
    no_phone = contact.model_copy(update={"phone": None, "website": None})
    signals = compare(["+12025550101"], ["acme.test"], "acme.test", None, no_phone)
    assert [s.check for s in signals] == ["unknown", "unknown", "unknown"]
    assert all(s.source.url == "https://records.test/acme" for s in signals)
    assert signals[2].detail == "Not compared because the official record lists no website."
    signals = compare([], [], None, None, None)
    assert [s.check for s in signals] == ["unknown", "unknown", "unknown"]
    assert all(s.source is None for s in signals)
    assert signals[0].detail == "No official record was available to compare with."
