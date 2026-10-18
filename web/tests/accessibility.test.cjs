const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test, beforeEach, afterEach } = require("node:test");
const ts = require("typescript");
const { parseHTML } = require("linkedom");

for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    module._compile(outputText, filename);
  };
}
require.extensions[".css"] = module => { module.exports = new Proxy({}, { get: (_, name) => name === "__esModule" ? false : String(name) }); };
let currentPath = "/";
const originalLoad = Module._load;
Module._load = function(request, parent, ...rest) {
  if (request === "next/navigation") return { usePathname: () => currentPath };
  return originalLoad.call(this, request.startsWith("@/") ? path.join(__dirname, "..", request.slice(2)) : request, parent, ...rest);
};

const { window } = parseHTML("<html lang='en'><body><div id='dashboard-content'><main id='main'><h1>Live report</h1><p>Verified contact details.</p><p hidden>Hidden secret text</p><a href='#section' title='Read the official record' aria-describedby='existing'>Official record</a><h2 id='section'>Contact details</h2></main></div><div id='root'></div></body></html>");
Object.assign(global, {
  window, document: window.document, HTMLElement: window.HTMLElement, Element: window.Element,
  HTMLAnchorElement: window.HTMLAnchorElement, Node: window.Node, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, MutationObserver: window.MutationObserver,
  getComputedStyle: element => ({ display: element.style.display || "block", visibility: element.style.visibility || "visible" }),
  requestAnimationFrame: callback => setTimeout(callback, 0), IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(global, "navigator", { configurable: true, value: { userAgent: "node" } });
const saved = new Map();
global.localStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
global.CSS = { escape: value => value };
window.getSelection = () => null;
window.innerWidth = 1280; window.innerHeight = 900;
window.HTMLElement.prototype.scrollIntoView = function() { this.didScroll = true; };
window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 10, right: 200, top: 10, bottom: 60 });
window.HTMLElement.prototype.getClientRects = () => [{}];
let focused = document.body;
Object.defineProperty(document, "activeElement", { get: () => focused });
window.HTMLElement.prototype.focus = function() { focused = this; };
// Native dialog focus trapping belongs to the browser. Here we test the component's
// open/close lifecycle, commands, DOM preferences and speech callbacks with adapters.
window.HTMLElement.prototype.showModal = function() { this.setAttribute("open", ""); };
window.HTMLElement.prototype.close = function() { this.removeAttribute("open"); };
Object.defineProperty(window.HTMLElement.prototype, "open", { get() { return this.hasAttribute("open"); } });
let spoken, cancelled, paused, resumed, recognition;
class FakeUtterance { constructor(text) { this.text = text; } }
class FakeRecognition {
  constructor() { recognition = this; }
  start() { this.started = true; }
  abort() { this.aborted = true; this.onend?.(); }
}
window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance = FakeUtterance;
window.speechSynthesis = { speak: item => spoken.push(item), cancel: () => cancelled++, pause: () => paused++, resume: () => resumed++ };
window.webkitSpeechRecognition = FakeRecognition;

const React = require("react");
const { act } = React;
const { createRoot } = require("react-dom/client");
const { AccessibilityMenu } = require("../components/accessibility/AccessibilityMenu.tsx");
const { DEFAULT_PREFERENCES, ACCESSIBILITY_STORAGE_KEY, LEVELS, parsePreferences, nextPreference, parseVoiceCommand, speechChunks } = require("../lib/accessibility.ts");
let root;
const flush = () => new Promise(resolve => setTimeout(resolve, 5));
const findButton = label => [...document.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === label || button.querySelector(".label")?.textContent === label || button.textContent === label);
async function click(label) {
  const button = findButton(label);
  assert.ok(button, `Button exists: ${label}`);
  await act(async () => { button.click(); await flush(); });
}
async function render() { await act(async () => { root.render(React.createElement(AccessibilityMenu)); await flush(); }); }
beforeEach(async () => {
  saved.clear(); spoken = []; cancelled = paused = resumed = 0; recognition = null; currentPath = "/";
  window.webkitSpeechRecognition = FakeRecognition;
  window.getSelection = () => null;
  root = createRoot(document.getElementById("root"));
  await render();
});
afterEach(async () => { await act(async () => { root.unmount(); await flush(); }); });

