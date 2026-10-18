"""Market data agent. Owner D."""

import math

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


async def _fetch_market(symbol: str) -> dict:
    import yfinance as yf  # type: ignore

    tick = yf.Ticker(symbol)
    spy = yf.Ticker("SPY")

    hist_30 = tick.history(period="1mo")
    hist_90 = tick.history(period="3mo")
    hist_spy_30 = spy.history(period="1mo")
    hist_1y = tick.history(period="1y")

    info = tick.fast_info
    price = float(info.last_price)

    if len(hist_30) < 2:
        raise ValueError(f"no price data for {symbol}")

    def daily_std(hist):
        if len(hist) < 2:
            return None
        return float(hist["Close"].pct_change().dropna().std())

    def annualized(std):
        # Fraction, like the fixtures: 0.25 means 25% a year.
        return None if std is None else round(std * math.sqrt(252), 4)

    def per_1000(std):
        # Dollars a $1,000 position moves on a typical day.
        return None if std is None else round(std * 1000, 2)

    std_30, std_90, spy_std = daily_std(hist_30), daily_std(hist_90), daily_std(hist_spy_30)

    # Max drawdown over 1y
    max_dd_1y = 0.0
    if len(hist_1y) >= 2:
        roll_max = hist_1y["Close"].cummax()
        dd = (hist_1y["Close"] - roll_max) / roll_max
        max_dd_1y = round(float(dd.min()), 4)

    avg_vol_30 = int(hist_30["Volume"].mean()) if len(hist_30) else 0
    recent_vol = int(hist_30["Volume"].iloc[-1]) if len(hist_30) else 0
    volume_vs_30d = round(recent_vol / avg_vol_30, 2) if avg_vol_30 else None

    return {
        "price": price,
        "vol_30d": annualized(std_30),
        "vol_90d": annualized(std_90),
        "move_per_1000_usd": per_1000(std_30),
        "spy_move_per_1000_usd": per_1000(spy_std),
        "max_drawdown_1y": max_dd_1y,
        "volume_vs_30d": volume_vs_30d,
    }


class MarketAgent:
    name = "market"

    async def run(self, ctx: dict) -> AgentResult:
        if settings.use_fixture(self.name):
            from app.config import fixture
            return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])

        symbol = ctx.get("symbol", "")
        if not symbol:
            return AgentResult(agent=self.name, status="error", error="no symbol")

        from app.agents.data._common import run_cached

        data = await run_cached(f"market_{symbol}", lambda: _fetch_market(symbol))
        error = data.pop("error", None)
        status = "error" if error and "cached copy" not in (error or "") else "done"
        return AgentResult(agent=self.name, status=status, data=data, error=error)
