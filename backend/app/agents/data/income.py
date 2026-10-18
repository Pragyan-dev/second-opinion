"""Income / dividend data agent. Owner D."""

from app.config import settings

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


async def _fetch_income(symbol: str) -> dict:
    import yfinance as yf  # type: ignore

    tick = yf.Ticker(symbol)
    info = tick.info
    hist_1y = tick.history(period="1y")
    divs = tick.dividends

    if len(hist_1y) < 2:
        raise ValueError(f"no price history for {symbol}")

    pays_dividend = bool(info.get("dividendRate") or (len(divs) > 0))
    yield_ttm = _yield_ttm(divs, float(hist_1y["Close"].iloc[-1]))
    frequency = _div_frequency(divs)
    last_ex_date = _last_ex_date(info)
    years_uninterrupted = _years_uninterrupted(divs)

    # Fractions, like the fixtures: 0.05 means 5%.
    price_return_1y = round(float(hist_1y["Close"].iloc[-1] / hist_1y["Close"].iloc[0] - 1), 4)
    total_return_1y = round(price_return_1y + (yield_ttm or 0.0), 4)

    return {
        "pays_dividend": pays_dividend,
        "yield_ttm": yield_ttm,
        "frequency": frequency,
        "last_ex_date": last_ex_date,
        "years_uninterrupted": years_uninterrupted,
        "price_return_1y": price_return_1y,
        "total_return_1y": total_return_1y,
    }


def _yield_ttm(divs, price: float) -> float | None:
    """Dividends paid in the last 12 months over the latest price, as a fraction.

    Computed from the payments themselves because yfinance's dividendYield field
    changed from a fraction to a percent between versions.
    """
    if len(divs) == 0 or not price:
        return None
    import pandas as pd
    recent = divs[divs.index >= (pd.Timestamp.now(tz=divs.index.tz) - pd.DateOffset(years=1))]
    return round(float(recent.sum()) / price, 4) if len(recent) else None


def _div_frequency(divs) -> str:
    if len(divs) < 2:
        return "unknown"
    # Compare last 12 months of payments
    import pandas as pd
    recent = divs[divs.index >= (pd.Timestamp.now(tz=divs.index.tz) - pd.DateOffset(years=1))]
    n = len(recent)
    if n >= 11:
        return "monthly"
    if n >= 3:
        return "quarterly"
    if n >= 1:
        return "annual"
    return "unknown"


def _last_ex_date(info: dict) -> str | None:
    ts = info.get("exDividendDate")
    if ts:
        import datetime
        return str(datetime.date.fromtimestamp(ts))
    return None


def _years_uninterrupted(divs) -> int | None:
    if len(divs) < 2:
        return None
    # Walk backwards year by year; stop when a year has no payment
    import pandas as pd
    years = 0
    now = pd.Timestamp.now(tz=divs.index.tz)
    for y in range(0, 100):
        start = now - pd.DateOffset(years=y + 1)
        end = now - pd.DateOffset(years=y)
        if len(divs[(divs.index >= start) & (divs.index < end)]) == 0:
            break
        years += 1
    return years if years > 0 else None


class IncomeAgent:
    name = "income"

    async def run(self, ctx: dict) -> AgentResult:
        if settings.use_fixture(self.name):
            from app.config import fixture
            return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])

        symbol = ctx.get("symbol", "")
        if not symbol:
            return AgentResult(agent=self.name, status="error", error="no symbol")

        from app.agents.data._common import run_cached

        data = await run_cached(f"income_{symbol}", lambda: _fetch_income(symbol))
        error = data.pop("error", None)
        status = "error" if error and "cached copy" not in (error or "") else "done"
        return AgentResult(agent=self.name, status=status, data=data, error=error)
