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
const stock = await import("../detectors/stock.js");

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
  assert.deepEqual(stock.detect().tickers, ["BRWT"]);
  globalThis.location = new URL("https://robinhood.com/stocks/DEMO");
  assert.deepEqual(stock.detect().tickers, ["DEMO"]);
  globalThis.location = new URL("https://robinhood.com/stocks/");
  assert.deepEqual(stock.detect().tickers, ["BRWT"]);
});

test("stock quote pages on finance sites give their ticker", () => {
  const cases = {
    "https://finance.yahoo.com/quote/AAPL/": "AAPL",
    "https://finance.yahoo.com/quote/BRK-B/news/": "BRK-B",
    "https://finance.yahoo.com/quote/RELIANCE.NS/": "RELIANCE.NS",
    "https://finance.yahoo.com/lookup?p=TSLA": "TSLA",
    "https://www.google.com/finance/quote/MSFT:NASDAQ": "MSFT",
    "https://www.google.com/finance/quote/BRK.B:NYSE": "BRK-B",
    "https://www.google.com/finance/quote/RELIANCE:NSE": "RELIANCE.NS",
    "https://www.google.com/search?q=%24nvda": "NVDA",
    "https://www.marketwatch.com/investing/stock/aapl": "AAPL",
    "https://www.cnbc.com/quotes/TROW": "TROW",
    "https://www.nasdaq.com/market-activity/stocks/amzn": "AMZN",
    "https://seekingalpha.com/symbol/GOOG/earnings": "GOOG",
    "https://finviz.com/quote.ashx?t=AMD&p=d": "AMD",
    "https://www.tradingview.com/symbols/NASDAQ-AAPL/": "AAPL",
    "https://www.bloomberg.com/quote/IBM:US": "IBM",
    "https://www.morningstar.com/stocks/xnas/aapl/quote": "AAPL",
    "https://stocktwits.com/symbol/PLTR": "PLTR",
    "https://www.zacks.com/stock/quote/KO": "KO",
    "https://www.fool.com/quote/nasdaq/aapl/": "AAPL",
    "https://www.barrons.com/market-data/stocks/dis": "DIS",
    "https://www.webull.com/quote/nyse-ko": "KO",
    "https://www.reuters.com/markets/companies/AAPL.OQ/": "AAPL",
  };
  page("https://example.com/", "<main>Quote</main>");
  for (const [url, symbol] of Object.entries(cases)) assert.equal(stock.symbolFor(new URL(url)), symbol, url);
  for (const url of ["https://finance.yahoo.com/", "https://www.google.com/search?q=weather",
    "https://www.google.com/maps", "https://www.cnbc.com/world/", "https://example.com/quote/AAPL"]) {
    assert.equal(stock.symbolFor(new URL(url)), null, url);
  }
});

test("a Google stock search reads the ticker from the result card", () => {
  page("https://www.google.com/search?q=apple+stock", "<div>Apple Inc NASDAQ: AAPL 343.46 USD</div>");
  assert.deepEqual(stock.detect().tickers, ["AAPL"]);
  page("https://www.google.com/search?q=apple+pie", "<div>NASDAQ: AAPL mentioned in passing</div>");
  assert.equal(stock.detect(), null);
});

test("generic capture also finds exchange-prefixed tickers", () => {
  page("https://news.example/story", "<p>Shares of Acme (NYSE: ACME) and $BRWT moved.</p>");
  assert.deepEqual(website.detect().tickers, ["ACME", "BRWT"]);
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
  const matches = manifest.content_scripts[0].matches;
  assert.deepEqual(matches.slice(0, 4), [
    "https://robinhood.com/stocks/*", "https://x.com/*", "https://mail.google.com/*", "http://localhost:5500/*",
  ]);
  // Every stock site the detector knows gets the content script, and nothing broader.
  for (const site of stock.SITES) assert.ok(matches.some(m => m.startsWith(`https://${site.host}/`)), site.host);
  assert.ok(!matches.some(m => m.includes("<all_urls>") || m.startsWith("*://") || m.includes("://*.")));
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ["detectors/*.js", "lib/capture.js", "lib/linkGuard.js"]);
  assert.deepEqual(manifest.host_permissions, ["http://localhost:8000/*", "http://localhost:8001/*"]);
});

test("web and extension generated contracts stay identical", () => {
  assert.equal(readFileSync(new URL("lib/contracts.d.ts", root), "utf8"),
    readFileSync(new URL("../../web/lib/contracts.ts", import.meta.url), "utf8"));
});
