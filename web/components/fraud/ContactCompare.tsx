import type { FraudReport, Signal } from "@/lib/contracts";
import { Cite } from "@/components/shared/Cite";
import { CONTACT_SIGNAL_IDS } from "@/lib/fraudSteps";
import { digitsOnly, hostname } from "@/lib/format";
import styles from "./fraud.module.css";

type Verdict = "match" | "mismatch" | "unlisted";

interface Row { key: string; label: string; claimed: string[]; official: string | null; verdict: Verdict }

function verdictFromSignal(sig: Signal | undefined, fallback: Verdict): Verdict {
  if (sig?.check === "fail") return "mismatch";
  if (sig?.check === "pass") return "match";
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
    { key: "firm", label: "Firm", claimed: sv?.claimed_firm ? [sv.claimed_firm] : [], official: oc?.firm ?? null, verdict: "unlisted" },
    { key: "crd", label: "CRD", claimed: sv?.claimed_crd ? [sv.claimed_crd] : [], official: oc?.crd ?? null, verdict: "unlisted" },
    { key: "phone", label: "Phone", claimed: phones, official: oc?.phone ?? null, verdict: "unlisted" },
    { key: "email", label: "Email domain", claimed: emailDomains, official: officialHost, verdict: "unlisted" },
    { key: "site", label: "Website", claimed: siteHost ? [siteHost] : [], official: officialHost, verdict: "unlisted" },
  ];
  rows[0].verdict = cmp(rows[0].claimed, rows[0].official, (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase());
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

export function ContactCompare({ report }: { report: FraudReport }) {
  const sv = report.site_visit, oc = report.official_contact;
  if (!sv && !oc && !report.signals?.length) return null;
  const contactSignals = (report.signals ?? []).filter(s => CONTACT_SIGNAL_IDS.includes(s.id));
  const anyFail = contactSignals.some(s => s.check === "fail");
  const allPass = contactSignals.length > 0 && contactSignals.every(s => s.check === "pass");
  const heading = anyFail ? "The contact details don't match the official record"
    : allPass ? "The contact details match the official record" : "Contact details compared with the official record";

  if (!oc) {
    return (
      <div className={styles.sheet}>
        <h3 className={styles.sheetHead}>{heading}</h3>
        <p className={styles.missing}>No official record found for {sv?.claimed_firm ?? "the claimed firm"}.</p>
      </div>
    );
  }
  const rows = buildRows(report);
  const claimedSource = { title: "Page visited", url: sv?.pages_visited?.[0] ?? sv?.final_url ?? "" };
  return (
    <div className={styles.sheet}>
      <h3 className={styles.sheetHead}>{heading}</h3>
      <div className={`${styles.cmpRow} ${styles.cmpHeader}`} aria-hidden="true">
        <span /><span>Claimed on the site</span><span>Official record</span><span />
      </div>
      {rows.map(row => (
        <div key={row.key} className={styles.cmpRow}>
          <span className={styles.cmpName}>{row.label}</span>
          <span>
            <span className={styles.cmpMobileTag}>Claimed on the site: </span>
            {row.claimed.length ? row.claimed.map((c, i) => (
              <span key={c}>{i > 0 && ", "}<span className={row.verdict === "mismatch" ? styles.struck : undefined}
                style={row.verdict === "mismatch" ? { color: "var(--seal)" } : undefined}>{c}</span></span>
            )) : <span className="muted">Not found</span>}
          </span>
          <span>
            <span className={styles.cmpMobileTag}>Official record: </span>
            {row.official ?? <span className="muted">Not listed</span>}
          </span>
          <span className={`${styles.verdict} ${row.verdict === "mismatch" ? styles.verdictFail : row.verdict === "match" ? styles.verdictPass : styles.verdictNone}`}>
            <span className={`check ${row.verdict === "mismatch" ? "check-fail" : row.verdict === "match" ? "check-pass" : "check-unknown"}`} aria-hidden="true">
              {row.verdict === "mismatch" ? "✕" : row.verdict === "match" ? "✓" : "?"}
            </span>
            {row.verdict === "mismatch" ? "Doesn't match" : row.verdict === "match" ? "Matches" : "Not listed"}
          </span>
        </div>
      ))}
      <div className={styles.cmpRow}>
        <span className={styles.cmpName}>Sources</span>
        <span>{claimedSource.url ? <Cite source={claimedSource} /> : <Cite />}</span>
        <span><Cite source={oc.source} /></span>
        <span />
      </div>
    </div>
  );
}
