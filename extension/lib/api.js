import { API_BASE } from "../config.js";

/** @typedef {import("./contracts").Capture} Capture */
/** @typedef {import("./contracts").FraudReport} FraudReport */
/** @typedef {import("./contracts").StockReport} StockReport */
/** @typedef {import("./contracts").OrderTicket} OrderTicket */
/** @typedef {import("./contracts").OrderPreview} OrderPreview */
/** @typedef {import("./contracts").FundingRequest} FundingRequest */

export async function api(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`API ${response.status}: ${await response.text()}`);
  return response.json();
}
/** @param {Capture} capture */
export const analyze = capture => api("/v1/fraud/analyze", capture);
/** @returns {Promise<FraudReport>} */
export const fraud = id => api(`/v1/fraud/${encodeURIComponent(id)}`);
export const research = (symbol, source_url) => api("/v1/stock/research", { symbol, source_url });
/** @returns {Promise<StockReport>} */
export const stock = id => api(`/v1/stock/${encodeURIComponent(id)}`);
