"""SEC IAPD lookup stub with the same interface as brokercheck.lookup. Owner B."""

from app.contracts import OfficialContact


async def lookup(firm: str | None, crd: str | None) -> tuple[OfficialContact | None, bool]:
    """Return (contact, searched_live).

    TODO(B): query SEC IAPD (adviserinfo.sec.gov) for investment advisers that are not
    broker-dealers, parse firm name, CRD, main office phone and website, cache 24 h, and add
    a fixture fallback under contracts/fixtures/iapd/.
    """
    return None, False
