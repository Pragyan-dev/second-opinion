// Cashtags ($AAPL) and exchange-prefixed symbols (NASDAQ: AAPL).
const TICKERS = /\$([A-Z]{1,5})\b|\b(?:NASDAQ|NYSE|NYSEARCA|NYSEAMERICAN|OTCMKTS|BATS)\s*:\s*([A-Z]{1,5})\b/g;

/** @returns {import("./contracts").Capture} */
export function captureFrom(root, source_type, extra = {}) {
  const text = (root.innerText || "").slice(0, 20000);
  const anchors = [...root.querySelectorAll("a[href]")];
  return {
    source_type, url: location.href, title: document.title, text, sender: null,
    links: [...new Set(anchors.map(a => a.href))],
    emails: [...new Set(anchors.filter(a => a.href.startsWith("mailto:")).map(a => a.href.slice(7).split("?")[0]))],
    phones: [...new Set(anchors.filter(a => a.href.startsWith("tel:")).map(a => a.href.slice(4)))],
    tickers: [...new Set([...text.matchAll(TICKERS)].map(m => m[1] || m[2]))],
    ...extra,
  };
}
