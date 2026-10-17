"""Enforce review-only tools and explicit human funding confirmation. Owner D."""

import ast
import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main, mock
from app.contracts import FundingRequest
from app.purchase.nessie import fund
from app.purchase.robinhood_mcp import ALLOWED_TOOLS, RobinhoodClient, guard_tool

FORBIDDEN_PREFIXES = ("place_", "cancel_", "exercise_")


def test_allowlist_is_read_and_review_only():
    assert ALLOWED_TOOLS == {
        "get_equity_quotes",
        "get_equity_tradability",
        "get_portfolio",
        "review_equity_order",
        "search",
    }
    assert not any(name.startswith(FORBIDDEN_PREFIXES) for name in ALLOWED_TOOLS)


@pytest.mark.parametrize(
    "name",
    [
        "place_equity_order",
        "cancel_equity_order",
        "exercise_option",
        "unknown_tool",
        "PLACE_EQUITY_ORDER",
        " search",
    ],
)
def test_guard_rejects_forbidden_and_unknown_tools(name):
    with pytest.raises(ValueError):
        guard_tool(name)
    with pytest.raises(ValueError):
        asyncio.run(RobinhoodClient().call_tool(name, {}))


@pytest.mark.parametrize("app", [main.app, mock.app], ids=["real", "mock"])
def test_routes_have_no_execution(app):
    assert all("execute" not in route.path.lower() for route in app.routes)


@pytest.mark.parametrize("app", [main.app, mock.app], ids=["real", "mock"])
@pytest.mark.parametrize("value", [False, None, 0, 1, "true", "false", "missing"])
def test_funding_requires_literal_confirmation(app, value):
    body = {
        "customer_id": "demo",
        "from_account_id": "checking-demo",
        "to_account_id": "investment-demo",
        "amount": 8.4,
    }
    if value != "missing":
        body["human_confirmed"] = value
    with TestClient(app) as client:
        response = client.post("/v1/purchase/fund", json=body)
    assert response.status_code == 400


def test_adapter_rechecks_confirmation():
    from fastapi import HTTPException

    request = FundingRequest(
        customer_id="demo",
        from_account_id="checking-demo",
        to_account_id="investment-demo",
        amount=8.4,
        human_confirmed=False,
    )
    with pytest.raises(HTTPException) as exc:
        fund(request)
    assert exc.value.status_code == 400


@pytest.mark.parametrize("app", [main.app, mock.app], ids=["real", "mock"])
@pytest.mark.parametrize("body", ["", "[]", "null"])
def test_funding_rejects_empty_or_nonobject_body(app, body):
    with TestClient(app) as client:
        response = client.post(
            "/v1/purchase/fund", content=body, headers={"Content-Type": "application/json"}
        )
    assert response.status_code == 400


def test_no_trade_functions_or_tool_calls():
    for path in (Path(__file__).parents[1] / "app").rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                assert not node.name.startswith(FORBIDDEN_PREFIXES), path
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr == "call_tool":
                    assert isinstance(node.args[0], ast.Constant)
                    assert node.args[0].value in ALLOWED_TOOLS
