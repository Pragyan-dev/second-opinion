#!/usr/bin/env python3
"""Create the Second Opinion demo persona in the Nessie sandbox and save every response.

Usage:
    NESSIE_API_KEY=<key> python scripts/seed_nessie.py

Creates:
  - one customer   (demo persona)
  - one checking   account seeded with $10,000
  - one brokerage  account starting at $0

Saves every API response to contracts/fixtures/nessie/ for offline replay.
Safe to re-run: prints existing IDs when the fixture files already exist.
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "contracts" / "fixtures" / "nessie"
FIXTURES.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(ROOT / "backend"))

BASE_URL = "http://api.nessieisreal.com"


def _key() -> str:
    k = os.getenv("NESSIE_API_KEY", "")
    if not k:
        # Try loading from .env
        env_path = ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("NESSIE_API_KEY="):
                    k = line.split("=", 1)[1].strip()
    if not k:
        print("ERROR: NESSIE_API_KEY is not set. Export it or add it to .env")
        sys.exit(1)
    return k


def _get(path: str, key: str) -> dict:
    import httpx
    resp = httpx.get(f"{BASE_URL}{path}?key={key}", timeout=10)
    resp.raise_for_status()
    return resp.json()


def _post(path: str, key: str, body: dict) -> dict:
    import httpx
    resp = httpx.post(f"{BASE_URL}{path}?key={key}", json=body, timeout=10)
    resp.raise_for_status()
    return resp.json()


def _save(name: str, data: dict) -> None:
    path = FIXTURES / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"  saved → {path.relative_to(ROOT)}")


def main() -> None:
    key = _key()
    print(f"Nessie API key: {key[:6]}…")

    # ── Customer ──────────────────────────────────────────────────────────────
    cust_file = FIXTURES / "customer.json"
    if cust_file.exists():
        customer = json.loads(cust_file.read_text())
        customer_id = customer.get("_id") or customer.get("objectCreated", {}).get("_id")
        print(f"Customer already exists: {customer_id}")
    else:
        print("Creating customer…")
        body = {
            "first_name": "Demo",
            "last_name": "User",
            "address": {
                "street_number": "1",
                "street_name": "Demo St",
                "city": "Baltimore",
                "state": "MD",
                "zip": "21202",
            },
        }
        result = _post("/customers", key, body)
        _save("customer", result)
        customer_id = result.get("objectCreated", {}).get("_id") or result.get("_id")
        print(f"  customer_id = {customer_id}")

    # ── Checking account ──────────────────────────────────────────────────────
    checking_file = FIXTURES / "checking.json"
    if checking_file.exists():
        checking = json.loads(checking_file.read_text())
        checking_id = checking.get("_id") or checking.get("objectCreated", {}).get("_id")
        print(f"Checking account already exists: {checking_id}")
    else:
        print("Creating checking account…")
        body = {
            "type": "Checking",
            "nickname": "Second Opinion Demo Checking",
            "rewards": 0,
            "balance": 10000,
        }
        result = _post(f"/customers/{customer_id}/accounts", key, body)
        _save("checking", result)
        checking_id = result.get("objectCreated", {}).get("_id") or result.get("_id")
        print(f"  checking_id = {checking_id}")

    # ── Brokerage account ─────────────────────────────────────────────────────
    brokerage_file = FIXTURES / "brokerage.json"
    if brokerage_file.exists():
        brokerage = json.loads(brokerage_file.read_text())
        brokerage_id = brokerage.get("_id") or brokerage.get("objectCreated", {}).get("_id")
        print(f"Brokerage account already exists: {brokerage_id}")
    else:
        print("Creating brokerage account…")
        body = {
            "type": "Savings",
            "nickname": "Second Opinion Demo Brokerage",
            "rewards": 0,
            "balance": 0,
        }
        result = _post(f"/customers/{customer_id}/accounts", key, body)
        _save("brokerage", result)
        brokerage_id = result.get("objectCreated", {}).get("_id") or result.get("_id")
        print(f"  brokerage_id = {brokerage_id}")

    # ── Summary ───────────────────────────────────────────────────────────────
    summary = {
        "customer_id": customer_id,
        "from_account_id": checking_id,
        "to_account_id": brokerage_id,
    }
    _save("accounts", summary)
    print("\nDone. Add these to .env (or .env.example with blank values):")
    print(f"  NESSIE_CUSTOMER_ID={customer_id}")
    print(f"  NESSIE_CHECKING_ID={checking_id}")
    print(f"  NESSIE_BROKERAGE_ID={brokerage_id}")


if __name__ == "__main__":
    main()
