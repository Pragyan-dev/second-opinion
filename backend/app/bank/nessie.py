"""Offline Nessie adapter stub. Owner D."""

from app.config import fixture


def summary(customer_id: str):
    # TODO(D): call Nessie when configured; retain fixture fallback on missing keys.
    result = fixture("bank_summary_demo.json")
    result["customer"]["id"] = customer_id
    return result
