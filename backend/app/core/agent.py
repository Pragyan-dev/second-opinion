"""Agent and step interfaces shared by B and D."""

from typing import Protocol

from app.contracts import AgentResult


class Agent(Protocol):
    """Stock research agent: returns one report section."""

    name: str

    async def run(self, ctx: dict) -> AgentResult: ...


class Step(Protocol):
    """Fraud pipeline step: reads and writes ctx keys and appends Signals to ctx["signals"].

    `writes` lists the ctx keys that are copied into the FraudReport after the step runs.
    """

    name: str
    writes: tuple[str, ...]

    async def run(self, ctx: dict) -> None: ...
