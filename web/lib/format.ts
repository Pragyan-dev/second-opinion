import type { Source } from "./contracts";

export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function pct(v: number | null | undefined, digits = 0): string {
  return v == null ? "n/a" : `${(v * 100).toFixed(digits)}%`;
}
export function signedPct(v: number | null | undefined, digits = 0): string {
  if (v == null) return "n/a";
  const s = Math.abs(v * 100).toFixed(digits);
  return `${v < 0 ? "−" : v > 0 ? "+" : ""}${s}%`;
}
export const dollars = (v: number | null | undefined, digits?: number): string =>
  v == null ? "n/a" : new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: digits ?? 2, maximumFractionDigits: digits ?? 2,
  }).format(v);

export function compactDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
export function relativeDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const days = Math.round((now - t) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export function hostname(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url; }
}
export function sourceTypeNoun(t: string): string {
  return ({ email: "an email", social_post: "an X post", website: "a website", stock_page: "a stock page" } as Record<string, string>)[t] ?? "a page";
}
export function titleCase(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
export const digitsOnly = (s: string) => s.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export function uniqueSources(lists: (Source[] | undefined)[]): Source[] {
  const seen = new Map<string, Source>();
  for (const list of lists) for (const s of list ?? []) if (!seen.has(s.url)) seen.set(s.url, s);
  return [...seen.values()];
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
  if (n < 1_000_000) return `${words(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${words(n % 1000)}` : ""}`;
  return String(n);
}
export function dollarsInWords(v: number): string {
  const cents = Math.round(v * 100);
  const d = Math.floor(cents / 100), c = cents % 100;
  const out = `${words(d)} dollar${d === 1 ? "" : "s"}${c ? ` and ${words(c)} cent${c === 1 ? "" : "s"}` : ""}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