test("damaged and unknown stored settings cannot enable arbitrary behavior", () => {
  assert.deepEqual(parsePreferences("bad JSON"), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"textSize":999,"cursor":-1,"hideImages":"true","voice":true}'), DEFAULT_PREFERENCES);
  const saved = parsePreferences('{"textSize":2,"contrast":1,"smartContrast":true,"tooltips":true}');
  assert.equal(saved.textSize, 2); assert.equal(saved.tooltips, true); assert.equal(saved.smartContrast, false);
});

test("every stepped adjustment cycles through its values and back to default", () => {
  for (const [key, values] of Object.entries(LEVELS)) {
    let prefs = { ...DEFAULT_PREFERENCES };
    for (let i = 1; i <= values.length; i++) { prefs = nextPreference(prefs, key); assert.equal(prefs[key], i % values.length); }
  }
  assert.equal(nextPreference({ ...DEFAULT_PREFERENCES, contrast: 2 }, "smartContrast").contrast, 0);
  assert.equal(nextPreference({ ...DEFAULT_PREFERENCES, smartContrast: true }, "contrast").smartContrast, false);
});

test("voice commands are explicit; unknown and partial commands do not activate links", () => {
  assert.equal(parseVoiceCommand("Next heading."), "nextHeading");
  assert.equal(parseVoiceCommand("Open link!"), "activateLink");
  assert.equal(parseVoiceCommand("do not open link"), null);
  assert.equal(parseVoiceCommand("buy the stock"), null);
});

test("speech chunks retain all page text in order", () => {
  const text = "A long report with a source and contact details. ".repeat(60).trim();
  const chunks = speechChunks(text);
  assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 220));
  assert.equal(chunks.join(" "), text); assert.deepEqual(speechChunks("   "), []);
});

test("launcher, shortcut and close button operate the labelled dialog", async () => {
  await click("Open accessibility menu");
  assert.equal(document.querySelector("dialog").open, true);
  assert.equal(findButton("Open accessibility menu").getAttribute("aria-expanded"), "true");
  await click("Close accessibility menu");
  assert.equal(document.querySelector("dialog").open, false);
  const key = new window.Event("keydown", { cancelable: true });
  Object.assign(key, { key: "u", ctrlKey: true });
  await act(async () => { window.dispatchEvent(key); await flush(); });
  assert.equal(document.querySelector("dialog").open, true);
  assert.equal(key.defaultPrevented, true);
});

test("all visual tiles update actual page settings and reset restores defaults", async () => {
  for (const label of ["Contrast +", "Smart Contrast", "Highlight Links", "Bigger Text", "Text Spacing", "Pause Animations", "Hide Images", "Dyslexia Friendly", "Cursor", "Tooltips", "Line Height", "Text Align"]) await click(label);
  const prefs = JSON.parse(saved.get(ACCESSIBILITY_STORAGE_KEY));
  assert.equal(prefs.smartContrast, true); assert.equal(prefs.contrast, 0);
  for (const key of ["highlightLinks", "pauseAnimations", "hideImages", "dyslexia", "tooltips"]) assert.equal(prefs[key], true);
  for (const key of ["textSize", "textSpacing", "cursor", "lineHeight", "textAlign"]) assert.equal(prefs[key], 1);
  assert.equal(document.documentElement.style.getPropertyValue("--a11y-text-scale"), "1.25");
  assert.equal(document.documentElement.getAttribute("data-a11y-highlightlinks"), "true");
  await click("Reset all settings");
  assert.deepEqual(JSON.parse(saved.get(ACCESSIBILITY_STORAGE_KEY)), DEFAULT_PREFERENCES);
  assert.equal(document.documentElement.style.getPropertyValue("--a11y-text-scale"), "1");
});

test("saved adjustments restore on remount without starting speech or the microphone", async () => {
  await click("Bigger Text"); await click("Hide Images");
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root")); await render();
  assert.equal(document.documentElement.getAttribute("data-a11y-textsize"), "1");
  assert.equal(document.documentElement.getAttribute("data-a11y-hideimages"), "true");
  assert.equal(recognition, null); assert.equal(spoken.length, 0);
});

