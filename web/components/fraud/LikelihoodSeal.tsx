"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Band } from "@/lib/contracts";
import { rosette } from "./guilloche";
import styles from "./seal.module.css";

export const BAND_LABEL: Record<string, string> = { low: "Low", elevated: "Elevated", high: "High", cant_tell: "Can't tell" };
export const BAND_COLOR: Record<string, string> = {
  low: "var(--verified)", elevated: "var(--ochre)", high: "var(--seal)", cant_tell: "var(--graphite)",
};

interface Props { reportId: string; likelihood: number | null | undefined; band: Band | undefined; running: boolean }

export function LikelihoodSeal({ reportId, likelihood, band, running }: Props) {
  const hasNumber = likelihood != null && band != null && band !== "cant_tell";
  const cantTell = band === "cant_tell" || (!running && likelihood == null);
  const p = hasNumber ? Math.max(0, Math.min(1, likelihood! / 100)) : 0;

  const layers = useMemo(() => {
    const base = { cx: 180, cy: 180, rInner: 40, rOuter: 170, rings: 14, lobes: 9, amp: 7, seed: reportId };
    if (!hasNumber) return { a: rosette({ ...base, rings: 3, rInner: 150 }), b: null, bColor: "", bOffset: [0, 0] as number[] };
    if (band === "high") return { a: rosette({ ...base, jitter: p * 3, gapFraction: p * 0.35 }),
      b: rosette({ ...base, jitter: p * 3, gapFraction: p * 0.35, seed: reportId + "b", phase: 0.15 }), bColor: "var(--seal)", bOffset: [p * 7, p * -4] };
    if (band === "elevated") return { a: rosette({ ...base, jitter: p * 2, gapFraction: p * 0.25 }),
      b: rosette({ ...base, jitter: p * 2, gapFraction: p * 0.25, seed: reportId + "b", phase: 0.1 }), bColor: "var(--ochre)", bOffset: [p * 4, p * 2] };
    return { a: rosette(base), b: null, bColor: "", bOffset: [0, 0] as number[] };
  }, [reportId, hasNumber, band, p]);

  // Count-up runs once per report, when the number first arrives.
  const animated = useRef<string | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!hasNumber) { setShown(null); return; }
    if (animated.current === reportId) { setShown(likelihood!); return; }
    animated.current = reportId;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(likelihood!); return; }
    setPlay(true); setShown(0);
    const start = performance.now() + 1200, dur = 700;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      setShown(Math.round(likelihood! * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hasNumber, likelihood, reportId]);

  const color = band ? BAND_COLOR[band] : "var(--graphite)";
  const label = hasNumber
    ? `Estimated likelihood ${likelihood} percent, ${BAND_LABEL[band!].toLowerCase()}`
    : cantTell ? "Estimated likelihood: can't tell" : "Estimated likelihood: still checking";
  const ringClass = `${styles.ring} ${play ? styles.draw : ""}`;

  return (
    <div className={styles.seal}>
      <svg viewBox="0 0 360 360" role="img" aria-label={label} className={styles.svg}>
        {!hasNumber && !cantTell && (
          <circle cx="180" cy="180" r="150" fill="none" stroke="var(--engrave)" strokeWidth="1" strokeDasharray="2 5" />
        )}
        {layers.b && (
          <g className={play ? styles.misreg : undefined}
            style={{ ["--dx" as string]: `${layers.bOffset[0]}px`, ["--dy" as string]: `${layers.bOffset[1]}px`,
              transform: play ? undefined : `translate(${layers.bOffset[0]}px, ${layers.bOffset[1]}px)` }}>
            {layers.b.map((d, i) => <path key={i} d={d} fill="none" stroke={layers.bColor} strokeOpacity=".7" strokeWidth=".6" />)}
          </g>
        )}
        <g>
          {layers.a.map((d, i) => (
            <path key={i} d={d} pathLength={1} fill="none" className={ringClass}
              stroke={hasNumber ? "var(--ink)" : "var(--graphite)"} strokeOpacity={hasNumber ? 0.55 : 0.8} strokeWidth=".6"
              strokeDasharray={hasNumber ? undefined : "0.02 0.012"}
              style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </g>
      </svg>
      <div className={styles.center} aria-hidden="true">
        {hasNumber ? (
          <>
            <div className={styles.figure} style={{ color }}><span className="num">{shown ?? likelihood}</span><span className={styles.pct}>%</span></div>
            <div className={styles.caption}>estimated likelihood</div>
          </>
        ) : cantTell ? (
          <>
            <div className={`num ${styles.cant}`} style={{ color }}>Can&apos;t tell</div>
            <div className={styles.caption}>estimated likelihood</div>
          </>
        ) : (
          <div className={styles.caption}>Checking…</div>
        )}
      </div>
    </div>
  );
}
