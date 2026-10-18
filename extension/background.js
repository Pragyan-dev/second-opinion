import { analyze, research } from "./lib/api.js";
import { WEB_BASE } from "./config.js";

// Start a fraud check and open its report, where the agent's browser shows the site.
// From a page (Verify Authenticity, link guard) the report opens next to that page's tab.
async function analyzeAndOpen(capture, tab) {
  const job = await analyze(capture);
  await chrome.storage.local.set({ reportJob: job });
  await chrome.tabs.create({
    url: `${WEB_BASE}/fraud/${encodeURIComponent(job.report_id)}`,
    ...(tab ? { index: tab.index + 1, openerTabId: tab.id } : {}),
  });
  return job;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "ANALYZE" || message.type === "ANALYZE_AND_OPEN") {
    analyzeAndOpen(message.capture, sender.tab).then(respond).catch(error => respond({ error: error.message }));
    return true;
  }
  if (message.type === "RESEARCH") {
    research(message.symbol, message.source_url).then(async job => {
      await chrome.tabs.create({ url: `${WEB_BASE}/stock/${encodeURIComponent(job.research_id)}` });
      respond(job);
    }).catch(error => respond({ error: error.message }));
    return true;
  }
});
// TODO(A): add report history after the fixture-backed flow is stable.
