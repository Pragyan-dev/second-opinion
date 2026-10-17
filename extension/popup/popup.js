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
document.querySelector("#analyze").onclick = async event => {
  event.target.disabled = true; clearTimeout(timer); currentId = undefined;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    status.textContent = "Capturing visible content…";
    let result;
    try { result = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      result = await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE" });
    }
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
