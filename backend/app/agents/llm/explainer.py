"""Plain-language explanations. Owner B."""

from app.config import fixture
from app.core.steps import case_fixture


class ExplainerStep:
    name = "explainer"
    writes = ("explanation", "stock_research_id", "stock_pros", "stock_cons")

    async def run(self, ctx: dict) -> None:
        report = case_fixture(ctx)
        for key in self.writes:
            ctx[key] = report[key]
        ctx["stock_research_id"] = None


async def explain_stock(ctx: dict) -> dict:
    demo = fixture("stock_demo.json")
    news = ctx["sections"].get("news")
    articles = news.data.get("items", []) if news and news.status == "done" else []
    return {
        "summary": demo["summary"],
        "articles": articles,
        "pros": demo["pros"],
        "cons": demo["cons"],
        "questions": demo["questions"],
    }
