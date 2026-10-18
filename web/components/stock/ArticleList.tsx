"use client";
import { useMemo, useState } from "react";
import type { Article } from "@/lib/contracts";
import { SourceLine } from "@/components/shared/Cite";
import { Toggle } from "@/components/shared/Toggle";
import type { Source } from "@/lib/contracts";
import { compactDate, pct, relativeDate } from "@/lib/format";
import styles from "./stock.module.css";

type Sort = "recent" | "relevant";

export function ArticleList({ articles, pressShare, sources }: { articles: Article[]; pressShare: number | null; sources: Source[] }) {
  const [sort, setSort] = useState<Sort>("recent");
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...articles].sort((a, b) => sort === "recent"
    ? Date.parse(b.published) - Date.parse(a.published) : b.relevance - a.relevance), [articles, sort]);
  const shown = all ? sorted : sorted.slice(0, 6);
  return (
    <div>
      <div className={styles.articleTools}>
        <div>
          <h2>Coverage</h2>
          {pressShare != null && (
            <p className="small" style={pressShare > 0.5 ? { borderBottom: "2px solid var(--ochre)", display: "inline-block" } : undefined}>
              {pct(pressShare)} of this coverage is press releases
            </p>
          )}
        </div>
        <Toggle label="Sort articles" value={sort} onChange={setSort}
          options={[{ value: "recent", label: "Most recent" }, { value: "relevant", label: "Most relevant" }]} />
      </div>
      {articles.length === 0 ? <p className="muted">No articles were found.</p> : (
        <ol aria-live="polite">
          {shown.map(a => {
            const filled = Math.max(0, Math.min(5, Math.round(a.relevance * 5)));
            return (
              <li key={a.url} className={styles.article}>
                <h3><a href={a.url} target="_blank" rel="noreferrer">{a.title}<span className="sr-only"> (opens in a new tab)</span></a></h3>
                <p className="small muted">
                  {a.outlet}, <span title={compactDate(a.published)}>{relativeDate(a.published)}</span>{" "}
                  {a.is_press_release && <span className={styles.pr}>Press release</span>}{" "}
                  <span className={styles.meter} aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < filled ? "on" : ""} />)}</span>
                  <span className="sr-only">Relevance {filled} of 5</span>
                </p>
                <p>{a.summary}</p>
              </li>
            );
          })}
        </ol>
      )}
      {!all && sorted.length > 6 && (
        <button type="button" className="btn btnQuiet" onClick={() => setAll(true)}>Show all {sorted.length}</button>
      )}
      <SourceLine sources={sources} />
    </div>
  );
}
