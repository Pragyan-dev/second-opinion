// Detector bridge and stock research chip. Owner A.
(() => {
  if (globalThis.SecondOpinionV2) return;
  const detectors = Promise.all(["gmail", "x", "robinhood", "website"].map(name =>
    import(chrome.runtime.getURL(`detectors/${name}.js`))));
  async function capture() {
    for (const detector of await detectors) {
      const result = detector.detect();
      if (result) return result;
    }
    return null;
  }
  globalThis.SecondOpinionV2 = { capture };
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message.type !== "CAPTURE") return;
    capture().then(value => respond({ capture: value })).catch(error => respond({ error: error.message }));
    return true;
  });
  let lastUrl = "";
  async function refreshChip() {
    if (location.hostname !== "robinhood.com") return;
    const existing = document.getElementById("second-opinion-research-chip");
    if (lastUrl === location.href && existing) return;
    lastUrl = location.href;
    const detected = await capture();
    if (detected?.source_type !== "stock_page") { existing?.remove(); return; }
    const symbol = detected.tickers[0];
    const chip = existing || document.createElement("button");
    chip.id = "second-opinion-research-chip"; chip.type = "button";
    chip.textContent = `Research ${symbol}`;
    chip.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;padding:10px 16px;border:1px solid #d5dcd2;border-radius:20px;background:#215758;color:white;cursor:pointer;font:14px system-ui";
    chip.onclick = async () => {
      chip.disabled = true;
      try {
        const job = await chrome.runtime.sendMessage({ type: "RESEARCH", symbol, source_url: detected.url });
        if (job.error) throw new Error(job.error);
        chip.textContent = "Dashboard opened";
      } catch (error) { chip.textContent = `Retry research: ${error.message}`; }
      finally { chip.disabled = false; }
    };
    if (!existing) document.body.append(chip);
  }
  // Gmail: stop clicks on links inside an open message and offer a Second Opinion check instead.
  if (location.hostname === "mail.google.com") {
    Promise.all([
      import(chrome.runtime.getURL("lib/linkGuard.js")),
      import(chrome.runtime.getURL("detectors/gmail.js")),
    ]).then(([{ installLinkGuard }, gmail]) => installLinkGuard({
      doc: document,
      win: window,
      captureFor: anchor => gmail.captureMessage(anchor.closest(".adn.ads")) || gmail.detect(),
      send: message => chrome.runtime.sendMessage(message),
    })).catch(console.error);
  }
  refreshChip().catch(console.error);
  // Detect stock-to-stock SPA navigation and chip removal during a page render.
  if (location.hostname === "robinhood.com") setInterval(() => refreshChip().catch(console.error), 750);
  // TODO(A): keep detectors scoped to visible content when adapting new DOM layouts.
})();
