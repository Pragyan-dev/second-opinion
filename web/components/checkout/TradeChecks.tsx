import { CheckMark } from "@/components/shared/CheckMark";
import type { Check } from "@/lib/contracts";
import styles from "./checkout.module.css";

const state = (v: boolean | null | undefined, yes: string, no: string): { check: Check; text: string } =>
  v == null ? { check: "unknown", text: "Not checked" } : v ? { check: "pass", text: yes } : { check: "fail", text: no };

export function TradeChecks({ tradable, buyingPowerOk }: { tradable?: boolean | null; buyingPowerOk?: boolean | null }) {
  const rows = [
    { label: "Tradable on Robinhood", ...state(tradable, "Yes", "Not tradable") },
    { label: "Enough buying power", ...state(buyingPowerOk, "Yes", "Not enough") },
  ];
  return (
    <ul className={styles.checks}>
      {rows.map(r => <li key={r.label}><CheckMark check={r.check} /><span><strong>{r.label}:</strong> {r.text}</span></li>)}
    </ul>
  );
}
