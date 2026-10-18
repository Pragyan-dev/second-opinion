# Second Opinion

A Technica 2026 app for message fraud checks, stock research, and human-reviewed funding previews. The main API runs live checks by default. Bundled examples and placeholder records are confined to explicit fixture mode and the mock API. Brightwater Capital Advisors and BRWT are fictional test cases. This app gives no buy or sell advice.

## Architecture and folders

Chrome detectors capture one visible email, one X post, a stock page, or a generic webpage. FastAPI creates a job immediately and saves incremental results in standard-library SQLite. Fraud analysis runs Extract, then Crawl, then the remaining steps in parallel. All five stock agents run in parallel. Each agent has an 8-second timeout. The mock reveals one signal or stock section per poll. Next.js renders minimal dashboards and a review-only checkout.

```text
backend/app/
  contracts.py       Pydantic source of truth
  core/              orchestration, SQLite store, JSON cache
  fraud/             extraction, crawler, record/domain/claim checks
  agents/data/       market, history, income, red flags
  agents/llm/        news and explanation stubs
  purchase/          guarded read/review client, preview, confirmed funding stub
backend/tests/       route, fixture, sequencing, and no-trade checks
contracts/fixtures/  two fraud cases, stock data, preview, captures, cached-record placeholders
extension/           detectors/ (Gmail, Mailpit, X, stock, website), popup/, generated lib/contracts.d.ts
web/app/             fraud/[id], stock/[id], checkout/[id]
demo-site/           fictional Brightwater landing page
                     published at https://chirumer.github.io/temporary_hackathon_fake_site/
scripts/             schema/types, demo check, offline persona stub
```

`make types` generates `contracts/schema.json`, `web/lib/contracts.ts`, and `extension/lib/contracts.d.ts` from the exact Python contracts. Do not edit generated files by hand.

## Start

Install Python 3.11 and Node.js 22. Run `make setup` and `make types`. Copy `.env.example` to `.env` and configure the OpenRouter and search keys. Use `USE_FIXTURES=0`, an empty `FIXTURE_AGENTS`, and `LIVE_BROKERCHECK=1` for live checks. Run `make dev` and `make web` in separate terminals; the dashboard proxies API requests to port 8000 by default.

Live BrokerCheck and RDAP lookups never substitute bundled records. Reserved `.example` domains have no live registration age. Missing record fields and failed lookups are shown as not checked. Demo report IDs are unavailable on the live API. Existing reports are historical snapshots: submit a new capture after changing modes. To separate earlier demo jobs from live reports, set `DATABASE_PATH` to a new SQLite file such as `jobs-live.sqlite`.

For offline development, use `USE_FIXTURES=1 make dev` or `make mock`. Tests enable fixture mode explicitly and block network access.

The dashboard has an **Accessibility** button on every page; **Ctrl+U** or **⌘+U** also opens it, and **Escape** closes it. It includes contrast modes, link highlighting, text size/spacing/alignment, line height, a readable font, animation pause, image hiding, a large cursor/reading guide, tooltips, and a live heading outline. Preferences are saved in this browser; **Reset all settings** restores defaults. **Oversized widget** enlarges the controls.

The menu’s **Screen Reader** tile reads visible page text (or selected text) aloud through browser speech synthesis, with pause/resume/stop controls. It supplements the device’s screen reader. **Voice Navigation** shows the supported commands and requires an explicit **Start listening** click and microphone permission. Recognition depends on the browser and may use its speech service; unavailable features and errors are explained in the menu. Speech and microphone state are never saved and stop on dashboard route changes. UI regression checks run with `cd web && npm run test:ui`.

| Role | Start |
| --- | --- |
| A | `make mock`, `make demo`; change `extension/config.js` API_BASE to `http://localhost:8001`, load `extension/` unpacked at `chrome://extensions`, then open `http://localhost:5500`. |
| B | `make dev`; work in `core/`, `fraud/`, LLM agents, contracts, and route wiring. Docs: `http://localhost:8000/docs`. |
| C | `make mock`, then `NEXT_PUBLIC_API_BASE=http://localhost:8001 make web`; open `http://localhost:3000`. |
| D | `make dev`; run `.venv/bin/python scripts/seed_nessie.py` for the offline persona stub; work in data agents and `purchase/`. |

