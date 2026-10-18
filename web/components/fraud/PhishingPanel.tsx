import type { PhishingCheck, PhishingReason } from "@/lib/contracts";
import { PlainAddress } from "./LinkTrail";
import styles from "./fraud.module.css";

const STRENGTH: Record<number, string> = { 3: "Strong sign", 2: "Notable sign", 1: "Minor sign" };

// Warning signs, strongest first, each with the words that show it.
export function ReasonList({ reasons, quotedFrom }: { reasons: PhishingReason[]; quotedFrom: string }) {
  const sorted = [...reasons].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  return (
    <ul className={styles.phishList}>
      {sorted.map(r => (
        <li key={r.id} className={`${styles.ledgerRow} fadeIn`}>
          <span className={`check check-${(r.weight ?? 1) >= 2 ? "fail" : "warn"}`} aria-hidden="true">!</span>
          <div>
            <span className={styles.ledgerLabel}>{r.label}</span>{" "}
            <span className="tiny muted">{STRENGTH[r.weight ?? 1] ?? STRENGTH[1]}</span>
            <p>{r.detail}</p>
            {r.evidence && (
              <blockquote className={styles.phishQuote}>
                {/* Some quotes carry their own quote marks ("“E.T. approves it.”"). */}
                &ldquo;{r.evidence.replace(/^["“”']+|["“”']+$/g, "")}&rdquo;<span className="sr-only"> (quoted from {quotedFrom})</span>
              </blockquote>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Why the email could be phishing: each reason quotes the email. The link it asks the reader to
// open is shown as text only; the agent opens it, and the sections below show what it found.
export function PhishingPanel({ phishing }: { phishing: PhishingCheck }) {
  const reasons = phishing.reasons ?? [];
  return (
    <section className="band" aria-labelledby="phishing-title">
      <p className={styles.partTag}>The email</p>
      <h2 id="phishing-title">Why this email could be phishing</h2>
      <p className="sub">
        {phishing.sender && <>From <strong>{phishing.sender}</strong> · </>}
        Subject <strong>{phishing.email_title || "(no subject)"}</strong>
      </p>
      <p className={`measure ${styles.phishSummary}`}>{phishing.summary}</p>

      {phishing.link_requested && (
        <div className={styles.phishLink}>
          <p className={styles.ledgerLabel}>The link this email asks you to open</p>
          <PlainAddress url={phishing.link_requested} />
          <p className="small muted">
            Don&apos;t open it yourself. The agent opened it for you: see what the linked page says below.
          </p>
        </div>
      )}

      {reasons.length > 0
        ? <ReasonList reasons={reasons} quotedFrom="the email" />
        : <p className="muted">No common phishing signs were found in the email&apos;s wording, sender or links.</p>}
    </section>
  );
}
