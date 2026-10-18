import { SourceLine } from "@/components/shared/Cite";
import { dollars, pct } from "@/lib/format";
import type { readMarket } from "@/lib/sections";
import styles from "./stock.module.css";

export function VolatilityPer1000({ m, symbol }: { m: ReturnType<typeof readMarket>; symbol: string }) {
  const { move, spyMove } = m;
  const scale = Math.max(move ?? 0, spyMove ?? 0) || 1;
  const ratio = move != null && spyMove ? move / spyMove : null;
  return (
    <div>
      <h2>How much it moves</h2>
      {move == null ? <p className="muted" style={{ marginTop: 8 }}>No volatility figure was returned.</p> : (
        <>
          <div className={styles.bars} role="img" aria-label={`$1,000 in ${symbol} moves about ${dollars(move, 0)} on a typical day${spyMove != null ? `, against ${dollars(spyMove, 0)} for SPY` : ""}`}>
            <div className={styles.barRow}>
              <span>$1,000 in {symbol} moves about <strong className="num">{dollars(move, 0)}</strong> on a typical day</span>
              <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(move / scale) * 100}%` }} /></div>
            </div>
            {spyMove != null && (
              <div className={styles.barRow}>
                <span>$1,000 in SPY moves about <strong className="num">{dollars(spyMove, 0)}</strong></span>
                <div className={styles.barTrack}><div className={`${styles.barFill} ${styles.spy}`} style={{ width: `${(spyMove / scale) * 100}%` }} /></div>
              </div>
            )}
          </div>
          {ratio != null && <p>About {ratio.toFixed(ratio >= 10 ? 0 : 1)}&times; as jumpy as the S&amp;P 500.</p>}
          <p className="small muted">A typical daily move, not a forecast.</p>
        </>
      )}
      <p className="small" style={{ marginTop: 8 }}>
        {m.vol30 != null && <>30-day volatility {pct(m.vol30)}. </>}
        {m.vol90 != null && <>90-day volatility {pct(m.vol90)}. </>}
        {m.volumeVs30d != null && (
          <span style={m.volumeVs30d > 3 ? { fontWeight: 600, borderBottom: "2px solid var(--ochre)" } : undefined}>
            Volume is {m.volumeVs30d.toFixed(1)}&times; its 30-day average.
          </span>
        )}
      </p>
      <SourceLine sources={m.sources} />
    </div>
  );
}
