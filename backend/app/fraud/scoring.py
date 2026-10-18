"""Fraud likelihood scoring. A pure function of ctx, no I/O. Owner B."""

from app.contracts import JevScore, PhishingCheck, Signal

# contact_match is the single combined id used by the v2 demo fixtures.
CONTACT_IDS = {"phone_match", "email_domain_match", "website_match", "contact_match"}
# Points per unit of phishing-reason weight (1 to 3 each), capped.
PHISHING_POINTS = 6
PHISHING_CAP = 36


def band_for(likelihood: int) -> str:
    return "low" if likelihood < 25 else "elevated" if likelihood <= 60 else "high"


def score(ctx: dict) -> tuple[int | None, str, str]:
    """Return (fraud_likelihood, band, band_reason)."""
    phishing: PhishingCheck | None = ctx.get("phishing")
    # Asking to open a link is not by itself a sign; it only decides which link is checked.
    signs = [r for r in phishing.reasons if r.id != "link_request"] if phishing else []
    if not ctx.get("entities", {}).get("firms") and not ctx.get("crawl_ok") and not signs:
        return None, "cant_tell", "No firm was named and no website could be visited."

    signals: list[Signal] = ctx.get("signals", [])
    jev: list[JevScore] = ctx.get("jev_scores", [])
    mean = sum(s.confidence for s in jev) / len(jev) if jev else 0.0
    contributions = [(mean * 50, f"pressure language scored {mean:.2f} on average")]
    if signs:
        points = min(PHISHING_CAP, PHISHING_POINTS * sum(r.weight for r in signs))
        noun = "sign" if len(signs) == 1 else "signs"
        contributions.append((points, f"{len(signs)} common phishing {noun} in the email"))

    def has(id: str, check: str) -> bool:
        return any(s.id == id and s.check == check for s in signals)

    contact = [s for s in signals if s.id in CONTACT_IDS]
    if any(s.check == "fail" for s in contact):
        contributions.append((30, "contact details that do not match the official record"))
    if has("firm_not_found", "fail"):
        contributions.append((25, "a firm name with no official record"))
    if has("domain_age", "fail"):
        contributions.append((15, "a domain registered under 90 days ago"))
    if has("redirect_offsite", "warn"):
        contributions.append((10, "a link that redirects to another site"))
    if contact and all(s.check == "pass" for s in contact):
        contributions.append((-30, "contact details that match the official record"))

    likelihood = int(round(min(99, max(1, sum(points for points, _ in contributions)))))
    top = [label for points, label in sorted(contributions, key=lambda c: -abs(c[0])) if points]
    reason = f"Main factors: {' and '.join(top[:2])}." if top else "No checks raised a concern."
    return likelihood, band_for(likelihood), reason


class ScoringStep:
    name = "scoring"
    writes = ("fraud_likelihood", "band", "band_reason")

    async def run(self, ctx: dict) -> None:
        ctx["fraud_likelihood"], ctx["band"], ctx["band_reason"] = score(ctx)
