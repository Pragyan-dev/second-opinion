import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { parseHTML, DOMParser } = require("linkedom");
const { assess } = await import("../lib/shady.js");
const { emailBody } = await import("../lib/emailText.js");
const { installVerifyButton, BUTTON_ID, LABEL } = await import("../lib/verifyButton.js");
const mailpit = await import("../detectors/mailpit.js");
const gmail = await import("../detectors/gmail.js");

// The fake email sample from the demo, as Mailpit shows it.
const SAMPLE = `Dear Ryan,

I hope this email finds you well.

My name is Michael Myers, Senior Wealth Manager at Brightwater Capital.

Following up on our recent market analysis, I am reaching out to present an exclusive, time-sensitive investment opportunity normally reserved for our institutional clients.

We have secured a limited allocation for a high-growth Pre-IPO tech stock. Based on current market trends, our analysts project a guaranteed return of 18.5% within the first quarter, with minimal risk to your principal capital.

Investment Details:
• Minimum Entry: $5,000
• Projected Quarterly Return: 18.5%
• Closing Date: October 20, 2026 (Due to high demand, allocations are distributed on a first-come, first-served basis).

If you are interested in learning more, you can visit our portal below to explore the investor onboarding experience.

Investor Portal
https://brightwater-capitals.example/

Please review our website for details about disclosures. We look forward to growing your portfolio

Regards,
Michael Myers
Investment Relations
Brightwater Capitals`;

const MESSAGE = {
  // A whole document: linkedom's DOMParser, unlike Chrome's, does not wrap a bare fragment.
  ID: "abc", Subject: "fake email", Text: SAMPLE, HTML: `<html><body><pre>${SAMPLE}</pre></body></html>`,
  From: { Name: "Michael Myers", Address: "michael.myers@brightwater-capital.example" },
};

test("the fake email sample is shady from its text alone", () => {
  const result = assess({ title: "fake email", body: SAMPLE });
  assert.equal(result.shady, true);
  assert.ok(result.reasons.includes("Promises guaranteed or risk-free returns"));
  assert.ok(result.reasons.includes("Pressure to act fast"));
});

test("a look-alike link domain is a strong sign", () => {
  const result = assess({ body: SAMPLE, sender: "Michael Myers <michael.myers@brightwater-capital.example>" });
  assert.equal(result.reasons[0], "Link uses a look-alike of the sender's domain");
});

test("an ordinary email is not shady", () => {
  const body = "Hi Ryan,\n\nThe team lunch moved to Thursday at noon. Agenda: https://team.example/agenda\n\nThanks, Sam";
  assert.deepEqual(assess({ title: "Lunch moved", body, sender: "Sam <sam@team.example>" }),
    { shady: false, score: 0, reasons: [] });
});

test("email body text writes each link as text <url> and unwraps Gmail redirects", () => {
  const { document } = parseHTML(`<html><body><div id="b"><p>Hello</p><p>Open <a href="https://a.example/x">your portal</a>
    or <a href="https://www.google.com/url?q=https://b.example/&amp;sa=D">this</a>.<br>Bye
    <a href="https://c.example/">https://c.example/</a></p></div></body></html>`);
  const text = emailBody(document.getElementById("b"));
  assert.match(text, /your portal <https:\/\/a\.example\/x>/);
  assert.match(text, /this <https:\/\/b\.example\/>/);
  assert.equal(text.includes("https://c.example/ <"), false);
  assert.equal(document.getElementById("b").textContent.includes("<https"), false, "the page is not changed");
});

// captureFrom reads the page's own location and document, as it does in a content script.
function onMailpitView(document) {
  globalThis.DOMParser = DOMParser;
  globalThis.document = document;
  globalThis.location = new URL("http://localhost:8025/view/abc");
}

