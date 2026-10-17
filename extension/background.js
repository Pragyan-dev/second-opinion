import { analyze, research } from "./lib/api.js";
import { WEB_BASE } from "./config.js";

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "ANALYZE") {
    analyze(message.capture).then(async job => {
      await chrome.storage.local.set({ reportJob: job }); respond(job);
    }).catch(error => respond({ error: error.message }));
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
