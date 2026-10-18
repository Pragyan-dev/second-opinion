import { captureFrom } from "../lib/capture.js";

// Stock quote pages on finance sites. Each entry turns the page address into a ticker.
// Yahoo symbols are kept as they are (BRK-B, RELIANCE.NS); elsewhere a class dot becomes a dash.
const segment = (pattern, group = 1) => url => url.pathname.match(pattern)?.[group] || null;

// Google Finance names the exchange after a colon; non-US exchanges map to Yahoo suffixes.
const GOOGLE_SUFFIX = { NSE: ".NS", BOM: ".BO", LON: ".L", TSE: ".TO", TYO: ".T", HKG: ".HK",
  ASX: ".AX", FRA: ".F", ETR: ".DE", EPA: ".PA", AMS: ".AS", SWX: ".SW" };
const EXCHANGE = /\b(?:NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|NYSEMKT|OTCMKTS|OTC|BATS|CBOE)\s*:\s*([A-Z][A-Z.]{0,5})\b/;

function googleFinance(url) {
  const quote = url.pathname.match(/^\/finance\/(?:beta\/)?quote\/([^/:]+)(?::([A-Z]+))?/);
  if (!quote) return null;
  const suffix = GOOGLE_SUFFIX[quote[2]];
  return { symbol: suffix ? quote[1] + suffix : quote[1], keepDots: !!suffix };
}

// A Google search only counts when the person searched for a stock and the page names one.
function googleSearch(url, doc) {
  if (url.pathname !== "/search") return null;
  const query = url.searchParams.get("q") || "";
  if (!/\$[A-Za-z]|\b(?:stocks?|shares?|ticker|quote|nasdaq|nyse)\b/i.test(query)) return null;
  return query.match(/\$([A-Za-z][A-Za-z.]{0,5})\b/)?.[1]
    || query.match(EXCHANGE)?.[1]
    || (doc.body?.innerText || "").slice(0, 20000).match(EXCHANGE)?.[1]
    || null;
}

export const SITES = [
  { host: "robinhood.com", symbol: (url, doc) => segment(/^\/stocks\/([^/]+)\/?$/)(url)
    || (url.pathname.startsWith("/stocks/") ? doc.title.match(/\b([A-Z]{1,5})\b/)?.[1] : null) },
  { host: "finance.yahoo.com", keepDots: true,
    symbol: url => segment(/^\/quote\/([^/]+)/)(url) || url.searchParams.get("p") },
  { host: "www.google.com", symbol: (url, doc) => googleFinance(url) || googleSearch(url, doc) },
  { host: "www.marketwatch.com", symbol: segment(/^\/investing\/(?:stock|fund)\/([^/]+)/) },
  { host: "www.cnbc.com", symbol: segment(/^\/quotes\/([^/]+)/) },
  { host: "www.nasdaq.com", symbol: segment(/^\/market-activity\/(?:stocks|etf)\/([^/]+)/) },
  { host: "seekingalpha.com", symbol: segment(/^\/symbol\/([^/]+)/) },
  { host: "finviz.com", symbol: url => url.pathname === "/quote.ashx" ? url.searchParams.get("t") : null },
  { host: "www.tradingview.com", symbol: url => segment(/^\/symbols\/([^/]+)/)(url)?.split("-").pop() },
  { host: "www.bloomberg.com", symbol: url => segment(/^\/quote\/([^/:]+):US\b/)(url) },
  { host: "www.morningstar.com", symbol: segment(/^\/stocks\/[^/]+\/([^/]+)\/quote/) },
  { host: "stocktwits.com", symbol: segment(/^\/symbol\/([^/]+)/) },
  { host: "www.zacks.com", symbol: segment(/^\/stock\/quote\/([^/]+)/) },
  { host: "www.fool.com", symbol: segment(/^\/quote\/[^/]+\/([^/]+)/) },
  { host: "www.barrons.com", symbol: segment(/^\/market-data\/stocks\/([^/]+)/) },
  { host: "www.webull.com", symbol: url => segment(/^\/quote\/([^/]+)/)(url)?.split("-").pop() },
  { host: "www.reuters.com", symbol: url => segment(/^\/markets\/companies\/([^/.]+)/)(url) },
];

const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;

/** The ticker a page address points at, or null when it is not a stock quote page. */
export function symbolFor(url, doc = globalThis.document) {
  const site = SITES.find(entry => url.hostname === entry.host);
  if (!site) return null;
  const found = site.symbol(url, doc);
  const raw = typeof found === "object" && found ? found.symbol : found;
  const keepDots = site.keepDots || (typeof found === "object" && found?.keepDots);
  if (!raw) return null;
  let symbol;
  try { symbol = decodeURIComponent(raw).toUpperCase(); } catch { return null; }
  if (!keepDots) symbol = symbol.replace(/\./g, "-");
  return TICKER.test(symbol) ? symbol : null;
}

/** True on a site this detector knows, so the content script can watch for quote pages. */
export function onStockSite(loc = globalThis.location) {
  return SITES.some(entry => loc.hostname === entry.host);
}

export function detect() {
  const url = new URL(location.href);
  const symbol = symbolFor(url, document);
  if (!symbol || !document.body) return null;
  return captureFrom(document.querySelector("main") || document.body, "stock_page", { tickers: [symbol] });
}
