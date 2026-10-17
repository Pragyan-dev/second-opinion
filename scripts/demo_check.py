"""Exercise both message cases, stock research, preview, and no-trade checks."""

import os
import subprocess
import sys
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import fixture
from app.contracts import FraudReport, OrderPreview, StockReport
from app.purchase.robinhood_mcp import ALLOWED_TOOLS, guard_tool


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
        with httpx.Client(base_url=base, timeout=10) as client:
            assert client.get("/health").json() == {"ok": True}
            for capture_file, band in [
                ("x_post_troweprice.json", "low"),
                ("email_brightwater.json", "high"),
            ]:
                response = client.post(
                    "/v1/fraud/analyze", json=fixture(f"captures/{capture_file}")
                )
                assert response.status_code == 202, response.text
                report = FraudReport.model_validate(
                    poll(client, f"/v1/fraud/{response.json()['report_id']}")
                )
                assert report.band == band, report
            capture = fixture("captures/robinhood_page.json")
            response = client.post(
                "/v1/stock/research",
                json={"symbol": capture["tickers"][0], "source_url": capture["url"]},
            )
            assert response.status_code == 202, response.text
            research_id = response.json()["research_id"]
            stock = StockReport.model_validate(poll(client, f"/v1/stock/{research_id}"))
            assert len(stock.sections) == 5 and len(stock.articles) >= 6
            response = client.post(
                "/v1/purchase/preview",
                json={
                    "symbol": "BRWT",
                    "quantity": 10,
                    "order_type": "market",
                    "research_id": research_id,
                },
            )
            response.raise_for_status()
            preview = OrderPreview.model_validate(response.json())
            assert preview.status == "awaiting_human" and preview.data_source == "simulated"
            funding = {
                "customer_id": "demo",
                "from_account_id": "checking-demo",
                "to_account_id": "investment-demo",
                "amount": preview.est_total,
            }
            for value in [False, None, 0, 1, "true"]:
                assert (
                    client.post(
                        "/v1/purchase/fund", json={**funding, "human_confirmed": value}
                    ).status_code
                    == 400
                )
            assert client.post("/v1/purchase/fund", json=funding).status_code == 400
            paths = client.get("/openapi.json").json()["paths"]
            assert not any("execute" in path for path in paths)
        assert all(
            not name.startswith(("place_", "cancel_", "exercise_")) for name in ALLOWED_TOOLS
        )
        try:
            guard_tool("place_equity_order")
        except ValueError:
            pass
        else:
            raise AssertionError("Trade guard did not reject a forbidden tool")
        subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "backend/tests/test_no_trade.py"],
            cwd=ROOT,
            check=True,
        )
        print(f"PASS {base}")
        return 0
    except (
        AssertionError,
        ValueError,
        KeyError,
        httpx.HTTPError,
        subprocess.CalledProcessError,
    ) as exc:
        print(f"FAIL {base}: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
