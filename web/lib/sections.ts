import type { AgentResult, Article, Source } from "./contracts";
import { num } from "./format";

type Maybe = AgentResult | undefined;
const d = (a: Maybe): Record<string, unknown> => (a?.data ?? {}) as Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const asOf = (a: Maybe) => str(d(a).as_of);
const sources = (a: Maybe): Source[] => a?.sources ?? [];

export interface PricePoint { date: string | null; close: number }
// Accepts number[] or {date, close}[].
export function readSeries(v: unknown): PricePoint[] {
  if (!Array.isArray(v)) return [];
  const out: PricePoint[] = [];
  for (const p of v) {
    if (typeof p === "number" && Number.isFinite(p)) out.push({ date: null, close: p });
    else if (p && typeof p === "object") {
      const close = num((p as { close?: unknown }).close);
      if (close != null) out.push({ date: str((p as { date?: unknown }).date), close });
    }
  }
  return out;
}

export function readMarket(a: Maybe) {
  const x = d(a);
  return { price: num(x.price), vol30: num(x.vol_30d), vol90: num(x.vol_90d), move: num(x.move_per_1000_usd),
    spyMove: num(x.spy_move_per_1000_usd), volumeVs30d: num(x.volume_vs_30d), maxDrawdown: num(x.max_drawdown_1y),
    asOf: asOf(a), sources: sources(a) };
}
export function readHistory(a: Maybe) {
  const x = d(a);
  return { prices1y: readSeries(x.prices_1y), prices5y: readSeries(x.prices_5y), high52: num(x.high_52w), low52: num(x.low_52w),
    return1y: num(x.return_1y), return5y: num(x.return_5y), maxDrawdown: num(x.max_drawdown_1y),
    earnings: Array.isArray(x.earnings_dates) ? (x.earnings_dates as unknown[]).filter((e): e is string => typeof e === "string") : [],
    asOf: asOf(a), sources: sources(a) };
}
export function readIncome(a: Maybe) {
  const x = d(a);
  return { paysDividend: bool(x.pays_dividend), yieldTtm: num(x.yield_ttm), frequency: str(x.frequency), lastExDate: str(x.last_ex_date),
    years: num(x.years_uninterrupted), priceReturn1y: num(x.price_return_1y), totalReturn1y: num(x.total_return_1y),
    asOf: asOf(a), sources: sources(a) };
}
export function readRedFlags(a: Maybe) {
  const x = d(a);
  return { exchange: str(x.exchange), otcTier: str(x.otc_tier), caveatEmptor: bool(x.caveat_emptor), secSuspension: bool(x.sec_suspension),
    recentNameChange: bool(x.recent_name_change), asOf: asOf(a), sources: sources(a) };
}
export function readNews(a: Maybe) {
  const x = d(a);
  return { items: Array.isArray(x.items) ? (x.items as Article[]) : [], pressShare: num(x.press_release_share),
    asOf: asOf(a), sources: sources(a) };
}
