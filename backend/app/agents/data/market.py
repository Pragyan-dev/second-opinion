"""Market data agent. Owner D."""

import os

try:
    from app.contracts import AgentResult
except ImportError:
    from pydantic import BaseModel
    from typing import Optional, Literal

    class AgentResult(BaseModel):  # type: ignore[no-redef]
        agent: str
        status: Literal["pending", "running", "done", "error"] = "done"
        data: dict = {}
        error: Optional[str] = None


async def _fetch_market(symbol: str) -> dict:
    import yfinance as yf  # type: ignore

    tick = yf.Ticker(symbol)
    info = tick.fast_info
    hist_30 = tick.history(period="1mo")
    hist_spy = yf.Ticker("SPY").history(period="1mo")

    price = float(info.last_price)
    volume = int(info.three_month_average_volume or 0)
    recent_volume = int(hist_30["Volume"].iloc[-1]) if len(hist_30) else 0

    # Volatility: dollars of typical 1-month swing per $1,000 invested
    if len(hist_30) > 1:
        monthly_std = float(hist_30["Close"].pct_change().dropna().std())
        vol_per_1k = round(monthly_std * price / price * 1000, 2)  # fraction * 1000
        vol_per_1k = round(monthly_std * 1000, 2)
    else:
        monthly_std = 0.0
        vol_per_1k = 0.0

    if len(hist_spy) > 1:
        spy_std = float(hist_spy["Close"].pct_change().dropna().std())
        spy_vol_per_1k = round(spy_std * 1000, 2)
    else:
        spy_std = 0.0
        spy_vol_per_1k = 0.0

    avg_vol_30 = int(hist_30["Volume"].mean()) if len(hist_30) else 0

    return {
        "symbol": symbol,
        "price": price,
        "volatility_per_1k": vol_per_1k,
        "spy_volatility_per_1k": spy_vol_per_1k,
        "volume": recent_volume,
        "avg_volume_30d": avg_vol_30,
        "volume_vs_avg": round(recent_volume / avg_vol_30, 2) if avg_vol_30 else None,
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
        status = "error" if error and "cached copy used" not in (error or "") else "done"
        return AgentResult(agent=self.name, status=status, data=data, error=error)
