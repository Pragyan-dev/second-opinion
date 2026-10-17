"""Offline Nessie funding adapter stub. Owner D."""

import math
from uuid import uuid4

from fastapi import HTTPException, Request

from app.contracts import FundingRequest


async def require_human_confirmation(request: Request):
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, "Explicit human_confirmed: true is required") from None
    if not isinstance(body, dict) or body.get("human_confirmed") is not True:
        raise HTTPException(400, "Explicit human_confirmed: true is required")


def fund(request: FundingRequest):
    if request.human_confirmed is not True:
        raise HTTPException(400, "Explicit human_confirmed: true is required")
    if not math.isfinite(request.amount) or request.amount <= 0:
        raise HTTPException(422, "Funding amount must be finite and greater than zero")
    # TODO(D): create a Nessie demo transfer only after explicit human confirmation.
    # This stub has no network calls and does not move funds or submit an order.
    return {"transfer_id": f"mock-{uuid4().hex}"}
