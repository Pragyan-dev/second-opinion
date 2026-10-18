import type { FraudReport } from "@/lib/contracts";
import { BAND_COLOR, BAND_LABEL } from "./LikelihoodSeal";
import styles from "./fraud.module.css";

const GLYPH: Record<string, string> = { low: "✓", elevated: "!", high: "✕", cant_tell: "?" };

export function BandStatement({ report }: { report: FraudReport }) {
  const band = report.band;
  const running = report.status === "pending" || report.status === "running";
  return (
    <div className={styles.statement}>
      {band ? (
        <>
          <p className={styles.bandWord} style={{ color: BAND_COLOR[band] }}>
            <span className="check" style={{ color: BAND_COLOR[band] }} aria-hidden="true">{GLYPH[band]}</span>
            {BAND_LABEL[band]}
          </p>
          {band === "cant_tell" ? (
            <>
              {report.band_reason && <p className={styles.reason}>{report.band_reason}</p>}
              <p className={styles.reason}>There wasn&apos;t enough to check, so we can&apos;t estimate a likelihood.</p>
            </>
          ) : report.band_reason && <p className={styles.reason}>{report.band_reason}</p>}
          {report.explanation && <p className="measure">{report.explanation}</p>}
        </>
      ) : (
        <p className={styles.reason}>{running ? "Checking… the estimate appears once every check has reported." : "No estimate was returned."}</p>
      )}
      <p className={styles.footnote}>
        An estimate from the Jev red-flag model and registry checks, using hand-set weights. Not a verdict about any firm.
      </p>
    </div>
  );
}
