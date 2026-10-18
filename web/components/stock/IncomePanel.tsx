import { SourceLine } from "@/components/shared/Cite";
import { compactDate, pct, signedPct } from "@/lib/format";
import type { readIncome } from "@/lib/sections";

export function IncomePanel({ i }: { i: ReturnType<typeof readIncome> }) {
  return (
    <div>
      <h2>Dividends</h2>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {i.paysDividend === false && <p>Pays no dividend</p>}
        {i.paysDividend == null && <p className="muted">Dividend status not available</p>}
        {i.paysDividend && (
          <>
            {i.yieldTtm != null && <p>Yield over the last 12 months: <strong>{pct(i.yieldTtm, 2)}</strong></p>}
            {i.frequency && <p>Paid {i.frequency}</p>}
            {i.lastExDate && <p>Last ex-dividend date {compactDate(i.lastExDate)}</p>}
            {i.years != null && i.years > 0 && <p>Paid without a break for {i.years} {i.years === 1 ? "year" : "years"}</p>}
          </>
        )}
        {(i.priceReturn1y != null || i.totalReturn1y != null) && (
          <p className="small muted">
            1-year price return {signedPct(i.priceReturn1y)}; total return with dividends {signedPct(i.totalReturn1y)}.
          </p>
        )}
      </div>
      <SourceLine sources={i.sources} />
    </div>
  );
}
