import type { PageCheck } from "@/lib/contracts";
import { CheckMark } from "@/components/shared/CheckMark";
import { Skeleton } from "@/components/shared/Skeleton";
import { PlainAddress } from "./LinkTrail";
import { ReasonList } from "./PhishingPanel";
import styles from "./fraud.module.css";

// What the linked page says, read by the agent: its own warning signs (quoted from the page), the
// sensitive details its forms ask for, and whether its firm and contacts match the message.
// The page address is text only; the agent's browser below shows the page itself.
export function PagePanel({ page, running, noun }: { page?: PageCheck | null; running: boolean; noun: string }) {
  if (!page) {
    if (!running) return null;
    return (
      <section className="band" aria-label="Linked page loading">
        <p className={styles.partTag}>The linked page</p>
        <h2>What the linked page says</h2>
        <Skeleton height={160} label="Reading the linked page" />
      </section>
    );
  }
  const reasons = page.reasons ?? [];
  const matches = page.matches_message ?? [];
  return (
    <section className="band" aria-labelledby="page-title">
      <p className={styles.partTag}>The linked page</p>
      <h2 id="page-title">What the linked page says</h2>
      <div className="sub">
        <PlainAddress url={page.url} />
        {(page.title || page.claimed_firm) && (
          <p className="small" style={{ marginTop: 6 }}>
            {page.title && <>Title <strong>{page.title}</strong></>}
            {page.title && page.claimed_firm && " · "}
            {page.claimed_firm && <>Presents itself as <strong>{page.claimed_firm}</strong></>}
          </p>
        )}
      </div>
      <p className={`measure ${styles.phishSummary}`}>{page.summary}</p>

      <div className="twoCol">
        <div>
          <h3 className={styles.ledgerHead}>Warning signs on the page</h3>
          {reasons.length > 0
            ? <ReasonList reasons={reasons} quotedFrom="the linked page" />
            : <p className="muted">None of the common pressure or scam tactics we check for were found on the page.</p>}
        </div>
        <div>
          <h3 className={styles.ledgerHead}>Does the page match the {noun}?</h3>
          {matches.length > 0 ? (
            <ul>
              {matches.map(s => (
                <li key={s.id} className={`${styles.ledgerRow} fadeIn`}>
                  <CheckMark check={s.check} />
                  <div><span className={styles.ledgerLabel}>{s.label}</span> <span>{s.detail}</span></div>
                </li>
              ))}
            </ul>
          ) : <p className="muted">The page gave no firm name or contact details to compare.</p>}
        </div>
      </div>
    </section>
  );
}
