import { analyze, createXray } from "./lib/api.js";

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "ANALYZE") {
    // The service worker owns the short POST; closing the popup does not cancel the job.
    analyze(message.capture).then(async job => {
      await chrome.storage.local.set({ reportJob: job }); respond(job);
    }).catch(error => respond({ error: error.message }));
    return true;
  }
  if (message.type === "XRAY" && sender.tab) {
    // Open during the user gesture, before any network awaits.
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(async () => {
      await chrome.storage.local.set({ xrayJob: { status: "pending" } });
      const job = await createXray(message.symbol);
      await chrome.storage.local.set({ xrayJob: job }); respond(job);
    }).catch(async error => {
      await chrome.storage.local.set({ xrayJob: { error: error.message } });
      respond({ error: error.message });
    });
    return true;
  }
});
// TODO(A): add job history after the fixture-backed interaction is stable.
