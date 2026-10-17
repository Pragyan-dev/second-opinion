"""Red-flags data agent: exchange, OTC tier, SEC suspension, name change. Owner D."""

import json
import os
import time
from pathlib import Path

try:
    from app.contracts import AgentResult, Source
except ImportError:
    from pydantic import BaseModel
    from typing import Optional, Literal

    class Source(BaseModel):  # type: ignore[no-redef]
        title: str
        url: str

    class AgentResult(BaseModel):  # type: ignore[no-redef]
        agent: str
        status: Literal["pending", "running", "done", "error"] = "done"
        data: dict = {}
        sources: list = []
        error: Optional[str] = None


_SEC_SUSPENSION_URL = (
    "https://www.sec.gov/litigation/suspensions.shtml"
)
_OTC_MARKETS_URL = "https://www.otcmarkets.com/filing/json/getIssuerInfo"

_CACHE_DIR = Path(__file__).resolve().parents[4] / ".agent_cache"
_CACHE_DIR.mkdir(exist_ok=True)
_SEC_CACHE = _CACHE_DIR / "sec_suspensions.json"
_OTC_CACHE = _CACHE_DIR / "otc_tiers.json"
_CACHE_TTL = 3600 * 6  # 6 hours


def _load_json_cache(path: Path) -> dict | None:
    if path.exists() and (time.time() - path.stat().st_mtime) < _CACHE_TTL:
        try:
            return json.loads(path.read_text())
        except Exception:
            return None
    return None


def _save_json_cache(path: Path, data: dict) -> None:
    try:
        path.write_text(json.dumps(data))
    except Exception:
        pass


async def _get_sec_suspensions() -> set[str]:
    """Return a set of uppercased tickers the SEC has suspended trading in."""
    cached = _load_json_cache(_SEC_CACHE)
    if cached:
        return set(cached.get("tickers", []))
    try:
        import httpx  # type: ignore

        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(_SEC_SUSPENSION_URL, follow_redirects=True)
            text = resp.text
        # Extract tickers from the HTML — they appear in parentheses after the company name
        import re
        tickers = set(re.findall(r"\(([A-Z]{1,5})\)", text))
        _save_json_cache(_SEC_CACHE, {"tickers": list(tickers)})
        return tickers
    except Exception:
        return set()


async def _get_otc_info(symbol: str) -> dict:
    cache_path = _CACHE_DIR / f"otc_{symbol}.json"
    cached = _load_json_cache(cache_path)
    if cached:
        return cached
    try:
        import httpx  # type: ignore

        url = f"https://www.otcmarkets.com/filing/json/getIssuerInfo?symbol={symbol}"
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "SecondOpinion/1.0"}) as client:
            resp = await client.get(url, follow_redirects=True)
            if resp.status_code == 200:
                data = resp.json()
                _save_json_cache(cache_path, data)
                return data
    except Exception:
        pass
    return {}


async def _fetch_red_flags(symbol: str) -> dict:
    import yfinance as yf  # type: ignore

    tick = yf.Ticker(symbol)
    info = tick.info

    exchange = info.get("exchange", "unknown")
    previous_names = info.get("previousNames", [])
    recent_name_change = bool(previous_names)

    otc_info = await _get_otc_info(symbol)
    otc_tier = otc_info.get("tierCode") or otc_info.get("tierName") or "unknown"
    caveat_emptor = bool(otc_info.get("caveatEmptor", False))

    suspensions = await _get_sec_suspensions()
    sec_suspension = symbol.upper() in suspensions

    return {
        "exchange": exchange,
        "otc_tier": otc_tier,
        "caveat_emptor": caveat_emptor,
        "sec_suspension": sec_suspension,
        "recent_name_change": recent_name_change,
    }


class RedFlagsAgent:
    name = "red_flags"

    async def run(self, ctx: dict) -> AgentResult:
        use_fixtures = os.getenv("USE_FIXTURES", "1") != "0"
        if use_fixtures:
            from app.config import fixture
            return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])

        symbol = ctx.get("symbol", "")
        if not symbol:
            return AgentResult(agent=self.name, status="error", error="no symbol")

        from app.agents.data._common import run_cached

        data = await run_cached(f"red_flags_{symbol}", lambda: _fetch_red_flags(symbol))
        error = data.pop("error", None)
        status = "error" if error and "cached copy" not in (error or "") else "done"
        sources = [
            Source(title="SEC Trading Suspensions", url=_SEC_SUSPENSION_URL),
            Source(title="OTC Markets", url=f"https://www.otcmarkets.com/stock/{symbol}/company-info"),
        ]
        return AgentResult(agent=self.name, status=status, data=data, sources=sources, error=error)