test("Mailpit message becomes an email capture with email_title and email_body", () => {
  const { document } = parseHTML("<html><body></body></html>");
  onMailpitView(document);
  const capture = mailpit.captureMessage(MESSAGE, new URL("http://localhost:8025/view/abc"), document);
  assert.equal(capture.source_type, "email");
  assert.equal(capture.url, "http://localhost:8025/view/abc");
  assert.equal(capture.email_title, "fake email");
  assert.equal(capture.title, "fake email");
  assert.ok(capture.email_body.includes("guaranteed return of 18.5%"));
  assert.equal(capture.text, capture.email_body);
  assert.equal(capture.sender, "Michael Myers <michael.myers@brightwater-capital.example>");
  assert.equal(mailpit.messageId(new URL("http://localhost:8025/view/abc")), "abc");
  assert.equal(mailpit.messageId(new URL("http://localhost:8025/")), null);
  assert.equal(mailpit.messageId(new URL("http://example.com/view/abc")), null);
});

test("Gmail capture carries email_title and email_body", () => {
  const { document } = parseHTML(`<html><body><h2 class="hP">Allocation</h2>
    <div class="adn ads"><span class="gD" name="Demo" email="offers@example.com"></span>
    <div class="a3s">Act now: <a href="https://example.com/one">reserve</a></div></div></body></html>`);
  globalThis.document = document;
  globalThis.location = new URL("https://mail.google.com/mail/u/0/#inbox/demo");
  document.querySelector(".a3s").getClientRects = () => [{}];
  const capture = gmail.detect();
  assert.equal(capture.email_title, "Allocation");
  assert.match(capture.email_body, /reserve <https:\/\/example\.com\/one>/);
});

function mailpitPage() {
  const { document } = parseHTML(`<html><body><div id="nav-tab" class="nav nav-tabs">
    <button class="nav-link">Preview</button><div class="d-none d-lg-block ms-auto me-3">sizes</div></div></body></html>`);
  const sent = [];
  let observer;
  const win = {
    setTimeout: (callback) => { callback(); return 1; },
    addEventListener() {},
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} },
  };
  return { document, win, sent, mutate: () => observer() };
}

test("Mailpit gets a Verify Authenticity tab with a caution mark, and sends nothing until clicked", async () => {
  const { document, win, sent } = mailpitPage();
  onMailpitView(document);
  let reads = 0;
  const site = {
    className: "nav-link",
    slot: () => ({ parent: document.getElementById("nav-tab"), before: document.querySelector(".ms-auto") }),
    key: () => "abc",
    read: async () => { reads++; return mailpit.captureMessage(MESSAGE, new URL("http://localhost:8025/view/abc"), document); },
  };
  await installVerifyButton({ doc: document, win, site, send: async message => { sent.push(message); return { report_id: "r1" }; } });
  const button = document.getElementById(BUTTON_ID);
  assert.ok(button, "button added");
  assert.equal(button.nextElementSibling.className.includes("ms-auto"), true, "before the size controls");
  assert.equal(button.dataset.shady, "true");
  assert.equal(button.querySelector(".second-opinion-caution").textContent, "!");
  assert.equal(button.textContent, `!${LABEL}`);
  assert.equal(sent.length, 0, "the local check sends nothing");

  button.dispatchEvent(new document.defaultView.Event("click"));
  for (let i = 0; i < 20 && !sent.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "ANALYZE_AND_OPEN");
  assert.equal(sent[0].capture.email_title, "fake email");
  assert.ok(sent[0].capture.email_body.includes("Investor Portal"));
  assert.equal(reads, 2, "the click reads the message again");
});

test("the button leaves when no message is open", async () => {
  const { document, win, mutate } = mailpitPage();
  let key = "abc";
  const site = {
    slot: () => ({ parent: document.getElementById("nav-tab"), before: null }),
    key: () => key,
    read: async () => ({ title: "Lunch", text: "See you at noon.", links: [] }),
  };
  await installVerifyButton({ doc: document, win, site, send: async () => ({}) });
  assert.equal(document.getElementById(BUTTON_ID).dataset.shady, "false");
  key = null;
  await mutate();
  assert.equal(document.getElementById(BUTTON_ID), null);
});
