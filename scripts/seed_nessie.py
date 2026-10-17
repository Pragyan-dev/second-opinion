"""Owner D: offline persona preview; no external writes."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    # TODO(D): create the demo customer, accounts and transactions in Nessie.
    # TODO(D): save returned IDs under contracts/fixtures/nessie/ for repeatable setup.
    data = json.loads((ROOT / "contracts/fixtures/bank_summary_demo.json").read_text())
    print("OFFLINE persona preview — no Nessie API calls")
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
