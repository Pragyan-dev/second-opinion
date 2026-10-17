#!/usr/bin/env python3
"""Probe yfinance and Robinhood MCP availability. Usage: python scripts/probe_services.py AAPL"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


async def probe_yfinance(symbol: str) -> None:
    print("── yfinance ──")
    try:
        import yfinance as yf  # type: ignore

        tick = yf.Ticker(symbol)
        hist = tick.history(period="5y")
        info = tick.fast_info
        print(f"  5-year history rows : {len(hist)}")
        print(f"  last close          : {info.last_price:.2f}")
        print("  status              : OK")
    except Exception as exc:
        print(f"  status              : FAILED – {exc}")


async def probe_robinhood(symbol: str) -> None:
    print("── Robinhood MCP ──")
    url = os.getenv("ROBINHOOD_MCP_URL", "")
    if not url:
        print("  ROBINHOOD_MCP_URL not set – skipping")
        return

    try:
        import httpx  # type: ignore

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{url.rstrip('/')}/tools/list")
            if resp.status_code == 200:
                tools = resp.json()
                names = [t.get("name") for t in tools.get("tools", tools)]
                print(f"  tools exposed ({len(names)}): {names}")

                # Check extra names from env
                extra = [
                    n.strip()
                    for n in os.getenv("RH_ALLOWED_TOOLS", "").split(",")
                    if n.strip()
                ]
                if extra:
                    print(f"  RH_ALLOWED_TOOLS override: {extra}")
            else:
                print(f"  status: HTTP {resp.status_code}")
    except Exception as exc:
        print(f"  status: FAILED – {exc}")
        print("  fallback: yfinance quote + local math will be labeled 'simulated'")
        await _simulate_preview(symbol)


async def _simulate_preview(symbol: str) -> None:
    print("── simulated preview ──")
    try:
        import yfinance as yf  # type: ignore

        info = yf.Ticker(symbol).fast_info
        price = float(info.last_price)
        print(f"  {symbol} last price : {price:.2f}  (source: yfinance, label: simulated)")
    except Exception as exc:
        print(f"  could not fetch simulated price: {exc}")


async def main() -> None:
    symbol = sys.argv[1] if len(sys.argv) > 1 else "AAPL"
    print(f"Probing services for symbol: {symbol}\n")
    await probe_yfinance(symbol)
    print()
    await probe_robinhood(symbol)


if __name__ == "__main__":
    asyncio.run(main())
