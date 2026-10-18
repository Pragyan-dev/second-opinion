"""Live data agents report fractions, like the fixtures and the dashboard expect."""

import sys
import types

import pandas as pd
import pytest

from app.agents.data import history, income, market

DAYS = 252


def frame(start: float, end: float, days: int = DAYS, wobble: float = 0.0) -> pd.DataFrame:
    index = pd.bdate_range(end=pd.Timestamp.now(tz="UTC").normalize(), periods=days)
    step = (end - start) / (days - 1)
    closes = [start + step * i + (wobble if i % 2 else -wobble) for i in range(days)]
    return pd.DataFrame({"Close": closes, "Volume": [1000] * days}, index=index)


class FakeTicker:
    def __init__(self, hist: pd.DataFrame, dividends: pd.Series | None = None):
        self.hist = hist
        self.dividends = dividends if dividends is not None else pd.Series(dtype=float)
        self.fast_info = types.SimpleNamespace(last_price=float(hist["Close"].iloc[-1]))
        # yfinance 1.x reports dividendYield as a percent; the agent must not use it.
        self.info = {"dividendYield": 4.0, "dividendRate": 4.0}
        self.calendar = None

    def history(self, period: str) -> pd.DataFrame:
        days = {"1mo": 21, "3mo": 63, "1y": DAYS, "5y": DAYS}[period]
        return self.hist.iloc[-days:]


@pytest.fixture
def fake_yf(monkeypatch):
    tickers: dict[str, FakeTicker] = {}
    module = types.SimpleNamespace(Ticker=lambda symbol: tickers[symbol])
    monkeypatch.setitem(sys.modules, "yfinance", module)
    return tickers


async def test_history_returns_and_drawdown_are_fractions(fake_yf):
    hist = frame(100, 90)
    hist.iloc[100, 0] = 125  # a peak, then back down to the trend line
    fake_yf["ACME"] = FakeTicker(hist)
    data = await history._fetch_history("ACME")
    assert data["return_1y"] == pytest.approx(-0.10, abs=1e-3)
    low_after_peak = float(hist["Close"].iloc[100:].min())
    assert data["max_drawdown_1y"] == pytest.approx(low_after_peak / 125 - 1, abs=1e-3)
    assert -1 < data["max_drawdown_1y"] < 0


async def test_income_yield_comes_from_payments(fake_yf):
    hist = frame(100, 100)
    now = pd.Timestamp.now(tz="UTC")
    paid = pd.Series([1.0] * 4, index=[now - pd.DateOffset(months=m) for m in (1, 4, 7, 10)])
    fake_yf["ACME"] = FakeTicker(hist, paid)
    data = await income._fetch_income("ACME")
    assert data["yield_ttm"] == pytest.approx(0.04)
    assert data["frequency"] == "quarterly"
    assert data["price_return_1y"] == pytest.approx(0.0)
    assert data["total_return_1y"] == pytest.approx(0.04)


async def test_income_without_dividends(fake_yf):
    fake_yf["ACME"] = FakeTicker(frame(100, 120))
    fake_yf["ACME"].info = {}
    data = await income._fetch_income("ACME")
    assert data["pays_dividend"] is False and data["yield_ttm"] is None
    assert data["price_return_1y"] == pytest.approx(0.2)


async def test_market_volatility_is_a_fraction_and_move_is_daily_dollars(fake_yf):
    fake_yf["ACME"] = FakeTicker(frame(100, 100, wobble=1))  # about 2% a day
    fake_yf["SPY"] = FakeTicker(frame(400, 400, wobble=2))  # about 1% a day
    data = await market._fetch_market("ACME")
    assert 15 < data["move_per_1000_usd"] < 25
    assert 7 < data["spy_move_per_1000_usd"] < 13
    assert 0.2 < data["vol_30d"] < 0.4
    assert -1 < data["max_drawdown_1y"] <= 0


@pytest.mark.parametrize("fetch", [history._fetch_history, income._fetch_income])
async def test_unknown_symbol_is_an_error_not_zeros(fake_yf, fetch):
    fake_yf["NOPE"] = FakeTicker(frame(1, 1))
    fake_yf["NOPE"].hist = fake_yf["NOPE"].hist.iloc[:0]
    with pytest.raises(ValueError):
        await fetch("NOPE")
