"""Every stock adapter follows the same explicit fixture setting as the fraud pipeline."""

from unittest.mock import AsyncMock

import pytest

from app.agents.data import _common
from app.agents.data.history import HistoryAgent
from app.agents.data.income import IncomeAgent
from app.agents.data.market import MarketAgent
from app.agents.data.red_flags import RedFlagsAgent
from app.config import settings


@pytest.mark.parametrize("agent_type", [MarketAgent, HistoryAgent, IncomeAgent, RedFlagsAgent])
async def test_live_adapter_does_not_fall_back_to_demo_data(monkeypatch, agent_type):
    monkeypatch.setattr(settings, "use_fixtures", False)
    fetch = AsyncMock(return_value={"source": "live-provider"})
    monkeypatch.setattr(_common, "run_cached", fetch)
    result = await agent_type().run({"symbol": "TROW"})
    fetch.assert_awaited_once()
    assert result.data == {"source": "live-provider"}
