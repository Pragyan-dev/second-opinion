import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import vm from "node:vm";

const require = createRequire(new URL("../../web/package.json", import.meta.url));
const { parseHTML } = require("linkedom");
const root = new URL("../", import.meta.url);
const website = await import("../detectors/website.js");
const gmail = await import("../detectors/gmail.js");
const x = await import("../detectors/x.js");
const robinhood = await import("../detectors/robinhood.js");

function page(url, body, title = "Demo") {
  const { document } = parseHTML(`<html><head><title>${title}</title></head><body>${body}</body></html>`);
  globalThis.document = document;
  globalThis.location = new URL(url);
  for (const node of document.querySelectorAll(".a3s")) {
    node.getClientRects = () => node.hasAttribute("data-hidden") ? [] : [{}];
  }
  return document;
}

test("generic capture caps visible text and extracts contact links and symbols", () => {
  page("http://localhost:5500/", `<p>$BRWT ${"a".repeat(21000)}</p><a href="mailto:demo@example.com">Email</a><a href="tel:+12025550199">Phone</a>`);
  const capture = website.detect();
  assert.equal(capture.source_type, "website");
  assert.equal(capture.text.length, 20000);
  assert.deepEqual(capture.tickers, ["BRWT"]);
  assert.deepEqual(capture.emails, ["demo@example.com"]);
  assert.deepEqual(capture.phones, ["+12025550199"]);
});

test("Gmail inbox refuses capture and cannot use generic fallback", () => {
  page("https://mail.google.com/mail/u/0/#inbox", "<table><tr><td>Private inbox row</td></tr></table>");
  assert.equal(gmail.detect(), null);
  assert.equal(website.detect(), null);
});

test("Gmail captures only the single visible message body, sender, and subject", () => {
  page("https://mail.google.com/mail/u/0/#inbox/demo", `<h2 class="hP">Allocation</h2><aside>Unrelated inbox data</aside>
    <div class="adn ads"><span class="gD" name="Demo Sender" email="offers@example.com"></span>
    <div class="a3s">Message body <a href="https://example.com/one">Link</a></div></div>
    <div class="adn ads"><div class="a3s" data-hidden>Collapsed private message</div></div>`);
  const capture = gmail.detect();
  assert.equal(capture.source_type, "email");
  assert.equal(capture.title, "Allocation");
  assert.equal(capture.sender, "Demo Sender <offers@example.com>");
  assert.equal(capture.text.includes("Unrelated"), false);
  assert.equal(capture.text.includes("Collapsed"), false);
  assert.deepEqual(capture.links, ["https://example.com/one"]);
});

test("Gmail refuses a thread with multiple visible message bodies", () => {
  page("https://mail.google.com/mail/u/0/#inbox/thread", `<h2 class="hP">Thread</h2>
    <div class="adn ads"><span class="gD" email="one@example.com"></span><div class="a3s">One</div></div>
    <div class="adn ads"><span class="gD" email="two@example.com"></span><div class="a3s">Two</div></div>`);
  assert.equal(gmail.detect(), null);
});

test("X feed refuses capture; selected status excludes other posts", () => {
  page("https://x.com/home", "<article>Private feed</article>");
  assert.equal(x.detect(), null);
  assert.equal(website.detect(), null);
  page("https://x.com/TRowePrice/status/123", `<article data-testid="tweet">
    <a href="https://x.com/other/status/456">Other post</a><div data-testid="tweetText">Do not capture</div></article>
    <article data-testid="tweet"><a href="https://x.com/TRowePrice/status/123">Selected post</a>
    <div data-testid="User-Name">Demo Name @TRowePrice</div>
    <div data-testid="tweetText">Selected text <a href="https://example.com/resource">Resource</a></div></article>`);
  const capture = x.detect();
  assert.equal(capture.source_type, "social_post");
  assert.equal(capture.sender, "@TRowePrice");
  assert.equal(capture.text.includes("Do not capture"), false);
  assert.deepEqual(capture.links, ["https://example.com/resource"]);
});

test("stock detector prioritizes the current URL and supports a title fallback", () => {
  page("https://robinhood.com/stocks/BRWT", "<main>Fictional stock</main>", "BRWT Stock Price");
  assert.deepEqual(robinhood.detect().tickers, ["BRWT"]);
  globalThis.location = new URL("https://robinhood.com/stocks/DEMO");
  assert.deepEqual(robinhood.detect().tickers, ["DEMO"]);
  globalThis.location = new URL("https://robinhood.com/stocks/");
  assert.deepEqual(robinhood.detect().tickers, ["BRWT"]);
});

test("stock chip refreshes on SPA navigation and sends research for the new symbol", async () => {
  const document = page("https://robinhood.com/stocks/BRWT", "<main>Fictional stock</main>");
  let interval;
  const messages = [];
  const context = vm.createContext({
    document, location: globalThis.location, console,
    setInterval: callback => { interval = callback; },
    chrome: { runtime: {
      getURL: path => new URL(path, root).href,
      onMessage: { addListener() {} },
      sendMessage: async message => { messages.push(message); return { research_id: "demo" }; },
    } },
  });
  vm.runInContext(readFileSync(new URL("content.js", root), "utf8"), context, {
    importModuleDynamically: specifier => import(specifier),
  });
  for (let i = 0; i < 50 && !document.getElementById("second-opinion-research-chip"); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(document.getElementById("second-opinion-research-chip")?.textContent, "Research BRWT");
  globalThis.location = new URL("https://robinhood.com/stocks/DEMO");
  context.location = globalThis.location;
  await interval();
  const chip = document.getElementById("second-opinion-research-chip");
  assert.equal(chip.textContent, "Research DEMO");
  await chip.onclick();
  assert.deepEqual(JSON.parse(JSON.stringify(messages[0])), {
    type: "RESEARCH", symbol: "DEMO", source_url: "https://robinhood.com/stocks/DEMO",
  });
});

test("manifest references real entry points and declares detector modules", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Second Opinion (demo)");
  assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "storage"]);
  assert.equal(manifest.background.type, "module");
  const paths = [manifest.background.service_worker, manifest.action.default_popup,
    ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => script.js)];
  for (const path of paths) assert.ok(existsSync(fileURLToPath(new URL(path, root))), path);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://robinhood.com/stocks/*", "https://x.com/*", "https://mail.google.com/*", "http://localhost:5500/*",
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ["detectors/*.js", "lib/capture.js", "lib/linkGuard.js"]);
  assert.deepEqual(manifest.host_permissions, ["http://localhost:8000/*", "http://localhost:8001/*"]);
});

test("web and extension generated contracts stay identical", () => {
  assert.equal(readFileSync(new URL("lib/contracts.d.ts", root), "utf8"),
    readFileSync(new URL("../../web/lib/contracts.ts", import.meta.url), "utf8"));
});
