import Link from "next/link";
import styles from "./checkout.module.css";

export function LinkedReports({ researchId, symbol, fraudId }: { researchId: string; symbol?: string; fraudId: string | null }) {
  return (
    <nav className={`${styles.linked} small`} aria-label="Related reports">
      <Link href={`/stock/${encodeURIComponent(researchId)}${fraudId ? `?fraud=${encodeURIComponent(fraudId)}` : ""}`}>
        Stock report{symbol ? ` for ${symbol}` : ""}
      </Link>
      {fraudId && <Link href={`/fraud/${encodeURIComponent(fraudId)}`}>Fraud check</Link>}
    </nav>
  );
}
