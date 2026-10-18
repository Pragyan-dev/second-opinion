import Link from "next/link";
import { titleCase } from "@/lib/format";
import styles from "./fraud.module.css";

const LABELS: Record<string, string> = {
  firms: "Firms", people: "People", crds: "CRD numbers", phones: "Phone numbers", emails: "Email addresses",
  domains: "Domains", tickers: "Stock symbols", handles: "Handles",
};

export function EntityChips({ entities, stockResearchId, reportId }: { entities: Record<string, string[]>; stockResearchId?: string | null; reportId: string }) {
  const keys = Object.keys(entities ?? {}).filter(k => entities[k]?.length);
  if (!keys.length) return <p className="muted">Nothing was picked out.</p>;
  return (
    <div>
      {keys.map(k => (
        <div key={k} className={styles.entRow}>
          <h3>{LABELS[k] ?? titleCase(k)}</h3>
          <div className={styles.chips}>
            {entities[k].map(v => k === "tickers" && stockResearchId
              ? <Link key={v} className={styles.chip} href={`/stock/${encodeURIComponent(stockResearchId)}?fraud=${encodeURIComponent(reportId)}`}>{v}</Link>
              : <span key={v} className={styles.chip}>{v}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
