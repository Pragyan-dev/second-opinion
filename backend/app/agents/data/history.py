"""History data agent. Owner D."""

import os

try:
    from app.contracts import AgentResult
except ImportError:
    from typing import Literal, Optional

    from pydantic import BaseModel

    class AgentResult(BaseModel):  # type: ignore[no-redef]
        agent: str
        status: Literal["pending", "running", "done", "error"] = "done"
        data: dict = {}
        error: Optional[str] = None


async def _fetch_history(symbol: str) -> dict:
    import yfinance as yf  # type: ignore

    tick = yf.Ticker(symbol)
    hist_1y = tick.history(period="1y")
    hist_5y = tick.history(period="5y")

    def to_series(df):
        return [
            {"date": str(d.date()), "close": round(float(c), 4)}
            for d, c in zip(df.index, df["Close"])
        ]

    prices_1y = to_series(hist_1y)
    prices_5y = to_series(hist_5y.iloc[::5])  # thin to every 5th day

    high_52w = float(hist_1y["Close"].max()) if len(hist_1y) else 0.0
    low_52w = float(hist_1y["Close"].min()) if len(hist_1y) else 0.0

    return_1y = None
    return_5y = None
    if len(hist_1y) >= 2:
        return_1y = round((hist_1y["Close"].iloc[-1] / hist_1y["Close"].iloc[0] - 1) * 100, 2)
    if len(hist_5y) >= 2:
        return_5y = round((hist_5y["Close"].iloc[-1] / hist_5y["Close"].iloc[0] - 1) * 100, 2)

    max_drawdown_1y = None
    if len(hist_1y) >= 2:
        roll_max = hist_1y["Close"].cummax()
        dd = (hist_1y["Close"] - roll_max) / roll_max
        max_drawdown_1y = round(float(dd.min()) * 100, 2)

    try:
        cal = tick.calendar
        earnings_dates = []
        if cal is not None and not cal.empty:
            for col in cal.columns:
                if "earnings" in col.lower():
                    for v in cal[col]:
                        try:
                            earnings_dates.append(str(v))
                        except Exception:
                            pass
    except Exception:
        earnings_dates = []

    return {
        "prices_1y": prices_1y,
        "prices_5y": prices_5y,
        "high_52w": high_52w,
        "low_52w": low_52w,
        "return_1y": return_1y,
        "return_5y": return_5y,
        "max_drawdown_1y": max_drawdown_1y,
        "earnings_dates": earnings_dates[:4],
    }


class HistoryAgent:
    name = "history"

    async def run(self, ctx: dict) -> AgentResult:
        use_fixtures = os.getenv("USE_FIXTURES", "1") != "0"
        if use_fixtures:
            from app.config import fixture
            return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])

        symbol = ctx.get("symbol", "")
        if not symbol:
            return AgentResult(agent=self.name, status="error", error="no symbol")

        from app.agents.data._common import run_cached

        data = await run_cached(f"history_{symbol}", lambda: _fetch_history(symbol))
        error = data.pop("error", None)
        status = "error" if error and "cached copy" not in (error or "") else "done"
        return AgentResult(agent=self.name, status=status, data=data, error=error)
