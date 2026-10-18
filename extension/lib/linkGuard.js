// Gmail link guard. Owner A.
// A click on a link inside an open message is stopped before Gmail handles it. The person sees the
// real destination as text and can ask Second Opinion to open it instead: the agent visits the site
// on its own computer and the report shows a watch-only view of it.

const HOST_ID = "second-opinion-link-guard";

/** The anchor a click targets, when it is an http(s) link inside an open Gmail message body. */
export function guardedLink(target) {
  const anchor = target?.closest?.("a[href]");
  if (!anchor || !anchor.closest(".a3s")) return null;
  let url;
  try { url = new URL(anchor.href); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.hostname === "mail.google.com") return null;
  return anchor;
}

/** Gmail sometimes points links at google.com/url?q=<real>. Show the real destination. */
export function destination(anchor) {
  try {
    const url = new URL(anchor.href);
    if (/(^|\.)google\.com$/.test(url.hostname) && url.pathname === "/url" && url.searchParams.get("q")) {
      return url.searchParams.get("q");
    }
    return url.href;
  } catch { return anchor.getAttribute("href") || ""; }
}

const STYLE = `
  :host { all: initial; }
  .scrim { position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 16px;
    background: rgba(12, 33, 30, .45); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #14302C; }
  .card { width: min(480px, 100%); background: #F4F7F3; border: 1px solid #14302C; border-radius: 8px; padding: 22px 22px 18px;
    box-shadow: 0 0 0 4px #F4F7F3, 0 0 0 5px rgba(20, 48, 44, .3), 0 30px 60px -30px rgba(12, 33, 30, .7); }
  .eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #B0262F; }
  h2 { margin: 0 0 10px; font: 600 22px/1.2 Georgia, "Times New Roman", serif; }
  p { margin: 0 0 12px; }
  .url { display: block; margin: 0 0 16px; padding: 8px 10px; border: 1px solid #8FB0A6; border-radius: 2px; background: #E8EEE9;
    font: 13px/1.4 ui-monospace, Menlo, monospace; word-break: break-all; user-select: all; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  button { font: inherit; min-height: 44px; border-radius: 2px; cursor: pointer; }
  .check { padding: 8px 18px; border: 1px solid #0C211E; background: #14302C; color: #F4F7F3; font-weight: 600;
    box-shadow: inset 0 0 0 3px #14302C, inset 0 0 0 4px rgba(143, 176, 166, .55); }
  .check:disabled { cursor: progress; opacity: .8; }
  .cancel { padding: 8px 14px; border: 1px solid #14302C; background: transparent; color: #14302C; }
  .anyway { margin-left: auto; padding: 8px 4px; border: 0; background: none; color: #4D6661; font-size: 13px; text-decoration: underline; }
  .status { margin: 12px 0 0; min-height: 1.5em; font-size: 13px; color: #4D6661; }
  .error { color: #B0262F; font-weight: 600; }
  :focus-visible { outline: 2px solid #4B36C7; outline-offset: 2px; }
`;

function build(doc, url) {
  const host = doc.createElement("div");
  host.id = HOST_ID;
  const root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
  root.innerHTML = `<style>${STYLE}</style>
    <div class="scrim" data-part="scrim">
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="so-title" aria-describedby="so-desc">
        <p class="eyebrow">Second Opinion stopped this link</p>
        <h2 id="so-title">Let the agent open it for you</h2>
        <p id="so-desc">Links in messages like this can lead to clone sites. Second Opinion can open it on its own
          computer and show you what is there, while it checks who really sent the message.</p>
        <code class="url" data-part="url"></code>
        <div class="row">
          <button type="button" class="check" data-part="check">Check it with Second Opinion</button>
          <button type="button" class="cancel" data-part="cancel">Cancel</button>
          <button type="button" class="anyway" data-part="anyway">Open anyway</button>
        </div>
        <p class="status" role="status" data-part="status"></p>
      </div>
    </div>`;
  root.querySelector('[data-part="url"]').textContent = url;
  const part = name => root.querySelector(`[data-part="${name}"]`);
  return { host, part };
}

/**
 * Install the guard. Dependencies are injected so it can be tested without a browser.
 * @param {{ doc: Document, win: Window, captureFor: (anchor: Element) => object | null,
 *   send: (message: object) => Promise<any> }} deps
 */
export function installLinkGuard({ doc, win, captureFor, send }) {
  let open = null;

  function close() {
    open?.host.remove();
    open?.previousFocus?.focus?.();
    open = null;
  }

  function show(anchor) {
    close();
    const url = destination(anchor);
    const { host, part } = build(doc, url);
    open = { host, previousFocus: doc.activeElement };
    doc.body.append(host);
    const status = part("status");

    part("cancel").addEventListener("click", close);
    part("scrim").addEventListener("click", event => { if (event.target === part("scrim")) close(); });
    part("anyway").addEventListener("click", () => {
      if (part("anyway").dataset.armed !== "true") {
        part("anyway").dataset.armed = "true";
        part("anyway").textContent = "Yes, open it in a new tab";
        status.textContent = "Only do this if you trust the sender. The check above is safer.";
        return;
      }
      win.open(url, "_blank", "noopener,noreferrer");
      close();
    });
    part("check").addEventListener("click", async () => {
      const button = part("check");
      button.disabled = true;
      status.className = "status";
      status.textContent = "Starting the check…";
      try {
        const capture = captureFor(anchor);
        if (!capture) throw new Error("Open the message on its own, then try again.");
        // Put the clicked link first, so the agent visits it.
        capture.links = [url, ...(capture.links || []).filter(link => link !== url && link !== anchor.href)];
        const job = await send({ type: "ANALYZE_AND_OPEN", capture });
        if (job?.error) throw new Error(job.error);
        status.textContent = "The report opened in a new tab. The agent is visiting the site now.";
        button.textContent = "Check started";
      } catch (error) {
        status.className = "status error";
        status.textContent = error.message || String(error);
        button.disabled = false;
      }
    });
    part("check").focus?.();
  }

  function onClick(event) {
    if (open && event.composedPath?.().includes(open.host)) return;
    const anchor = guardedLink(event.target);
    if (!anchor) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    show(anchor);
  }

  function onKey(event) {
    if (event.key === "Escape" && open) close();
  }

  // Capture phase on the window runs before Gmail's own link handlers.
  win.addEventListener("click", onClick, true);
  win.addEventListener("auxclick", onClick, true);
  win.addEventListener("keydown", onKey, true);
  return {
    uninstall() {
      win.removeEventListener("click", onClick, true);
      win.removeEventListener("auxclick", onClick, true);
      win.removeEventListener("keydown", onKey, true);
      close();
    },
    isOpen: () => !!open,
  };
}