test("oversized controls resize the panel and remain resettable", async () => {
  const toggle = document.querySelector('[role="switch"]');
  await act(async () => { toggle.click(); await flush(); });
  assert.equal(toggle.getAttribute("aria-checked"), "true");
  assert.ok(document.querySelector("dialog").classList.contains("oversized"));
  await click("Reset all settings");
  assert.equal(toggle.getAttribute("aria-checked"), "false");
});

test("blocked storage does not prevent adjustments", async () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("Storage denied"); };
  try {
    await click("Highlight Links");
    assert.equal(document.documentElement.getAttribute("data-a11y-highlightlinks"), "true");
    assert.match(document.querySelector("dialog").textContent, /cannot save/);
  } finally { localStorage.setItem = original; }
});

test("unsupported speech recognition explains the limitation without a start control", async () => {
  await act(async () => root.unmount());
  delete window.webkitSpeechRecognition;
  root = createRoot(document.getElementById("root")); await render();
  await click("Voice Navigation");
  assert.match(document.getElementById("accessibility-voice").textContent, /unavailable in this browser/);
  assert.equal(findButton("Start listening"), undefined);
});

test("page structure discovers headings and moves focus to the selected section", async () => {
  await click("Open accessibility menu"); await click("Page Structure");
  assert.match(document.getElementById("accessibility-outline").textContent, /Live report/);
  const target = [...document.querySelectorAll("#accessibility-outline button")].find(button => button.textContent.includes("Contact details"));
  await act(async () => { target.click(); await flush(); });
  assert.equal(document.activeElement.id, "section");
  assert.equal(document.querySelector("dialog").open, false);
});

test("read aloud reads visible content and offers pause, resume and stop", async () => {
  await click("Screen Reader");
  assert.ok(spoken.length); assert.match(spoken[0].text, /Live report/);
  assert.doesNotMatch(spoken.map(item => item.text).join(" "), /Hidden secret|Accessibility Menu/);
  await click("Pause reading"); assert.equal(paused, 1);
  await click("Resume reading"); assert.equal(resumed, 1);
  const old = spoken[0];
  await click("Stop reading"); assert.ok(cancelled > 0);
  await act(async () => old.onend());
  assert.equal(spoken.length, 1, "cancelled speech cannot queue another chunk");
});

test("voice requires an explicit start and handles permission denial without staying on", async () => {
  await click("Voice Navigation"); assert.equal(recognition, null);
  await click("Start listening"); assert.equal(recognition.started, true);
  await act(async () => recognition.onstart());
  assert.match(document.body.textContent, /Microphone on/);
  await act(async () => recognition.onerror({ error: "not-allowed" }));
  assert.equal(recognition.aborted, true);
  assert.match(document.querySelector("dialog").textContent, /Microphone access was denied/);
  assert.equal(document.querySelector(".playback"), null);
});

test("voice navigation focuses headings, and stops on a route change", async () => {
  await click("Voice Navigation"); await click("Start listening");
  await act(async () => recognition.onstart());
  focused = document.body;
  await act(async () => { recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "next heading" } }] }); await flush(); });
  assert.equal(document.activeElement.tagName, "H1");
  currentPath = "/fraud/live"; await render();
  assert.equal(recognition.aborted, true);
});

test("tooltips preserve existing descriptions and are dismissible", async () => {
  await click("Tooltips");
  const link = document.querySelector("#main a");
  await act(async () => { link.dispatchEvent(new window.Event("mouseover", { bubbles: true })); await flush(); });
  assert.match(document.getElementById("accessibility-tooltip").textContent, /Read the official record/);
  assert.equal(link.getAttribute("aria-describedby"), "existing accessibility-tooltip");
  const key = new window.Event("keydown", { bubbles: true }); key.key = "Escape";
  await act(async () => { document.dispatchEvent(key); await flush(); });
  assert.equal(document.getElementById("accessibility-tooltip"), null);
  assert.equal(link.getAttribute("aria-describedby"), "existing");
});
