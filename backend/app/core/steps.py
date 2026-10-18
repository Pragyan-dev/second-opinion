"""Small helpers shared by pipeline steps. Owner B."""

import asyncio

from pydantic import BaseModel

from app.config import fixture
from app.contracts import Signal

STEP_LABELS = {
    "extract": "Entity extraction",
    "phishing": "Phishing check",
    "crawl": "Website visit",
    "brokercheck": "Official record lookup",
    "rdap": "Domain age lookup",
    "jev": "Pressure language check",
    "contact_match": "Contact comparison",
    "scoring": "Scoring",
    "explainer": "Explanation",
}


def error_signal(step: str, detail: str) -> Signal:
    label = STEP_LABELS.get(step, step)
    return Signal(
        id=f"{step}_error",
        label=f"{label} did not finish",
        check="unknown",
        detail=f"{label} could not complete ({detail}). Other checks still ran.",
    )


def case_fixture(ctx: dict) -> dict:
    """The demo fraud report fixture chosen for this capture."""
    return fixture(ctx["case"])


def dump(value):
    """JSON-ready copy of models, lists and dicts."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [dump(item) for item in value]
    if isinstance(value, dict):
        return {key: dump(item) for key, item in value.items()}
    return value


class Deadline:
    """Shares one time budget across several awaited calls."""

    def __init__(self, seconds: float):
        self.end = asyncio.get_running_loop().time() + seconds

    def left(self, reserve: float = 0) -> float:
        return max(0.0, self.end - asyncio.get_running_loop().time() - reserve)
