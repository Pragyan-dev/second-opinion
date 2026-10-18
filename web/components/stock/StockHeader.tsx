import Link from "next/link";
import type { StockReport } from "@/lib/contracts";
import { compactDate, dollars } from "@/lib/format";
import type { readMarket, readRedFlags } from "@/lib/sections";
import styles from "./stock.module.css";

export function StockHeader({ report, market, flags, fraudId, asOf }: {
  report: StockReport; market: ReturnType<typeof readMarket>; flags: ReturnType<typeof readRedFlags>; fraudId: string | null; asOf: string | null;
}) {
  const exch = [flags.exchange, flags.otcTier].filter(Boolean).join(", ");
  return (
    <div>
      {fraudId && <p className="small"><Link href={`/fraud/${encodeURIComponent(fraudId)}`}>Back to the fraud check</Link></p>}
      <div className={styles.headerRow}>
        <h1 className={styles.symbol}>{report.symbol}</h1>
        {market.price != null && <span className={`num ${styles.price}`}>{dollars(market.price)}</span>}
        {report.asset_type === "etf" && <span className={styles.tag}>ETF</span>}
        {exch && <span className="muted">{exch}</span>}
      </div>
      {asOf && <p className="small muted">Cached data as of {compactDate(asOf)}</p>}
    </div>
  );
}
