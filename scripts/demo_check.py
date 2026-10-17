"""Exercise either API with API_BASE=http://localhost:8001 make demo-check."""

import os
import sys
import time
from html.parser import HTMLParser
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]


class TextCapture(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data.strip())


def poll(client, route):
    for _ in range(120):
        response = client.get(route)
        response.raise_for_status()
        data = response.json()
        if data["status"] == "done":
            return data
        assert data["status"] != "error", data
        time.sleep(0.25)
    raise AssertionError(f"Timed out: {route}")


def main():
    base = os.getenv("API_BASE", "http://localhost:8000")
    try:
        parser = TextCapture()
        parser.feed((ROOT / "demo-site/index.html").read_text())
        with httpx.Client(base_url=base, timeout=10) as client:
            assert client.get("/health").json() == {"ok": True}
            response = client.post(
                "/v1/analyze",
                json={
                    "url": "http://localhost:5500",
                    "title": "Brightwater Capital Advisors",
                    "text": " ".join(parser.parts)[:20000],
                    "tickers": ["BRWT"],
                    "emails": ["offers@brightwater-capital.example"],
                    "phones": ["+1-202-555-0199"],
                },
            )
            response.raise_for_status()
            report_id = response.json()["report_id"]
            report = poll(client, f"/v1/reports/{report_id}")
            assert report["band"] == "high" and len(report["signals"]) == 8
            response = client.post("/v1/xray", json={"symbol": "BRWT"})
            response.raise_for_status()
            xray = poll(client, f"/v1/xray/{response.json()['xray_id']}")
            assert xray["symbol"] == "BRWT" and len(xray["sections"]) == 4
            bank = client.get("/v1/bank/demo/summary")
            bank.raise_for_status()
            assert len(bank.json()["transactions"]) == 30
            payment = client.post(
                "/v1/payments/check",
                json={
                    "customer_id": "demo",
                    "from_account_id": "checking-demo",
                    "payee_account_id": "brightwater-demo",
                    "payee_name": "Brightwater demo",
                    "amount": 5000,
                    "report_id": report_id,
                },
            )
            payment.raise_for_status()
            assert (
                payment.json()["level"] == "stop" and payment.json()["hold_recommended"]
            )
        print(f"PASS {base}")
        return 0
    except Exception as exc:
        print(f"FAIL {base}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
