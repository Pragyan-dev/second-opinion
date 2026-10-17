"use client";
import Link from "next/link";
import type { FraudReport } from "@/lib/contracts";
import { useJob } from "@/lib/useJob";
import styles from "../../styles.module.css";

export default function FraudPage({ params }: { params: { id: string } }) {
  const { data, error } = useJob<FraudReport>(`/v1/fraud/${encodeURIComponent(params.id)}`);
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!data) return <p role="status">Loading report…</p>;
  return <>
    <p className={styles.eyebrow}>Fraud check / {data.status} / {data.source_type}</p><h1>A closer look at the message.</h1>
    <span className={styles.badge}>{data.band || "Checking…"}</span>
    <p>Demo fraud likelihood: {data.fraud_likelihood == null ? "Pending" : `${data.fraud_likelihood}%`}</p>
    <p>{data.band_reason}</p><p>{data.explanation}</p>
    <section className={styles.card}><h2>Jev confidence chart placeholder</h2>
      {/* TODO(C): render a confidence bar chart with quoted evidence. */}
      <pre>{JSON.stringify(data.jev_scores, null, 2)}</pre>
    </section>
    <h2>Signals</h2><ul className={styles.signals}>{(data.signals || []).map(signal => <li key={signal.id}>
      <strong>{signal.check.toUpperCase()} · {signal.label}</strong><div>{signal.detail}</div>
      {signal.source && <small><a href={signal.source.url} target="_blank" rel="noreferrer">{signal.source.title}</a></small>}
    </li>)}</ul>
    <div className={styles.grid}>
      <section className={styles.card}><h2>Official contact fixture</h2><pre>{JSON.stringify(data.official_contact, null, 2)}</pre>
        {data.official_contact && <a href={data.official_contact.source.url}>{data.official_contact.source.title}</a>}
      </section>
      <section className={styles.card}><h2>Claimed contact and site visit</h2><pre>{JSON.stringify(data.site_visit, null, 2)}</pre></section>
    </div>
    <h2>Stock pros</h2><ul>{(data.stock_pros || []).map((item, i) => <li key={i}>{item.text} {item.source && <a href={item.source.url}>{item.source.title}</a>}</li>)}</ul>
    <h2>Stock cons</h2><ul>{(data.stock_cons || []).map((item, i) => <li key={i}>{item.text} {item.source && <a href={item.source.url}>{item.source.title}</a>}</li>)}</ul>
    {data.stock_research_id && <Link className={styles.button} href={`/stock/${encodeURIComponent(data.stock_research_id)}`}>Open linked stock research →</Link>}
    {/* TODO(C): refine contact comparisons while retaining source labels. */}
  </>;
}
