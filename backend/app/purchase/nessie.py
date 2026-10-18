"""Nessie (Capital One sandbox) funding adapter. Owner D."""

import json
import math
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, Request

from app.contracts import FundingRequest

_FIXTURES_NESSIE = Path(__file__).resolve().parents[3] / "contracts" / "fixtures" / "nessie"


async def require_human_confirmation(request: Request):
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, "Explicit human_confirmed: true is required") from None
    if not isinstance(body, dict) or body.get("human_confirmed") is not True:
        raise HTTPException(400, "Explicit human_confirmed: true is required")


def fund(request: FundingRequest) -> dict:
    if request.human_confirmed is not True:
        raise HTTPException(400, "Explicit human_confirmed: true is required")
    if not math.isfinite(request.amount) or request.amount <= 0:
        raise HTTPException(422, "Funding amount must be finite and greater than zero")

    from app.config import settings

    if settings.funding_offline:
        return _offline_transfer(request)

    return _nessie_transfer(request)


def _offline_transfer(request: FundingRequest) -> dict:
    """Return a cached fixture transfer id without a network call."""
    cached = _FIXTURES_NESSIE / "transfer.json"
    if cached.exists():
        try:
            data = json.loads(cached.read_text())
            created = data.get("objectCreated")
            if not isinstance(created, dict):
                created = {}
            transfer_id = data.get("_id") or created.get("_id") or f"offline-{uuid4().hex}"
            return {"transfer_id": transfer_id}
        except Exception:
            pass
    return {"transfer_id": f"offline-{uuid4().hex}"}


def _nessie_transfer(request: FundingRequest) -> dict:
    """Create a real Nessie sandbox transfer from checking to brokerage account."""
    import httpx  # type: ignore

    from app.config import settings

    api_key = settings.nessie_api_key
    if not api_key:
        raise HTTPException(503, "Nessie API key not configured")

    # The live sandbox rejects `medium` and `payee_id` as unknown fields.
    payload = {
        "amount": request.amount,
        "description": f"Second Opinion demo transfer to {request.to_account_id}",
        "transaction_date": _today(),
        "status": "pending",
    }
    url = f"https://api.nessieisreal.com/accounts/{request.from_account_id}/transfers?key={api_key}"

    try:
        resp = httpx.post(url, json=payload, timeout=10)
    except Exception:
        return _offline_transfer(request)

    if resp.status_code not in (200, 201):
        raise HTTPException(502, f"Nessie error {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    transfer_id = (
        data.get("objectCreated", {}).get("_id") or data.get("_id") or f"nessie-{uuid4().hex}"
    )

    # Cache the response for offline replay
    _FIXTURES_NESSIE.mkdir(parents=True, exist_ok=True)
    (_FIXTURES_NESSIE / "transfer.json").write_text(json.dumps(data, indent=2))

    return {"transfer_id": transfer_id}


def _today() -> str:
    import datetime
    return datetime.date.today().isoformat()
