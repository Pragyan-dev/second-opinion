// "Verify Authenticity" button for an open email, in Gmail and in Mailpit. Owner A.
// The local shady check runs in the page (lib/shady.js) and adds a "!" to the button. The email
// leaves the page only when the person clicks: it is sent to the API and the report opens.

import { assess } from "./shady.js";

export const BUTTON_ID = "second-opinion-verify";
export const LABEL = "Verify Authenticity";
// The button is a centred flex row, so the label and the mark line up whatever the site's fonts.
// Its baseline is the label's, which sits it on the line of the text beside it.
// Important, because Gmail's own button rules otherwise win and the mark drops to a new line.
const LAYOUT = {
  display: "inline-flex", "flex-wrap": "nowrap", "align-items": "center", "align-self": "center",
  gap: "6px", "vertical-align": "baseline", "white-space": "nowrap", width: "auto", "max-width": "none",
};
// The "!" is drawn, not typed: a glyph in a circle drifts off centre with the font's metrics.
const SVG = "http://www.w3.org/2000/svg";
const MARK_SHAPES = [
  ["circle", { cx: 8, cy: 8, r: 8, fill: "#B0262F" }],
  ["rect", { x: 7, y: 3.5, width: 2, height: 6, rx: 1, fill: "#fff" }],
  ["circle", { cx: 8, cy: 12, r: 1.1, fill: "#fff" }],
];

function cautionMark(doc) {
  const mark = doc.createElementNS(SVG, "svg");
  mark.setAttribute("class", "second-opinion-caution");
  mark.setAttribute("viewBox", "0 0 16 16");
  mark.setAttribute("aria-hidden", "true");
  // Inline, not block: if the site ever beats the flex layout, the mark still stays on the line.
  mark.style.cssText = "display:inline-block;flex:none;width:1.15em;height:1.15em;vertical-align:middle;margin:0";
  for (const [name, attributes] of MARK_SHAPES) {
    const shape = doc.createElementNS(SVG, name);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, String(value));
    mark.append(shape);
  }
  return mark;
}

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
    const text = doc.createElement("span");
    text.textContent = label;
    text.style.cssText = "flex:none;white-space:nowrap";
    button.append(text, cautionMark(doc));
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
    for (const [property, value] of Object.entries(LAYOUT)) button.style.setProperty(property, value, "important");
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
