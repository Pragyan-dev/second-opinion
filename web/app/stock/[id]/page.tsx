"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { StockReport } from "@/lib/contracts";
import { useJob } from "@/lib/useJob";
import styles from "../../styles.module.css";

export default function StockPage({ params }: { params: { id: string } }) {
  const { data, error } = useJob<StockReport>(`/v1/stock/${encodeURIComponent(params.id)}`);
  const [sort, setSort] = useState<"recent" | "relevant">("recent");
  const articles = useMemo(() => [...(data?.articles || [])].sort((a, b) => sort === "recent"
    ? Date.parse(b.published) - Date.parse(a.published) : b.relevance - a.relevance), [data?.articles, sort]);
  if (error) return <p role="alert" className={styles.error}>{error}</p>;
  return <><p className={styles.eyebrow}>Stock research / {data?.status || "loading"}</p>
    <h1>{data?.symbol || "Stock research"}</h1><p>{data?.summary}</p>
    <section className={styles.card}><h2>Price history chart placeholder</h2>
      {/* TODO(C): plot prices_1y and prices_5y from the history section. */}
      <p>Raw history data appears in the section below.</p>
    </section>
    <h2>Articles</h2><div>
      <button aria-pressed={sort === "recent"} onClick={() => setSort("recent")}>Most recent</button>{" "}
      <button aria-pressed={sort === "relevant"} onClick={() => setSort("relevant")}>Most relevant</button>
    </div>
    {articles.map(article => <article className={styles.card} key={article.url}>
      <h3><a href={article.url}>{article.title}</a></h3><p>{article.outlet} · {article.published} · relevance {article.relevance}</p>
      <p>{article.summary}</p>{article.is_press_release && <small>Press release</small>}
    </article>)}
    <h2>Sections</h2>{Object.entries(data?.sections || {}).map(([name, section]) => <section className={styles.card} key={name}>
      <h3>{name} / {section.status}</h3><pre>{JSON.stringify(section.data, null, 2)}</pre>
      {(section.sources || []).map(source => <p key={source.url}><a href={source.url}>{source.title}</a></p>)}
    </section>)}
    <h2>Pros</h2><ul>{(data?.pros || []).map((item, i) => <li key={i}>{item.text} {item.source && <a href={item.source.url}>{item.source.title}</a>}</li>)}</ul>
    <h2>Cons</h2><ul>{(data?.cons || []).map((item, i) => <li key={i}>{item.text} {item.source && <a href={item.source.url}>{item.source.title}</a>}</li>)}</ul>
    <h2>Questions</h2><ul>{(data?.questions || []).map(question => <li key={question}>{question}</li>)}</ul>
    <Link className={styles.button} href={`/checkout/${encodeURIComponent(params.id)}`}>Review a simulated preview →</Link>
  </>;
}
