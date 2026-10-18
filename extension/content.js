// Detector bridge and stock research chip. Owner A.
(() => {
  if (globalThis.SecondOpinionV2) return;
  const detectors = Promise.all(["gmail", "mailpit", "x", "stock", "website"].map(name =>
    import(chrome.runtime.getURL(`detectors/${name}.js`))));
  async function capture() {
    for (const detector of await detectors) {
      // The Mailpit detector reads its message from Mailpit's API, so detectors may be async.
      const result = await detector.detect();
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
  // Research chip on stock quote pages. The page is read again only when its address changes.
  const stockDetector = import(chrome.runtime.getURL("detectors/stock.js"));
  let lastUrl = "";
  let lastCapture = null;
  async function refreshChip() {
    const stock = await stockDetector;
    if (!stock.onStockSite(location)) return;
    let chip = document.getElementById("second-opinion-research-chip");
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      lastCapture = stock.detect();
    }
    if (!lastCapture) { chip?.remove(); return; }
    const detected = lastCapture;
    const symbol = detected.tickers[0];
    if (!chip) {
      chip = document.createElement("button");
      chip.id = "second-opinion-research-chip"; chip.type = "button";
      chip.style.cssText = "position:fixed;bottom:20px;right:20px;z-index:2147483647;padding:10px 16px;border:1px solid #d5dcd2;border-radius:20px;background:#215758;color:white;cursor:pointer;font:14px system-ui";
      document.body.append(chip);
    }
    if (chip.dataset.symbol !== symbol) {
      chip.dataset.symbol = symbol;
      chip.textContent = `Research ${symbol}`;
    }
    chip.onclick = async () => {
      chip.disabled = true;
      try {
        const job = await chrome.runtime.sendMessage({ type: "RESEARCH", symbol, source_url: detected.url });
        if (job.error) throw new Error(job.error);
        chip.textContent = "Dashboard opened";
      } catch (error) { chip.textContent = `Retry research: ${error.message}`; }
      finally { chip.disabled = false; }
    };
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
  // Gmail and Mailpit: a Verify Authenticity button on the open email. A "!" on it comes from
  // the local pattern check; the email is sent only when the button is clicked.
  const verifySites = {
    "mail.google.com": async () => {
      const gmail = await import(chrome.runtime.getURL("detectors/gmail.js"));
      return {
        style: "margin:0 0 0 12px;padding:3px 12px 3px 14px;border:1px solid #215758;border-radius:16px;" +
          "background:#215758;color:#fff;font:500 13px/20px system-ui;cursor:pointer;white-space:nowrap",
        slot: () => {
          const subject = document.querySelector("h2.hP");
          return subject?.parentElement ? { parent: subject.parentElement, before: subject.nextSibling } : null;
        },
        key: () => {
          const message = gmail.openMessage();
          if (!message) return null;
          const subject = document.querySelector("h2.hP")?.textContent ?? "";
          return `${location.hash}|${subject}|${message.querySelector(".a3s")?.textContent.length}`;
        },
        read: () => gmail.detect(),
      };
    },
    mailpit: async () => {
      const mailpit = await import(chrome.runtime.getURL("detectors/mailpit.js"));
      return {
        className: "nav-link",
        slot: () => {
          const nav = document.getElementById("nav-tab");
          // Before the right-aligned screen-size controls, after Mailpit's own tabs.
          return nav ? { parent: nav, before: nav.querySelector(":scope > .ms-auto") } : null;
        },
        key: () => mailpit.messageId(),
        read: () => mailpit.detect(),
      };
    },
  };
  const verifySite = verifySites[location.hostname]
    ?? (["localhost:8025", "127.0.0.1:8025"].includes(location.host) ? verifySites.mailpit : null);
  if (verifySite) {
    Promise.all([import(chrome.runtime.getURL("lib/verifyButton.js")), verifySite()])
      .then(([{ installVerifyButton }, site]) => installVerifyButton({
        doc: document, win: window, site, send: message => chrome.runtime.sendMessage(message),
      })).catch(console.error);
  }
  // Finance sites change pages without reloading, and may remove the chip while rendering.
  stockDetector.then(stock => {
    if (!stock.onStockSite(location)) return;
    refreshChip().catch(console.error);
    setInterval(() => refreshChip().catch(console.error), 750);
  }).catch(console.error);
  // TODO(A): keep detectors scoped to visible content when adapting new DOM layouts.
})();
