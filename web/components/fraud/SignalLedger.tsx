import type { Check, Signal } from "@/lib/contracts";
import { CheckMark } from "@/components/shared/CheckMark";
import { Cite } from "@/components/shared/Cite";
import { JEV_FLAG_IDS } from "@/lib/fraudSteps";
import styles from "./fraud.module.css";

const ORDER: Record<Check, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };
const byImportance = (a: Signal, b: Signal) => ORDER[a.check] - ORDER[b.check] || (b.weight ?? 0) - (a.weight ?? 0);

function Row({ s }: { s: Signal }) {
  return (
    <li className={`${styles.ledgerRow} fadeIn`}>
      <CheckMark check={s.check} />
      <div>
        <span className={styles.ledgerLabel}>{s.label}</span>
        {s.detail && <> <span>{s.detail}</span></>}
        <Cite source={s.source} />
      </div>
    </li>
  );
}

export function SignalLedger({ signals, running }: { signals: Signal[]; running: boolean }) {
  if (!signals.length) return <p className="muted">{running ? "Checking…" : "No checks were returned."}</p>;
  const wording = signals.filter(s => JEV_FLAG_IDS.includes(s.id)).sort(byImportance);
  const checks = signals.filter(s => !JEV_FLAG_IDS.includes(s.id)).sort(byImportance);
  const n = (c: Check) => checks.filter(s => s.check === c).length;
  const didNot = n("fail"), look = n("warn") + n("unknown"), passed = n("pass");
  return (
    <div>
      <p className={styles.ledgerCount}>
        {checks.length} {checks.length === 1 ? "check" : "checks"}: {didNot} didn&apos;t pass, {look} need a look, {passed} passed
        {wording.length > 0 && `, and ${wording.length} wording ${wording.length === 1 ? "match" : "matches"}`}
      </p>
      <ul>{checks.map(s => <Row key={s.id} s={s} />)}</ul>
      {wording.length > 0 && (
        <>
          <h3 className={styles.ledgerHead}>Wording that matched</h3>
          <ul>{wording.map(s => <Row key={s.id} s={s} />)}</ul>
        </>
      )}
    </div>
  );
}
