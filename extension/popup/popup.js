import { report } from "../lib/api.js";
import { WEB_BASE } from "../config.js";

const status = document.querySelector("#status");
let currentId, timer;
function watch(id) {
  currentId = id; clearTimeout(timer);
  document.querySelector("#full").hidden = false;
  async function poll() {
    try {
      const data = await report(id);
      if (id !== currentId) return;
      status.textContent = data.status;
      document.querySelector("#band").textContent = data.band ? `Concern: ${data.band}` : "Checking…";
      document.querySelector("#signals").replaceChildren(...data.signals.map(signal => {
        const li = document.createElement("li");
        li.textContent = `${signal.check.toUpperCase()} · ${signal.label}: ${signal.detail}`;
        return li;
      }));
      if (!["done", "error"].includes(data.status)) timer = setTimeout(poll, 1000);
    } catch (error) { status.textContent = error.message; }
  }
  poll();
}
document.querySelector("#analyze").onclick = async event => {
  event.target.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    status.textContent = "Capturing page…";
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const [{ result: capture }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const capture = window.SecondOpinion.extractPage();
      window.SecondOpinion.highlightTickers(); return capture;
    } });
    const job = await chrome.runtime.sendMessage({ type: "ANALYZE", capture });
    if (job.error) throw new Error(job.error);
    watch(job.report_id);
  } catch (error) { status.textContent = `${error.message}. Open the demo page on localhost:5500 and try again.`; }
  finally { event.target.disabled = false; }
};
document.querySelector("#full").onclick = () => chrome.tabs.create({ url: `${WEB_BASE}/report/${encodeURIComponent(currentId)}` });
const { reportJob } = await chrome.storage.local.get("reportJob");
if (reportJob?.report_id) watch(reportJob.report_id);
