"""Order review only. A preview never submits an order. Owner D."""

import math

from fastapi import HTTPException

from app.contracts import OrderPreview, OrderTicket

MOCK_QUOTES = {
    "AAPL": {"name": "Apple", "last_price": 227.50, "tradable": True},
    "MSFT": {"name": "Microsoft", "last_price": 418.20, "tradable": True},
    "GOOGL": {"name": "Alphabet", "last_price": 172.40, "tradable": True},
    "AMZN": {"name": "Amazon", "last_price": 198.15, "tradable": True},
    "NVDA": {"name": "NVIDIA", "last_price": 131.80, "tradable": True},
    "META": {"name": "Meta", "last_price": 582.30, "tradable": True},
    "TSLA": {"name": "Tesla", "last_price": 248.60, "tradable": True},
    "JPM": {"name": "JPMorgan Chase", "last_price": 224.10, "tradable": True},
    "V": {"name": "Visa", "last_price": 312.75, "tradable": True},
    "JNJ": {"name": "Johnson & Johnson", "last_price": 163.40, "tradable": True},
    "WMT": {"name": "Walmart", "last_price": 81.25, "tradable": True},
    "PG": {"name": "Procter & Gamble", "last_price": 168.90, "tradable": True},
    "XOM": {"name": "Exxon Mobil", "last_price": 118.55, "tradable": True},
    "UNH": {"name": "UnitedHealth", "last_price": 542.00, "tradable": True},
    "HD": {"name": "Home Depot", "last_price": 396.40, "tradable": True},
    "BAC": {"name": "Bank of America", "last_price": 42.15, "tradable": True},
    "KO": {"name": "Coca-Cola", "last_price": 68.30, "tradable": True},
    "DIS": {"name": "Disney", "last_price": 96.70, "tradable": True},
    "NFLX": {"name": "Netflix", "last_price": 715.25, "tradable": True},
    "BRWT": {"name": "BRWT fictional demonstration stock", "last_price": 0.84, "tradable": False},
    "ZORB": {"name": "Zorblat Noodle Works", "last_price": 3.14, "tradable": True},
    "MEEP": {"name": "Meep Meep Mining Co", "last_price": 0.42, "tradable": True},
    "BLUB": {"name": "Blubbersoft Cloud Fish", "last_price": 88.88, "tradable": True},
    "QXZQ": {"name": "Quixquiz Quantum Pickles", "last_price": 12.07, "tradable": False},
    "SNRK": {"name": "Snorkel Hat Industries", "last_price": 6.66, "tradable": True},
}


async def preview(ticket: OrderTicket) -> OrderPreview:
    if not math.isfinite(ticket.quantity) or ticket.quantity <= 0:
        raise HTTPException(422, "Shares must be finite and greater than zero")
    if ticket.order_type == "limit" and (
        ticket.limit_price is None
        or not math.isfinite(ticket.limit_price)
        or ticket.limit_price <= 0
    ):
        raise HTTPException(422, "A limit order review requires a positive limit price")

    symbol = ticket.symbol.upper()
    quote = MOCK_QUOTES.get(
        symbol,
        {"name": f"{symbol} simulated stock review", "last_price": 10.0, "tradable": True},
    )
    price = quote["last_price"]
    estimate_price = ticket.limit_price if ticket.order_type == "limit" else price
    warnings = ["Simulated quote. No order has been placed."]
    if not quote["tradable"]:
        warnings.append(f"{symbol} is not tradable in this demo.")
    return OrderPreview(
        symbol=symbol,
        name=quote["name"],
        last_price=price,
        est_total=round(ticket.quantity * estimate_price, 2),
        tradable=quote["tradable"],
        buying_power_ok=True,
        warnings=warnings,
        data_source="simulated",
        status="awaiting_human",
    )
