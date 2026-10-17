"""Market data agent. Owner D."""

import math
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

    def vol_per_1000(hist):
        if len(hist) < 2:
            return 0.0
        std = float(hist["Close"].pct_change().dropna().std())
        # annualized monthly swing: daily std * sqrt(21) * 1000
        return round(std * math.sqrt(21) * 1000, 2)

    vol_30d = vol_per_1000(hist_30)
    vol_90d = vol_per_1000(hist_90)
    spy_vol = vol_per_1000(hist_spy_30)

    # Max drawdown over 1y
    max_dd_1y = 0.0
    if len(hist_1y) >= 2:
        roll_max = hist_1y["Close"].cummax()
        dd = (hist_1y["Close"] - roll_max) / roll_max
        max_dd_1y = round(float(dd.min()) * 100, 2)

    avg_vol_30 = int(hist_30["Volume"].mean()) if len(hist_30) else 0
    recent_vol = int(hist_30["Volume"].iloc[-1]) if len(hist_30) else 0
    volume_vs_30d = round(recent_vol / avg_vol_30, 2) if avg_vol_30 else None

    return {
        "price": price,
        "vol_30d": vol_30d,
        "vol_90d": vol_90d,
        "move_per_1000_usd": vol_30d,
        "spy_move_per_1000_usd": spy_vol,
        "max_drawdown_1y": max_dd_1y,
        "volume_vs_30d": volume_vs_30d,
    }


class MarketAgent:
    name = "market"

    async def run(self, ctx: dict) -> AgentResult:
        use_fixtures = os.getenv("USE_FIXTURES", "1") != "0"
        if use_fixtures:
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
