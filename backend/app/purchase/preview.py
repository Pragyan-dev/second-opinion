"""Order review only. A preview never submits an order. Owner D."""

import math

from fastapi import HTTPException

from app.config import fixture, settings
from app.contracts import OrderPreview, OrderTicket
from app.purchase.robinhood_mcp import RobinhoodClient, RobinhoodUnavailable


async def _fetch_yfinance_quote(ticket: OrderTicket) -> dict:
    import yfinance as yf  # type: ignore

    info = yf.Ticker(ticket.symbol).fast_info
    return {"last_price": float(info.last_price), "name": ticket.symbol.upper()}


async def _yfinance_preview(ticket: OrderTicket) -> OrderPreview:
    """Simulated preview built from yfinance data. No Robinhood call."""
    from app.agents.data._common import run_cached

    data = await run_cached(
        f"preview_{ticket.symbol.upper()}", lambda: _fetch_yfinance_quote(ticket)
    )
    error = str(data.get("error") or "")
    if "last_price" not in data:
        price = ticket.limit_price or 0.0
        name = ticket.symbol.upper()
        source = "simulated"
    else:
        price = float(data["last_price"])
        name = str(data.get("name") or ticket.symbol.upper())
        source = "cached" if "cached copy" in error else "simulated"

    estimate_price = ticket.limit_price if ticket.order_type == "limit" else price
    return OrderPreview(
        symbol=ticket.symbol.upper(),
        name=name,
        last_price=price,
        est_total=round(ticket.quantity * estimate_price, 2),
        tradable=None,
        buying_power_ok=None,
        warnings=[
            "Simulated quote — Robinhood MCP unavailable.",
            "Any funding requires your explicit confirmation. No order has been placed.",
        ],
        data_source=source,
        status="awaiting_human",
    )


async def preview(ticket: OrderTicket) -> OrderPreview:
    if not math.isfinite(ticket.quantity) or ticket.quantity <= 0:
        raise HTTPException(422, "Shares must be finite and greater than zero")
    if ticket.order_type == "limit" and (
        ticket.limit_price is None
        or not math.isfinite(ticket.limit_price)
        or ticket.limit_price <= 0
    ):
        raise HTTPException(422, "A limit order review requires a positive limit price")

    # Try Robinhood MCP; fall back to yfinance if unavailable
    rh = RobinhoodClient()
    tradable = None
    buying_power_ok = None
    warnings: list[str] = []
    data_source = "simulated"

    try:
        quote_result = await rh.call_tool("get_equity_quotes", {"symbol": ticket.symbol})
        price = float(quote_result.get("last_trade_price", 0))
        name = quote_result.get("simple_name") or ticket.symbol.upper()

        try:
            td = await rh.call_tool("get_equity_tradability", {"symbol": ticket.symbol})
            tradable = td.get("is_tradable")
            if not tradable:
                warnings.append(f"{ticket.symbol} is not tradable on Robinhood.")
        except Exception:
            pass

        est_total = round(ticket.quantity * (ticket.limit_price or price), 2)
        try:
            portfolio = await rh.call_tool("get_portfolio", {})
            buying_power = float(portfolio.get("buying_power", 0))
            estimate_price = ticket.limit_price if ticket.order_type == "limit" else price
            est_total = round(ticket.quantity * estimate_price, 2)
            buying_power_ok = buying_power >= est_total
            if not buying_power_ok:
                warnings.append(
                    f"Buying power ${buying_power:.2f} is less than"
                    f" estimated total ${est_total:.2f}."
                )
        except Exception:
            est_total = round(ticket.quantity * (ticket.limit_price or price), 2)

        data_source = "robinhood_mcp"
        result = OrderPreview(
            symbol=ticket.symbol.upper(),
            name=name,
            last_price=price,
            est_total=est_total,
            tradable=tradable,
            buying_power_ok=buying_power_ok,
            warnings=warnings,
            data_source=data_source,
            status="awaiting_human",
        )

    except RobinhoodUnavailable:
        # Fall back to yfinance if USE_FIXTURES is off, else use cached fixture
        if settings.use_fixtures:
            result = OrderPreview.model_validate(fixture("preview_demo.json"))
            fixture_symbol = result.symbol.upper()
            result.symbol = ticket.symbol.upper()
            if result.symbol != fixture_symbol:
                result.name = f"{result.symbol} simulated stock review"
            estimate_price = (
                ticket.limit_price if ticket.order_type == "limit" else result.last_price
            )
            result.est_total = round(ticket.quantity * estimate_price, 2)
            result.data_source = "simulated"
            result.status = "awaiting_human"
        else:
            result = await _yfinance_preview(ticket)

    result.status = "awaiting_human"
    return result
