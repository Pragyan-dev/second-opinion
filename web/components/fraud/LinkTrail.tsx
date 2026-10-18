"use client";
import { useState } from "react";
import type { SiteVisit } from "@/lib/contracts";
import { hostname } from "@/lib/format";
import styles from "./fraud.module.css";

// Addresses from the checked site are shown as text, never as links: the agent visited them so
// the person doesn't have to. Copying is allowed for people who want to report the site.
export function PlainAddress({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={styles.plainAddress}>
      <code>{url}</code>
      <button type="button" className={styles.copyBtn} onClick={async () => {
        try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
      }}>{copied ? "Copied" : "Copy"}<span className="sr-only"> address {url}</span></button>
    </span>
  );
}

export function LinkTrail({ visit, running }: { visit?: SiteVisit | null; running: boolean }) {
  if (!visit) return <p className="muted">{running ? "Following the link…" : "The link wasn't followed."}</p>;
  const redirected = hostname(visit.start_url) !== hostname(visit.final_url);
  const age = visit.domain_age_days;
  return (
    <dl className={styles.trail} style={{ margin: 0 }}>
      <dt>Started at</dt>
      <dd>{visit.start_url}</dd>
      <dt>Ended at</dt>
      <dd>
        {visit.final_url}
        {redirected && <span className={styles.flagRed}> Redirected to a different domain</span>}
      </dd>
      <dt>Pages visited</dt>
      <dd>
        <ul>
          {(visit.pages_visited ?? []).map(u => <li key={u}><PlainAddress url={u} /></li>)}
        </ul>
      </dd>
      <dt>Domain age</dt>
      <dd className={age != null && age < 90 ? styles.flagRed : undefined}>
        {age == null ? "Age not found" : age === 0 ? "Registered today" : `Registered ${age} ${age === 1 ? "day" : "days"} ago`}
      </dd>
      {visit.claimed_crd && (<><dt>CRD number claimed</dt><dd>{visit.claimed_crd}</dd></>)}
    </dl>
  );
}
