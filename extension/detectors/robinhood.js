import { captureFrom } from "../lib/capture.js";

export function detect() {
  if (location.hostname !== "robinhood.com" || !location.pathname.startsWith("/stocks/")) return null;
  const symbol = location.pathname.match(/^\/stocks\/([A-Za-z0-9.-]+)\/?$/)?.[1]
    || document.title.match(/\b([A-Z]{1,5})\b/)?.[1];
  if (!symbol || !document.body) return null;
  return captureFrom(document.querySelector("main") || document.body, "stock_page", { tickers: [symbol.toUpperCase()] });
}
