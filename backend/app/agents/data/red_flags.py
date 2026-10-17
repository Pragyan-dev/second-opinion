"""Red_Flags fixture stub. Owner D."""

from app.config import fixture
from app.contracts import AgentResult


class RedFlagsAgent:
    name = "red_flags"

    async def run(self, ctx: dict) -> AgentResult:
        # TODO(D): load red_flags for ctx["symbol"]; keep deterministic fixture mode.
        return AgentResult.model_validate(fixture("stock_demo.json")["sections"][self.name])
