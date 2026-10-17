import { API_BASE } from "../config.js";

/** @typedef {'pending'|'running'|'done'|'error'} Status */
/** @typedef {'pass'|'warn'|'fail'|'unknown'} Check */
/** @typedef {'low'|'elevated'|'high'|'cant_tell'} Band */
/** @typedef {{url:string,title:string,text:string,links:string[],emails:string[],phones:string[],tickers:string[]}} PageCapture */
/** @typedef {{title:string,url:string}} Source */
/** @typedef {{id:string,label:string,check:Check,detail:string,source:Source|null,weight:number}} Signal */
/** @typedef {{firm:string,crd:string|null,phone:string|null,website:string|null,source:Source}} OfficialContact */
/** @typedef {{report_id:string,status:Status,page_url:string,entities:Object<string,string[]>,signals:Signal[],band:Band|null,band_reason:string|null,explanation:string|null,official_contact:OfficialContact|null}} Report */
/** @typedef {{agent:string,status:Status,data:Object,sources:Source[],error:string|null}} AgentResult */
/** @typedef {{xray_id:string,symbol:string,asset_type:'stock'|'etf'|'unknown',status:Status,sections:Object<string,AgentResult>,summary:string|null,questions:string[]}} StockXray */
/** @typedef {{customer_id:string,from_account_id:string,payee_account_id:string,payee_name:string,amount:number,report_id:string|null}} PaymentRequest */
/** @typedef {{level:'ok'|'caution'|'stop',flags:Signal[],hold_recommended:boolean,linked_report:string|null,official_contact:OfficialContact|null}} PaymentCheck */

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

/** @param {PageCapture} capture */
export const analyze = capture => api("/v1/analyze", capture);
/** @returns {Promise<Report>} */
export const report = id => api(`/v1/reports/${encodeURIComponent(id)}`);
export const createXray = symbol => api("/v1/xray", { symbol });
/** @returns {Promise<StockXray>} */
export const xray = id => api(`/v1/xray/${encodeURIComponent(id)}`);
