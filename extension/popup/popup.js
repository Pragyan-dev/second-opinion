import { fraud } from "../lib/api.js";
import { WEB_BASE } from "../config.js";

const status = document.querySelector("#status");
let currentId, timer;
function watch(id) {
  currentId = id; clearTimeout(timer);
  const link = document.querySelector("#dashboard");
  link.hidden = false; link.href = `${WEB_BASE}/fraud/${encodeURIComponent(id)}`;
  async function poll() {
    try {
      const data = await fraud(id);
      if (id !== currentId) return;
      status.textContent = data.status;
      document.querySelector("#band").textContent = data.band ? `Concern: ${data.band}` : "Checking…";
      document.querySelector("#likelihood").textContent = data.fraud_likelihood == null ? "Likelihood pending" : `Demo fraud likelihood: ${data.fraud_likelihood}%`;
      document.querySelector("#signals").replaceChildren(...(data.signals || []).map(signal => {
        const li = document.createElement("li");
        li.textContent = `${signal.check.toUpperCase()} · ${signal.label}: ${signal.detail}`;
        return li;
      }));
      if (!["done", "error"].includes(data.status)) timer = setTimeout(poll, 1000);
    } catch (error) { if (id === currentId) status.textContent = error.message; }
  }
  poll();
}
async function captureTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { return await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" });
  }
}

// Any page: offer research for the stock it is about, or for tickers it mentions.
async function offerResearch() {
  const { capture } = await captureTab();
  const tickers = (capture?.tickers || []).slice(0, 3);
  if (!tickers.length) return;
  document.querySelector("#research").hidden = false;
  document.querySelector("#tickers").replaceChildren(...tickers.map(symbol => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Research ${symbol}`;
    button.onclick = async () => {
      button.disabled = true;
      try {
        const job = await chrome.runtime.sendMessage({ type: "RESEARCH", symbol, source_url: capture.url });
        if (job.error) throw new Error(job.error);
        status.textContent = `Research for ${symbol} opened in a new tab.`;
      } catch (error) { status.textContent = error.message; }
      finally { button.disabled = false; }
    };
    return button;
  }));
}

document.querySelector("#analyze").onclick = async event => {
  event.target.disabled = true; clearTimeout(timer); currentId = undefined;
  try {
    status.textContent = "Capturing visible content…";
    const result = await captureTab();
    if (result.error) throw new Error(result.error);
    if (!result.capture) throw new Error("Open one email, an individual X post, or a supported webpage");
    const job = await chrome.runtime.sendMessage({ type: "ANALYZE", capture: result.capture });
    if (job.error) throw new Error(job.error);
    watch(job.report_id);
  } catch (error) { status.textContent = error.message; }
  finally { event.target.disabled = false; }
};
const { reportJob } = await chrome.storage.local.get("reportJob");
if (reportJob?.report_id) watch(reportJob.report_id);
offerResearch().catch(() => {});
