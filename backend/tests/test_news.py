"""News agent with mocked Brave and Tavily searches."""

import json

import httpx
import pytest

from app.agents.llm import news
from app.config import settings

pytestmark = pytest.mark.respx(assert_all_called=False)

BRAVE = {
    "results": [
        {
            "title": "ACME beats estimates",
            "url": "https://www.reuters.test/acme-1",
            "description": "Quarterly results.",
            "page_age": "2026-10-15T10:00:00",
            "meta_url": {"hostname": "www.reuters.test"},
        },
        {
            "title": "Acme Corp announces partnership",
            "url": "https://www.prnewswire.com/news/acme-2",
            "description": "Press release.",
            "page_age": "2026-10-16T10:00:00",
            "meta_url": {"hostname": "www.prnewswire.com"},
        },
    ]
}


@pytest.fixture
def brave(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "search_provider", "brave")
    monkeypatch.setattr(settings, "search_api_key", "key")


async def test_brave_with_llm_relevance(respx_mock, brave, fake_llm):
    route = respx_mock.get(news.BRAVE_URL).mock(return_value=httpx.Response(200, json=BRAVE))
    fake_llm([json.dumps({"scores": [0.9, 0.4]})])
    result = await news.NewsAgent().run({"symbol": "acme", "company_name": "Acme Corp"})
    assert result.status == "done"
    assert route.call_count == 2
    assert route.calls[0].request.headers["x-subscription-token"] == "key"
    assert route.calls[0].request.url.params["freshness"] == "pm"
    items = result.data["items"]
    titles = [i["title"] for i in items]
    assert titles == ["Acme Corp announces partnership", "ACME beats estimates"]
    assert items[0]["is_press_release"] and not items[1]["is_press_release"]
    assert items[0]["relevance"] == 0.4 and items[1]["relevance"] == 0.9
    assert result.data["press_release_share"] == 0.5
    # Cached for the next call.
    again = await news.NewsAgent().run({"symbol": "ACME", "company_name": "Acme Corp"})
    assert again.data["items"] == items and route.call_count == 2


async def test_keyword_relevance_when_llm_fails(respx_mock, brave):
    respx_mock.get(news.BRAVE_URL).mock(return_value=httpx.Response(200, json=BRAVE))
    result = await news.NewsAgent().run({"symbol": "ACME"})
    scores = {i["title"]: i["relevance"] for i in result.data["items"]}
    assert scores["ACME beats estimates"] == 1.0


async def test_tavily(respx_mock, monkeypatch, fake_llm):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(settings, "search_provider", "tavily")
    monkeypatch.setattr(settings, "search_api_key", "tv")
    route = respx_mock.post(news.TAVILY_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "BRWT halted",
                        "url": "https://www.globenewswire.com/x",
                        "content": "c",
                        "published_date": "2026-10-10",
                    }
                ]
            },
        )
    )
    fake_llm([json.dumps({"scores": [1]})])
    result = await news.NewsAgent().run({"symbol": "BRWT"})
    body = json.loads(route.calls[0].request.content)
    assert body["topic"] == "news" and body["days"] == 30
    assert result.data["items"][0]["is_press_release"] is True


async def test_live_failure_never_falls_back_to_demo_articles(respx_mock, brave):
    respx_mock.get(news.BRAVE_URL).mock(return_value=httpx.Response(500))
    for symbol in ("BRWT", "ZZZZ"):
        result = await news.NewsAgent().run({"symbol": symbol})
        assert result.status == "error" and not result.data.get("items")


async def test_fixture_mode():
    result = await news.NewsAgent().run({"symbol": "BRWT"})
    assert result.agent == "news" and result.data["press_release_share"] == 0.78
