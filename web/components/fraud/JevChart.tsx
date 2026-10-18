"use client";
import { useState } from "react";
import type { JevScore } from "@/lib/contracts";
import { Skeleton } from "@/components/shared/Skeleton";
import styles from "./fraud.module.css";

const tone = (c: number) => (c >= 0.7 ? styles.jevHigh : c >= 0.4 ? styles.jevMid : c > 0 ? styles.jevLow : styles.jevZero);

export function JevChart({ scores, running }: { scores: JevScore[]; running: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!scores.length) {
    if (running) return <div style={{ display: "grid", gap: 10 }}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} height={22} label="Wording check loading" />)}</div>;
    return <p className="muted">The wording check didn&apos;t return results.</p>;
  }
  const sorted = [...scores].sort((a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label));
  const max = sorted[0].confidence;
  const summary = max < 0.2 ? "None of the red flags showed up strongly"
    : `Strongest match: ${sorted[0].label} at ${Math.round(max * 100)} percent`;
  return (
    <div>
      <div role="img" aria-label={summary}>
        <ul className={styles.jevList}>
          {sorted.map(s => {
            const value = Math.round(s.confidence * 100);
            return (
              <li key={s.flag} className={styles.jevRow} data-open={open === s.flag}>
                <button type="button" className={styles.jevBtn} onClick={() => setOpen(open === s.flag ? null : s.flag)} aria-describedby={`ev-${s.flag}`}>
                  <span className={styles.jevLabel}>{s.label}</span>
                  <span className={styles.jevTrack}>
                    <span className={`${styles.jevFill} ${tone(s.confidence)}`} style={{ width: `${value}%` }} />
                  </span>
                  <span className={styles.jevValue}>{value}%</span>
                </button>
                {s.evidence && <p className={styles.inlineEvidence}>&ldquo;{s.evidence}&rdquo;</p>}
                <div className={styles.tip} id={`ev-${s.flag}`} role="tooltip">
                  {s.evidence ? <>&ldquo;{s.evidence}&rdquo;</> : "No quoted evidence"}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {max < 0.2 && <p className="muted" style={{ marginTop: 12 }}>None of the red flags showed up strongly.</p>}
      <table className="sr-only">
        <caption>Red-flag wording matches</caption>
        <thead><tr><th>Flag</th><th>Confidence</th><th>Evidence</th></tr></thead>
        <tbody>{sorted.map(s => <tr key={s.flag}><td>{s.label}</td><td>{Math.round(s.confidence * 100)}%</td><td>{s.evidence}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
