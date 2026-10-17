"use client";
import type { StockXray } from "@/lib/contracts";
import { useJob } from "@/lib/useJob";
import styles from "../../styles.module.css";

export default function XrayPage({ params }: { params: { symbol: string } }) {
  const { data, error } = useJob<StockXray>("/v1/xray", params.symbol);
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  return <><p className={styles.eyebrow}>Stock X-ray / {data?.status || "starting"}</p>
    <h1>{params.symbol.toUpperCase()}</h1><p>All metrics below are fictional fixture data.</p>
    <div className={styles.grid}>{Object.entries(data?.sections || {}).map(([name, section]) =>
      <article className={styles.card} key={name}><h2>{name}</h2><p>{section.status}</p>
        <pre>{JSON.stringify(section.data, null, 2)}</pre>
        {(section.sources || []).map(source => <p key={source.url}><a href={source.url}>{source.title}</a></p>)}
      </article>)}</div>
    <p>{data?.summary}</p><ul>{(data?.questions || []).map(question => <li key={question}>{question}</li>)}</ul>
    {/* TODO(C): replace raw data blocks with readable section layouts. */}
  </>;
}
