import type { FraudReport, Signal } from "./contracts";
import { digitsOnly, hostname } from "./format";

type Verdict = "match" | "mismatch" | "unlisted" | "record";

interface Row { key: string; label: string; claimed: string[]; official: string | null; verdict: Verdict }

function verdictFromSignal(sig: Signal | undefined, fallback: Verdict): Verdict {
  if (sig?.check === "fail") return "mismatch";
  if (sig?.check === "pass") return "match";
  if (sig) return "unlisted";
  return fallback;
}

export function buildRows(r: FraudReport): Row[] {
  const sv = r.site_visit, oc = r.official_contact;
  const sig = (id: string) => r.signals?.find(s => s.id === id);
  const phones = sv?.phones?.length ? sv.phones : (r.entities?.phones ?? []);
  const emails = sv?.emails?.length ? sv.emails : (r.entities?.emails ?? []);
  const emailDomains = [...new Set(emails.map(e => e.split("@")[1]?.toLowerCase()).filter((x): x is string => !!x))];
  const officialHost = hostname(oc?.website) || null;
  const siteHost = hostname(sv?.final_url) || null;

  const cmp = (claimed: string[], official: string | null, same: (a: string, b: string) => boolean): Verdict =>
    !claimed.length || !official ? "unlisted" : claimed.some(c => same(c, official)) ? "match" : "mismatch";

  const combined = sig("contact_match");
  const rows: Row[] = [
    { key: "firm", label: "Firm", claimed: sv?.claimed_firm ? [sv.claimed_firm] : (r.entities?.firms ?? []), official: oc?.firm ?? null, verdict: "unlisted" },
    { key: "crd", label: "CRD", claimed: sv?.claimed_crd ? [sv.claimed_crd] : [], official: oc?.crd ?? null, verdict: "unlisted" },
    { key: "phone", label: "Phone", claimed: phones, official: oc?.phone ?? null, verdict: "unlisted" },
    { key: "email", label: "Email domain", claimed: emailDomains, official: officialHost, verdict: "unlisted" },
    { key: "site", label: "Website", claimed: siteHost ? [siteHost] : [], official: officialHost, verdict: "unlisted" },
  ];
  // A brand name can differ from a registered subsidiary's legal name. Finding a
  // record is evidence of a search result, not proof that a sender is affiliated.
  if (sig("firm_record")?.check === "pass" && rows[0].claimed.length && rows[0].official) {
    const sameName = cmp(rows[0].claimed, rows[0].official, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
    rows[0].verdict = sameName === "match" ? "match" : "record";
  }
  rows[1].verdict = cmp(rows[1].claimed, rows[1].official, (a, b) => a.trim() === b.trim());
  rows[2].verdict = verdictFromSignal(sig("phone_match"), cmp(phones, rows[2].official, (a, b) => digitsOnly(a) === digitsOnly(b)));
  rows[3].verdict = verdictFromSignal(sig("email_domain_match"), cmp(emailDomains, officialHost, (a, b) => a.replace(/^www\./, "") === b));
  rows[4].verdict = verdictFromSignal(sig("website_match"), cmp(rows[4].claimed, officialHost, (a, b) => a === b));
  // The fixtures' single combined signal is the authority for the phone, email and website rows
  // that have values on both sides.
  if (combined && (combined.check === "fail" || combined.check === "pass")
    && !sig("phone_match") && !sig("email_domain_match") && !sig("website_match")) {
    const v: Verdict = combined.check === "fail" ? "mismatch" : "match";
    for (const k of [2, 3, 4]) if (rows[k].claimed.length && rows[k].official) rows[k].verdict = v;
  }
  return rows;
}

