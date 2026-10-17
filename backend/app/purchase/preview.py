"""Order review only. A preview never submits an order. Owner D."""

import math

from fastapi import HTTPException

from app.config import fixture
from app.contracts import OrderPreview, OrderTicket
from app.purchase.robinhood_mcp import RobinhoodClient, RobinhoodUnavailable


async def preview(ticket: OrderTicket) -> OrderPreview:
    if not math.isfinite(ticket.quantity) or ticket.quantity <= 0:
        raise HTTPException(422, "Shares must be finite and greater than zero")
    if ticket.order_type == "limit" and (
        ticket.limit_price is None
        or not math.isfinite(ticket.limit_price)
        or ticket.limit_price <= 0
    ):
        raise HTTPException(422, "A limit order review requires a positive limit price")
    try:
        await RobinhoodClient().call_tool("get_equity_quotes", {"symbol": ticket.symbol})
    except RobinhoodUnavailable:
        pass
    # TODO(D): map allowed quote/review results; fall back to cached or yfinance data.
    # The only fallback in this PR is a local cached fixture, always labeled simulated.
    result = OrderPreview.model_validate(fixture("preview_demo.json"))
    result.symbol = ticket.symbol.upper()
    if result.symbol != "BRWT":
        result.name = f"{result.symbol} simulated stock review"
    estimate_price = ticket.limit_price if ticket.order_type == "limit" else result.last_price
    result.est_total = round(ticket.quantity * estimate_price, 2)
    result.status = "awaiting_human"
    result.data_source = "simulated"
    return result
