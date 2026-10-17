"""Agent interface shared by B and D."""

from typing import Protocol

from app.contracts import AgentResult


class Agent(Protocol):
    name: str

    async def run(self, ctx: dict) -> AgentResult: ...
