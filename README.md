# Second Opinion

A fixture-backed hackathon scaffold for checking an investment pitch, exploring a Stock X-ray, and pausing a simulated payment. The demo firm **Brightwater Capital Advisors** and ticker **BRWT** are fictional. Every route works without API keys; agent adapters are stubs with owner-tagged TODOs. This scaffold provides no buy/sell advice and never sends real money.

## Architecture

The Chrome MV3 extension captures a page only after Analyze, receives a job ID immediately, and polls for results. Next.js 14 renders reports, stock sections, and a mock bank. FastAPI runs independent agents concurrently (8-second timeout each) and saves incremental JSON results in standard-library SQLite. `contracts.py` is the source of truth → `contracts/schema.json` → `web/lib/contracts.ts`. The mock API exposes the same routes and reveals one signal or section per poll; `demo` is a reserved fixture ID. All adapters remain fixture-backed even with keys until their TODOs are implemented.

## Start once

Install Python 3.11 and Node.js 22, then run `make setup` and `make types`. Copy `.env.example` to `.env` if needed; empty keys automatically select fixtures. `NEXT_PUBLIC_API_BASE` in the root `.env` is for reference: export it before `make web` (or put it in `web/.env.local`) because Next.js reads its own environment. Each long-running command below needs its own terminal.

Next.js 14 is retained as requested and currently has known security advisories that require a newer major version to fully resolve. This is a local hackathon scaffold; web and API commands bind to loopback. Upgrade Next.js before internet deployment. PostCSS is overridden to a patched compatible 8.x release.

| Role | Folder | Start |
| --- | --- | --- |
| A | `extension/`, `demo-site/` | `make mock`, `make demo`; set `extension/config.js` API_BASE to `http://localhost:8001`; load `extension/` unpacked at `chrome://extensions`, open `http://localhost:5500`, click Analyze, then click `$BRWT`. |
| B | `backend/app/core/`, `pitch/`, `agents/llm/`, contracts and route wiring | `make dev`; API docs: `http://localhost:8000/docs`. |
| C | `web/` | `make mock`, then `NEXT_PUBLIC_API_BASE=http://localhost:8001 make web`; open `http://localhost:3000`. |
| D | `backend/app/agents/data/`, `bank/`, `scripts/seed_nessie.py` | `make dev`; `.venv/bin/python scripts/seed_nessie.py` prints the offline persona without external writes. |

Work branches: `a/extension`, `b/pipeline`, `c/web`, `d/bank`. Team GitHub handles were intentionally skipped; CODEOWNERS records folder boundaries but does not yet request reviewers. B owns registry wiring and config; coordinate shared files and generated types before changing them.

## Checks and demo

```sh
make test
make types
make dev                                   # separate terminal
make mock                                  # separate terminal
make demo-check                            # port 8000
API_BASE=http://localhost:8001 make demo-check
cd web && npm run build
```

`make demo-check` reads the actual demo HTML, submits a capture, polls the report and BRWT X-ray to completion, and checks the mock bank/payment response. It prints PASS or FAIL and exits nonzero on failure. The mock reveals one signal/section per poll and completes on the poll after the last item. Jobs on the real server persist to ignored `jobs.sqlite`, with each agent's complete result saved under `job_id:agent_name`; mock jobs reset when the process restarts.

The persona snapshot is fixed at **2026-10-17**: 30 transactions across three months, a $150 incoming “profit” three days earlier, and a $5,000 outgoing request versus typical $500 transfers. Account balances are snapshot balances; the transaction list is the last 30, not the entire ledger. Payment checks intentionally return the same stop fixture for all positive amounts. Execution without `override_hold: true` returns 409; overrides return a `mock-` transfer ID and move no funds. Market percentages are decimal fractions; `move_per_1000_usd` is a modeled dollar move for a $1,000 position, not market impact. Example.com source links and all official records are fixtures, not live verification.

## Merge rules

- Work in your folder; coordinate changes to contracts, registry wiring, and generated files with B.
- Keep PRs small. Main must always run using fixtures.
- Announce contract changes; update schema, fixtures, and generated types in the same PR (`make types`). Never hand-edit generated types.
- Before merging, run `make test`, the web build, and `make demo-check` against both servers. CI runs backend and web jobs in parallel with 3-minute limits.
- Demo site: fictional firm only. Never clone a real company's identity, logos, or styling, or describe a real company as a scam. Keep the required fiction disclosure visible.
