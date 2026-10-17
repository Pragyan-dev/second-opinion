"""Fixture payment checks and simulated execution only. Owner D."""

import math
from uuid import uuid4

from fastapi import HTTPException

from app.config import fixture
from app.contracts import PaymentCheck, PaymentRequest


class PaymentExecution(PaymentRequest):
    override_hold: bool = False


def check(request: PaymentRequest) -> PaymentCheck:
    if not math.isfinite(request.amount) or request.amount <= 0:
        raise HTTPException(422, "Amount must be finite and greater than zero")
    # TODO(D): compare payee and transfer history; all checks currently use the demo fixture.
    result = PaymentCheck.model_validate(fixture("payment_demo.json"))
    result.linked_report = request.report_id or result.linked_report
    return result


def execute(request: PaymentExecution):
    result = check(request)
    if result.hold_recommended and not request.override_hold:
        raise HTTPException(409, "Cooling-off hold: explicit override_hold is required")
    # TODO(D): create a Nessie demo transfer; never call a live bank in this scaffold.
    return {"transfer_id": f"mock-{uuid4().hex}"}
