"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { HatchDefs } from "@/components/shared/Hatch";
import { SourceLine } from "@/components/shared/Cite";
import { Toggle } from "@/components/shared/Toggle";
import type { Source } from "@/lib/contracts";
import { compactDate, dollars, signedPct } from "@/lib/format";
import type { PricePoint } from "@/lib/sections";
import styles from "./stock.module.css";

type Range = "1y" | "5y";
interface Props {
  prices1y: PricePoint[]; prices5y: PricePoint[]; high52: number | null; low52: number | null;
  maxDrawdown: number | null; return1y: number | null; return5y: number | null; earnings: string[]; sources: Source[];
}

function computeDrawdown(pts: PricePoint[]) {
  let peak = 0, best = { dd: 0, peak: 0, trough: 0 };
  pts.forEach((p, i) => {
    if (p.close > pts[peak].close) peak = i;
    const dd = pts[peak].close ? p.close / pts[peak].close - 1 : 0;
    if (dd < best.dd) best = { dd, peak, trough: i };
  });
  return best;
}

export function PriceHistoryChart(props: Props) {
  const [range, setRange] = useState<Range>("1y");
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(280, el.clientWidth)));
    ro.observe(el); setWidth(Math.max(280, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const pts = range === "1y" ? props.prices1y : props.prices5y;
  const ret = range === "1y" ? props.return1y : props.return5y;
  const mobile = width < 560;
  const H = mobile ? 220 : 320;
  const m = { l: 56, r: mobile ? 12 : 16, t: 16, b: 28 };

  const geo = useMemo(() => {
    if (pts.length < 2) return null;
    const showBand = range === "1y" && props.high52 != null && props.low52 != null;
    let lo = Math.min(...pts.map(p => p.close)), hi = Math.max(...pts.map(p => p.close));
    if (showBand) { lo = Math.min(lo, props.low52!); hi = Math.max(hi, props.high52!); }
    const pad = (hi - lo) * 0.06 || 1;
    lo = Math.max(0, lo - pad); hi += pad;
    const x = (i: number) => m.l + (i / (pts.length - 1)) * (width - m.l - m.r);
    const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.close).toFixed(1)}`).join("");
    const echo = pts.map((p, i) => `${i ? "L" : "M"}${(x(i) + 2).toFixed(1)} ${(y(p.close) + 2.5).toFixed(1)}`).join("");
    const yTicks = Array.from({ length: 4 }, (_, k) => lo + ((hi - lo) * k) / 3);
    const dated = pts.every(p => p.date);
    const xTicks = dated ? Array.from({ length: mobile ? 4 : 5 }, (_, k) => Math.round((k * (pts.length - 1)) / (mobile ? 3 : 4))) : [];
    const earn: number[] = [];
    if (dated) for (const e of props.earnings) {
      const t = Date.parse(e);
      if (Number.isNaN(t) || t < Date.parse(pts[0].date!) || t > Date.parse(pts[pts.length - 1].date!)) continue;
      let bi = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.abs(Date.parse(p.date!) - t); if (d < bd) { bd = d; bi = i; } });
      earn.push(bi);
    }
    return { showBand, lo, hi, x, y, line, echo, yTicks, xTicks, earn, dated };
  }, [pts, range, props.high52, props.low52, props.earnings, width, H, mobile, m.l, m.r, m.t, m.b]);

  const dd = useMemo(() => (range === "1y" && props.prices1y.length > 1 ? computeDrawdown(props.prices1y) : null), [range, props.prices1y]);

  if (props.prices1y.length < 2 && props.prices5y.length < 2) return <p className="muted">Not enough price history to draw a chart.</p>;

  const retColor = ret == null ? "var(--ink-soft)" : ret < 0 ? "var(--seal)" : "var(--verified)";
  const takeaway = `${range === "1y" ? "1 year" : "5 year"} price history${ret != null ? `, ${signedPct(ret)} over the period` : ""}${dd && props.maxDrawdown != null ? `, largest drop ${signedPct(props.maxDrawdown)}` : ""}`;

  function moveTo(clientX: number, rect: DOMRect) {
    if (!geo) return;
    const frac = (clientX - rect.left - m.l) / (rect.width - m.l - m.r);
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(frac * (pts.length - 1)))));
  }
  const hp = hover != null ? pts[hover] : null;

  return (
    <div>
      <div className={styles.chartHead}>
        <p className={styles.returnLine} style={{ color: retColor }}>
          {ret == null ? "Return not available" : `${signedPct(ret)} over ${range === "1y" ? "1 year" : "5 years"}`}
        </p>
        <Toggle label="Price range" value={range} onChange={r => { setRange(r); setHover(null); }}
          options={[{ value: "1y", label: "1 year" }, { value: "5y", label: "5 years" }]} />
      </div>
      <div ref={wrap} className={styles.chartWrap}>
        {geo ? (
          <svg key={range} className={`${styles.chart} fadeIn`} width={width} height={H} role="img" aria-label={takeaway} tabIndex={0}
            onPointerMove={e => moveTo(e.clientX, e.currentTarget.getBoundingClientRect())} onPointerLeave={() => setHover(null)}
            onKeyDown={e => {
              if (e.key === "ArrowLeft") { e.preventDefault(); setHover(h => Math.max(0, (h ?? pts.length) - 1)); }
              if (e.key === "ArrowRight") { e.preventDefault(); setHover(h => Math.min(pts.length - 1, (h ?? -1) + 1)); }
            }} onBlur={() => setHover(null)}>
            <HatchDefs />
            {geo.yTicks.map(v => (
              <g key={v}>
                <line x1={m.l} x2={width - m.r} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--engrave)" strokeOpacity=".4" />
                <text x={m.l - 8} y={geo.y(v) + 4} textAnchor="end" fontSize="12" fill="var(--ink-soft)">{dollars(v, v < 10 ? 2 : 0)}</text>
              </g>
            ))}
            {geo.showBand && (
              <g>
                <rect x={m.l} width={width - m.l - m.r} y={geo.y(props.high52!)} height={Math.max(1, geo.y(props.low52!) - geo.y(props.high52!))}
                  fill="url(#hatch-engrave)" opacity=".28" />
                <text x={width - m.r - 4} y={geo.y(props.high52!) + 14} textAnchor="end" fontSize="12" fill="var(--ink)">
                  52-week range {dollars(props.low52)} to {dollars(props.high52)}
                </text>
              </g>
            )}
            {geo.xTicks.map(i => (
              <text key={i} x={geo.x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontSize="12" fill="var(--ink-soft)">
                {compactDate(pts[i].date)}
              </text>
            ))}
            {geo.earn.map(i => (
              <g key={i}><line x1={geo.x(i)} x2={geo.x(i)} y1={H - m.b} y2={H - m.b + 7} stroke="var(--ink)" strokeWidth="2" /><title>Earnings</title></g>
            ))}
            <path d={geo.echo} fill="none" stroke="var(--engrave)" strokeWidth="1.25" />
            <path d={geo.line} fill="none" stroke="var(--ink)" strokeWidth="1.75" strokeLinejoin="round" />
            {dd && dd.dd < 0 && (
              <g stroke="var(--seal)" fill="none" strokeWidth="1.5">
                <path d={`M${geo.x(dd.peak) - 6} ${geo.y(pts[dd.peak].close)}H${geo.x(dd.peak) + 6}M${geo.x(dd.peak)} ${geo.y(pts[dd.peak].close)}V${geo.y(pts[dd.trough].close)}M${geo.x(dd.trough) - 6} ${geo.y(pts[dd.trough].close)}H${geo.x(dd.trough) + 6}`} strokeDasharray="4 3" />
                <text stroke="none" fill="var(--seal)" fontSize="13" fontWeight="600"
                  x={geo.x(dd.peak) + 8} y={(geo.y(pts[dd.peak].close) + geo.y(pts[dd.trough].close)) / 2}>
                  Largest drop {signedPct(props.maxDrawdown ?? dd.dd)}
                </text>
              </g>
            )}
            {hp && hover != null && (
              <g>
                <line x1={geo.x(hover)} x2={geo.x(hover)} y1={m.t} y2={H - m.b} stroke="var(--uv)" strokeWidth="1" />
                <circle cx={geo.x(hover)} cy={geo.y(hp.close)} r="4" fill="var(--paper)" stroke="var(--uv)" strokeWidth="2" />
                <g transform={`translate(${Math.min(width - 150, Math.max(m.l, geo.x(hover) - 70))}, ${m.t})`}>
                  <rect width="140" height="38" fill="var(--ink)" />
                  <text x="8" y="16" fontSize="12" fill="var(--paper-raised)">{hp.date ? compactDate(hp.date) : `Point ${hover + 1}`}</text>
                  <text x="8" y="31" fontSize="13" fontWeight="600" fill="var(--paper-raised)">{dollars(hp.close)}</text>
                </g>
              </g>
            )}
          </svg>
        ) : <p className="muted">Not enough price history to draw a chart.</p>}
      </div>
      <table className="sr-only">
        <caption>{takeaway}</caption>
        <thead><tr><th>Date</th><th>Close</th></tr></thead>
        <tbody>{pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 12)) === 0).map((p, i) => <tr key={i}><td>{p.date ?? i + 1}</td><td>{dollars(p.close)}</td></tr>)}</tbody>
      </table>
      <SourceLine sources={props.sources} />
    </div>
  );
}
