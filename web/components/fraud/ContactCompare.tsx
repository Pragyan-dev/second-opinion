import type { FraudReport } from "@/lib/contracts";
import { Cite } from "@/components/shared/Cite";
import { CONTACT_SIGNAL_IDS } from "@/lib/fraudSteps";
import { buildRows } from "@/lib/contactComparison";
import styles from "./fraud.module.css";

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
        <p className={styles.missing}>No verified official record is available for {sv?.claimed_firm ?? "the claimed firm"}. Contact details could not be checked.</p>
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
            {row.verdict === "mismatch" ? "Doesn't match" : row.verdict === "match" ? "Matches" : row.verdict === "record" ? "Record found" : "Not checked"}
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
