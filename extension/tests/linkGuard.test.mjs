import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
const { installLinkGuard, guardedLink, destination } = await import("../lib/linkGuard.js");
const gmail = await import("../detectors/gmail.js");

function gmailPage() {
  const { window, document } = parseHTML(`<html><head><title>Inbox</title></head><body>
    <h2 class="hP">Your Brightwater allocation window</h2>
    <a id="nav" href="https://mail.google.com/mail/u/0/#inbox">Inbox</a>
    <div class="adn ads"><span class="gD" name="Brightwater Capital Advisors" email="offers@brightwater-capital.example"></span>
      <div class="a3s">Guaranteed monthly returns.
        <a id="site" href="https://brightwater-capital.example/"><b id="inner">Request your allocation</b></a>
        <a id="wrapped" href="https://www.google.com/url?q=https://example.com/whatsapp-demo&amp;sa=D">WhatsApp</a>
        <a id="mail" href="mailto:offers@brightwater-capital.example">Email us</a>
      </div></div>
  </body></html>`);
  globalThis.document = document;
  globalThis.location = new URL("https://mail.google.com/mail/u/0/#inbox/demo");
  const opened = [];
  const sent = [];
  const win = {
    addEventListener: (...args) => document.addEventListener(...args),
    removeEventListener: (...args) => document.removeEventListener(...args),
    open: (...args) => opened.push(args),
  };
  const guard = installLinkGuard({
    doc: document,
    win,
    captureFor: anchor => gmail.captureMessage(anchor.closest(".adn.ads")),
    send: async message => { sent.push(message); return { report_id: "r1", status: "pending" }; },
  });
  const click = target => {
    const event = new window.Event("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const part = name => {
    const host = document.getElementById("second-opinion-link-guard");
    return (host.shadowRoot || host).querySelector(`[data-part="${name}"]`);
  };
  return { window, document, guard, click, part, opened, sent };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("only http(s) links inside the open message body are guarded", () => {
  const { document } = gmailPage();
  assert.equal(guardedLink(document.getElementById("inner"))?.id, "site");
  assert.equal(guardedLink(document.getElementById("mail")), null);
  assert.equal(guardedLink(document.getElementById("nav")), null);
  assert.equal(destination(document.getElementById("wrapped")), "https://example.com/whatsapp-demo");
});

test("a click on a message link is stopped and shows the real destination", () => {
  const { document, click, part, guard } = gmailPage();
  const event = click(document.getElementById("inner"));
  assert.equal(event.defaultPrevented, true);
  assert.equal(guard.isOpen(), true);
  assert.equal(part("url").textContent, "https://brightwater-capital.example/");
  assert.equal(click(document.getElementById("nav")).defaultPrevented, false);
  assert.equal(click(document.getElementById("mail")).defaultPrevented, false);
});

test("checking sends the email capture with the clicked link first, without opening it", async () => {
  const { document, click, part, sent, opened } = gmailPage();
  click(document.getElementById("wrapped"));
  part("check").dispatchEvent(new globalThis.document.defaultView.Event("click"));
  await tick(); await tick();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "ANALYZE_AND_OPEN");
  const capture = sent[0].capture;
  assert.equal(capture.source_type, "email");
  assert.equal(capture.sender, "Brightwater Capital Advisors <offers@brightwater-capital.example>");
  assert.equal(capture.links[0], "https://example.com/whatsapp-demo");
  assert.ok(capture.links.includes("https://brightwater-capital.example/"));
  assert.equal(capture.links.filter(l => l.includes("google.com/url")).length, 0);
  assert.match(part("status").textContent, /report opened/);
  assert.deepEqual(opened, []);
});

test("open anyway needs a second confirmation and opens without referrer", () => {
  const { document, click, part, opened, guard } = gmailPage();
  click(document.getElementById("site"));
  const Event = globalThis.document.defaultView.Event;
  part("anyway").dispatchEvent(new Event("click"));
  assert.deepEqual(opened, []);
  assert.equal(guard.isOpen(), true);
  part("anyway").dispatchEvent(new Event("click"));
  assert.deepEqual(opened, [["https://brightwater-capital.example/", "_blank", "noopener,noreferrer"]]);
  assert.equal(guard.isOpen(), false);
});

test("cancel, Escape and uninstall close the card and release clicks", () => {
  const { window, document, click, part, guard } = gmailPage();
  click(document.getElementById("site"));
  part("cancel").dispatchEvent(new window.Event("click"));
  assert.equal(guard.isOpen(), false);
  click(document.getElementById("site"));
  const key = new window.Event("keydown");
  key.key = "Escape";
  document.dispatchEvent(key);
  assert.equal(guard.isOpen(), false);
  guard.uninstall();
  assert.equal(click(document.getElementById("site")).defaultPrevented, false);
});

test("a capture failure is shown in the card instead of throwing", async () => {
  const { window, document } = parseHTML(`<html><body><div class="adn ads"><div class="a3s">
    <a id="x" href="https://scam.example/">x</a></div></div></body></html>`);
  const guard = installLinkGuard({
    doc: document,
    win: { addEventListener: (...a) => document.addEventListener(...a), removeEventListener() {}, open() {} },
    captureFor: () => null,
    send: async () => { throw new Error("should not be called"); },
  });
  document.getElementById("x").dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
  const host = document.getElementById("second-opinion-link-guard");
  const root = host.shadowRoot || host;
  root.querySelector('[data-part="check"]').dispatchEvent(new window.Event("click"));
  await tick();
  assert.match(root.querySelector('[data-part="status"]').textContent, /Open the message on its own/);
  assert.equal(root.querySelector('[data-part="check"]').disabled, false);
  assert.equal(guard.isOpen(), true);
});
