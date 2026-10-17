"use client";
import Link from "next/link";
import type { Report } from "@/lib/contracts";
import { useJob } from "@/lib/useJob";
import styles from "../../styles.module.css";

export default function ReportPage({ params }: { params: { id: string } }) {
  const { data, error } = useJob<Report>(`/v1/reports/${encodeURIComponent(params.id)}`);
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  if (!data) return <p role="status">Loading report…</p>;
  return <>
    <p className={styles.eyebrow}>Pitch check / {data.status}</p><h1>A closer look at the details.</h1>
    <span className={styles.badge}>{data.band || "Checking…"}</span><p>{data.band_reason}</p>
    <p>{data.explanation}</p>
    <ul className={styles.signals}>{(data.signals || []).map(signal => <li key={signal.id}>
      <strong>{signal.check.toUpperCase()} · {signal.label}</strong><div>{signal.detail}</div>
      {signal.source && <small><a href={signal.source.url} target="_blank" rel="noreferrer">{signal.source.title}</a></small>}
    </li>)}</ul>
    {data.official_contact && <section className={styles.card}><h2>Official contact · fictional record</h2>
      <p>{data.official_contact.firm} · CRD {data.official_contact.crd}</p>
      <p><a href={`tel:${data.official_contact.phone}`}>{data.official_contact.phone}</a></p>
      <p><a href={data.official_contact.website || "#"}>{data.official_contact.website}</a></p>
      <a href={data.official_contact.source.url}>{data.official_contact.source.title}</a>
    </section>}
    <Link className={styles.button} href={`/bank/send?report=${encodeURIComponent(params.id)}`}>Before you send money →</Link>
    {/* TODO(C): refine progressive signal display using the mock poll sequence. */}
  </>;
}
