// "Verify Authenticity" button for an open email, in Gmail and in Mailpit. Owner A.
// The local shady check runs in the page (lib/shady.js) and adds a "!" to the button. The email
// leaves the page only when the person clicks: it is sent to the API and the report opens.

import { assess } from "./shady.js";

export const BUTTON_ID = "second-opinion-verify";
export const LABEL = "Verify Authenticity";
const MARK_STYLE = "display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;" +
  "margin-right:6px;border-radius:50%;background:#B0262F;color:#fff;font:700 12px/1 system-ui;vertical-align:-3px";

export const assessCapture = capture => assess({
  title: capture.email_title ?? capture.title,
  body: capture.email_body ?? capture.text,
  sender: capture.sender,
  links: capture.links,
});

function render(doc, button, result, label = LABEL) {
  button.replaceChildren();
  button.dataset.shady = String(!!result?.shady);
  if (result?.shady) {
    const mark = doc.createElement("span");
    mark.className = "second-opinion-caution";
    mark.textContent = "!";
    mark.style.cssText = MARK_STYLE;
    mark.setAttribute("aria-hidden", "true");
    button.append(mark, label);
    button.title = `Caution: this email shows signs of phishing (${result.reasons.join("; ")}). ` +
      "Click to verify it with Second Opinion.";
    button.setAttribute("aria-label", `${label}. Caution: this email shows signs of phishing.`);
  } else {
    button.textContent = label;
    button.title = "Check this email with Second Opinion";
    button.removeAttribute("aria-label");
  }
}

/**
 * @param {object} options
 * @param {Document} options.doc
 * @param {Window} options.win
 * @param {{ slot(): {parent: Element, before: Node|null}|null, key(): string|null,
 *   read(): Promise<object|null>|object|null, className?: string, style?: string }} options.site
 *   `key` names the open message (null when none is open); `read` captures it.
 * @param {(message: object) => Promise<any>} options.send
 */
export function installVerifyButton({ doc, win, site, send }) {
  const state = { key: null, result: null, token: 0, busy: false, timer: 0 };

  function make() {
    const button = doc.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    if (site.className) button.className = site.className;
    if (site.style) button.style.cssText = site.style;
    button.addEventListener("click", () => verify(button));
    render(doc, button, null);
    return button;
  }

  async function refresh() {
    state.timer = 0;
    const key = site.key();
    let button = doc.getElementById(BUTTON_ID);
    const slot = key && site.slot();
    if (!slot) { button?.remove(); state.key = null; return; }
    button ??= make();
    // Insert only when misplaced, so this never feeds the observer a loop.
    if (button.parentNode !== slot.parent) slot.parent.insertBefore(button, slot.before);
    if (state.key === key) return;
    state.key = key;
    state.result = null;
    if (!state.busy) render(doc, button, null);
    const token = ++state.token;
    try {
      const capture = await site.read();
      if (token !== state.token) return;
      state.result = capture ? assessCapture(capture) : null;
    } catch (error) {
      console.error("[Second Opinion]", error);
    }
    if (token === state.token && !state.busy) render(doc, button, state.result);
  }

  async function verify(button) {
    if (state.busy) return;
    state.busy = true;
    button.disabled = true;
    button.textContent = "Verifying…";
    try {
      const capture = await site.read();
      if (!capture) throw new Error("Open one email first");
      const job = await send({ type: "ANALYZE_AND_OPEN", capture });
      if (job?.error) throw new Error(job.error);
      render(doc, button, state.result);
    } catch (error) {
      render(doc, button, state.result, `Retry ${LABEL}`);
      button.title = error.message;
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  const schedule = () => { state.timer ||= win.setTimeout(refresh, 150); };
  new win.MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
  win.addEventListener("popstate", schedule);
  win.addEventListener("hashchange", schedule);
  return refresh();
}
