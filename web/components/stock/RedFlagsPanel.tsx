import { CheckMark } from "@/components/shared/CheckMark";
import { SourceLine } from "@/components/shared/Cite";
import type { Check } from "@/lib/contracts";
import type { readRedFlags } from "@/lib/sections";
import styles from "./stock.module.css";

export function RedFlagsPanel({ r }: { r: ReturnType<typeof readRedFlags> }) {
  const isOtc = r.exchange ? /otc/i.test(r.exchange) : null;
  const lowTier = r.otcTier ? /pink|expert|grey|gray/i.test(r.otcTier) : null;
  const rows: { check: Check; text: string }[] = [
    { check: isOtc == null ? "unknown" : isOtc ? "warn" : "pass", text: r.exchange ? `Listed on ${r.exchange}` : "Exchange not found" },
    { check: r.otcTier == null ? "unknown" : lowTier ? "fail" : "pass", text: r.otcTier ? `OTC tier: ${r.otcTier}` : "OTC tier not found" },
    { check: r.caveatEmptor == null ? "unknown" : r.caveatEmptor ? "fail" : "pass", text: r.caveatEmptor ? "Marked caveat emptor (buyer beware)" : r.caveatEmptor === false ? "Not marked caveat emptor" : "Caveat emptor status not checked" },
    { check: r.secSuspension == null ? "unknown" : r.secSuspension ? "fail" : "pass", text: r.secSuspension ? "SEC trading suspension" : r.secSuspension === false ? "No SEC trading suspension" : "SEC suspension status not checked" },
    { check: r.recentNameChange == null ? "unknown" : r.recentNameChange ? "warn" : "pass", text: r.recentNameChange ? "Changed its name recently" : r.recentNameChange === false ? "No recent name change" : "Name change not checked" },
  ];
  return (
    <div>
      <h2>Red flags</h2>
      <ul className={styles.facts} style={{ marginTop: 8 }}>
        {rows.map((row, i) => <li key={i}><CheckMark check={row.check} /><div>{row.text}</div></li>)}
      </ul>
      <SourceLine sources={r.sources} />
    </div>
  );
}