## Verify Authenticity in Gmail and Mailpit

The extension adds a **Verify Authenticity** button to an open email: next to the subject in Gmail, and as a tab beside Preview, Text and Headers in [Mailpit](https://mailpit.axllent.org), a local test inbox. Clicking the button sends the email to `POST /v1/fraud/analyze` and opens the report at `http://localhost:3000/fraud/<id>`, next to the email's tab. The email's subject goes in `email_title`, and its plain-text body goes in `email_body`, with each link written as `text <url>`. Sender, links, `mailto:` addresses and `tel:` numbers are sent too.

Before you click anything, a local pattern check runs in the page (`extension/lib/shady.js`). If the email looks suspicious, for example because it promises guaranteed returns, pressures you to act fast, asks for credentials or links to a domain that looks like the sender's, the button shows a red **!**. Hover over it to see the reasons. This check makes no network requests: nothing is sent until you click.

For emails, the report starts with **Why this email could be phishing**. This section lists each reason with the email's own words quoted and shows the link the email asks you to open, as plain text only. The agent then visits that link, and **What the linked page says** reports on the page separately:

- the page's own warning signs, each quoted from the page: countdowns, "only N spots left", guaranteed returns, endorsements, wire or crypto payment, moves to WhatsApp
- the sensitive details its forms ask for, such as passwords, card numbers or bank details
- whether its firm, email and phone match the email, and whether it is hosted away from its own contact domain

The record and domain checks and the live view of the agent's browser follow. The likelihood score and the written explanation cover both the email and the page.

Gmail is read only when exactly one message body is open. In Mailpit, the open message is read from Mailpit's own API on `localhost:8025` or `127.0.0.1:8025`, and the message list is never read. Mailpit runs under a `--webroot` path are also supported.

### Set up Mailpit

1. Install and start Mailpit. It serves the UI at `http://localhost:8025` and SMTP at `localhost:1025`.

   ```sh
   brew install mailpit && mailpit
   # or, with Docker:
   docker run --rm -p 8025:8025 -p 1025:1025 axllent/mailpit
   ```

2. Start the API and dashboard with `make dev` and `make web`. For the mock API, run `make mock` and change `API_BASE` in `extension/config.js` to `http://localhost:8001`. The mock returns the pattern-based phishing reasons for the email you send it.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `extension/`. After you change the extension, click its reload button and reload the Mailpit tab.
4. Send a test email. Any SMTP client pointed at `localhost:1025` works; Mailpit's send API is the quickest:

   ```sh
   curl -X POST http://localhost:8025/api/v1/send -H 'Content-Type: application/json' -d '{
     "From": {"Name": "Michael Myers", "Email": "michael.myers@brightwater-capital.example"},
     "To": [{"Name": "Ryan", "Email": "ryan@example.com"}],
     "Subject": "Exclusive pre-IPO allocation",
     "Text": "Dear Ryan,\n\nWe have secured a limited allocation in a pre-IPO stock with a guaranteed 18.5% return. Reply within 24 hours to reserve your place: https://chirumer.github.io/temporary_hackathon_fake_site/\n\nMichael Myers\nBrightwater Capital Advisors",
     "HTML": "<p>Dear Ryan,</p><p>We have secured a limited allocation in a pre-IPO stock with a <b>guaranteed 18.5% return</b>. Reply within 24 hours to <a href=\"https://chirumer.github.io/temporary_hackathon_fake_site/\">reserve your place</a>.</p><p>Michael Myers<br>Brightwater Capital Advisors</p>"
   }'
   ```

5. Open `http://localhost:8025` and click the email. The **Verify Authenticity** tab shows a **!** for this example. Click it, and the report opens in a new tab. If the request fails, the tab reads **Retry Verify Authenticity**; hover over it to see the error.

In fixture mode (`USE_FIXTURES=1`), the site visit and the agent's browser show the bundled Brightwater site rather than the link in the email. In live mode, the link the email asks you to open is the one visited. The live view needs Playwright (`.venv/bin/pip install playwright && .venv/bin/playwright install chromium`). Fictional `.example` links only resolve through `CRAWL_HOST_ALIASES`. For example, `brightwater-capitals.example=http://127.0.0.1:5500` serves the demo site from `make demo` under that name.

Next.js 14 is retained as requested and has known security advisories requiring a newer major version to fully resolve. Web and API commands bind to loopback. Upgrade before internet deployment. PostCSS uses a patched compatible 8.x override.

## V2 routes

Both APIs expose the same routes:

| Method | Path | Result |
| --- | --- | --- |
| GET | `/health` | `{ok: true}` |
| POST | `/v1/fraud/analyze` | Capture to `{report_id, status}`, HTTP 202 |
| GET | `/v1/fraud/{id}` | FraudReport |
| POST | `/v1/stock/research` | `{symbol, source_url}` to `{research_id, status}`, HTTP 202 |
| GET | `/v1/stock/{id}` | StockReport |
| POST | `/v1/purchase/preview` | OrderTicket to OrderPreview, always `awaiting_human` |
| POST | `/v1/purchase/fund` | FundingRequest to a simulated `mock-` transfer ID |

Funding requires the literal JSON value `human_confirmed: true`; false, missing, null, strings, and numbers return HTTP 400. The adapter rechecks confirmation. Preview uses cached fixtures labeled `simulated` when the Robinhood stub is unavailable. It never submits an order. The only allowed tools are read/review tools; unknown tools and trading prefixes are rejected before any future network transport. No route, function, or tool call places, cancels, or exercises a trade.

## Three-act demo

1. **Compare messages:** submit `captures/x_post_troweprice.json` for a low-concern simulated case, then `captures/email_brightwater.json` for the fictional high-concern clone case. Mock selection checks text and links for Brightwater. Demo dashboard IDs are `real-demo` and `clone-demo`; Jev evidence quotes text from `demo-site/index.html`.
2. **Research:** start BRWT research from the Robinhood research chip or view `/stock/demo`. All five sections, dated articles with relevance scores, pros, cons, and questions use fixtures. The article controls sort by newest date or relevance.
3. **Review:** open `/checkout/demo`, adjust shares, inspect the simulated preview, and explicitly click Approve transfer to create a mock funding ID. The order button stays disabled. **No order has been placed.**

The extension reads Gmail only when one message body is visibly open; it never enumerates inbox rows or calls Gmail APIs. X capture is scoped to the selected status post. Stock-page URL changes re-detect the symbol and refresh the research chip. The research chip appears on stock quote pages on Robinhood, Yahoo Finance, Google Finance and Google stock searches, MarketWatch, CNBC, Nasdaq, Seeking Alpha, Finviz, TradingView, Bloomberg, Morningstar, Stocktwits, Zacks, Motley Fool, Barron's, Webull and Reuters (`extension/detectors/stock.js`). On any other page, the popup offers research for tickers the page mentions, such as `$AAPL` or `NASDAQ: AAPL`. Generic fallback is disabled on these supported hosts when their detector refuses the page.

## Validation and merge rules

```sh
make test
make types
cd web && npm run test:ui && npm run test:extension && npm run build
# Start make mock in another terminal:
API_BASE=http://localhost:8001 make demo-check
```

The demo check submits both fraud cases, polls stock research, verifies a simulated preview, checks confirmation refusal and tool guards, then runs `test_no_trade.py`. Main and mock share tests. Extension checks validate the manifest, detector privacy boundaries, generated types, and stock SPA behavior. Browser DOM selectors still need manual verification against real site layouts. Real adapters, crawling, charts, and live cached lookups remain owner-tagged TODOs.

Keep PRs small and coordinate shared contracts with B. Keep fixtures isolated from live lookups. Contract changes require schema, both type files, and fixtures in the same PR. Team handles remain unassigned in CODEOWNERS as requested. The fictional demo site must never copy a real company's identity or label a real company as a scam.

For the obsolete-name check, scan Git-tracked source files rather than installed dependencies, build output, or local SQLite data. Allow only the migration note below.

V1 to v2: removed pitch, xray, bank, payments, sidepanel, and payment_rules folders, routes, and contracts.
