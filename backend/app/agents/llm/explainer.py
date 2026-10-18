"""Plain-language explanations for fraud reports and stock research. Owner B.

Rules: describe what was checked and what does not match the official record, never call
anything a fraud, never give buy or sell advice, and cite only sources already gathered.
"""

import json
import logging
import re

from pydantic import BaseModel

from app.config import fixture, settings
from app.contracts import AgentResult, Article, ProCon, Signal, Source
from app.core import llm, orchestrator
from app.core.steps import Deadline, case_fixture

log = logging.getLogger(__name__)

FORBIDDEN = re.compile(r"\b(buy|sell|invest now|you should invest)\b", re.IGNORECASE)
ACCUSATION = re.compile(r"\bis (a|an) (fraud|scam)\b", re.IGNORECASE)
BUDGET_S = 14
MAX_BULLETS = 3
CONTACT_LABELS = {
    "phone_match": "phone number",
    "email_domain_match": "email domain",
    "website_match": "website",
    "contact_match": "contact details",
}
DEFAULT_QUESTIONS = [
    "What independent sources confirm the company's claims?",
    "How easily could shares change hands at a fair price?",
    "How much of the coverage is independent reporting rather than press releases?",
]

FRAUD_SYSTEM = (
    "You explain the results of an automated check on an investment message for a "
    "non-expert reader. Write 2 to 3 short sentences: what was checked and what did not match. "
    "For any mismatch, say it 'does not match the official record'. Never say that anything is "
    "a fraud or a scam. Never tell the reader to buy, sell or invest. Use only the facts given."
)
PROS_CONS_SYSTEM = (
    "You list neutral points about a stock from gathered research for a non-expert reader. "
    "Give at most 3 pros and 3 cons. Each point must cite one source_url copied exactly from the "
    "list of sources provided. Never tell the reader to buy, sell or invest."
)
STOCK_SYSTEM = (
    "You summarize gathered stock research for a non-expert reader. Write a 2 to 3 sentence "
    "summary, at most 3 pros and 3 cons, and exactly 3 questions the reader could ask before "
    "deciding anything. Every pro and con must cite one source_url copied exactly from the "
    "sources provided. Use only the data given. Never tell the reader to buy, sell or invest."
)


class Bullet(BaseModel):
    text: str
    source_url: str


class ProsCons(BaseModel):
    pros: list[Bullet]
    cons: list[Bullet]


class StockSummary(BaseModel):
    summary: str
    pros: list[Bullet]
    cons: list[Bullet]
    questions: list[str]


def unsafe(text: str) -> bool:
    return bool(FORBIDDEN.search(text) or ACCUSATION.search(text))


async def guarded(call, texts_of, errors: dict | None = None, name: str = "explainer"):
    """Run an LLM call; reject and retry once on forbidden wording. None means use a template."""
    for attempt in range(2):
        try:
            result = await call()
        except llm.LLMError as exc:
            reason = f"LLM failed: {exc}"
        else:
            if not unsafe(" ".join(texts_of(result))):
                return result
            reason = "output used forbidden wording"
        log.warning("%s attempt %d rejected: %s", name, attempt + 1, reason)
        if errors is not None:
            errors[name] = reason
    return None


def keep_cited(bullets: list[Bullet], sources: dict[str, str]) -> list[ProCon]:
    """Drop bullets whose source is not among the gathered sources."""
    kept = [
        ProCon(text=b.text.strip(), source=Source(title=sources[b.source_url], url=b.source_url))
        for b in bullets
        if b.source_url in sources and b.text.strip() and not unsafe(b.text)
    ]
    return kept[:MAX_BULLETS]


UNITS_NOTE = (
    "Units: vol_30d, vol_90d, yield_ttm, return_1y, return_5y, max_drawdown_1y, price_return_1y "
    "and total_return_1y are fractions (0.05 means 5%). move_per_1000_usd and "
    "spy_move_per_1000_usd are dollars a $1,000 position moves on a typical day."
)


def section_sources(sections: dict[str, AgentResult]) -> dict[str, str]:
    return {s.url: s.title for result in sections.values() for s in result.sources}


def articles_of(sections: dict[str, AgentResult]) -> list[Article]:
    news = sections.get("news")
    if not news or news.status != "done":
        return []
    articles = []
    for item in news.data.get("items", []):
        try:
            articles.append(Article.model_validate(item))
        except ValueError:
            continue
    return articles


def fraud_template(signals: list[Signal]) -> str:
    mismatched = [
        CONTACT_LABELS[s.id] for s in signals if s.id in CONTACT_LABELS and s.check == "fail"
    ]
    checked = "We compared the message and the linked website with the official record."
    if not mismatched:
        return f"{checked} No checked detail differs from the official record."
    parts = ", ".join(mismatched[:-1]) + (" and " if len(mismatched) > 1 else "") + mismatched[-1]
    verb = "does" if len(mismatched) == 1 else "do"
    return (
        f"{checked} The {parts} {verb} not match the official record. Confirm the sender "
        "using the contact details in the official record."
    )


def facts(ctx: dict) -> str:
    lines = [f"- [{s.check}] {s.label}: {s.detail}" for s in ctx["signals"]]
    contact = ctx.get("official_contact")
    if contact:
        lines.append(f"- Official record: {contact.firm} ({contact.source.title})")
    visit = ctx.get("site_visit")
    if visit:
        lines.append(f"- Website visited: {visit.final_url}")
    band = ctx.get("band")
    if band:
        lines.append(f"- Overall concern band: {band}")
    return "\n".join(lines) or "- No checks produced results."


async def stock_pros_cons(ctx: dict, stock: dict | None, deadline: Deadline) -> tuple[list, list]:
    gathered = {s.source.url: s.source.title for s in ctx["signals"] if s.source}
    contact = ctx.get("official_contact")
    if contact:
        gathered[contact.source.url] = contact.source.title
    sections = {
        name: AgentResult.model_validate(value)
        for name, value in (stock or {}).get("sections", {}).items()
    }
    gathered.update(section_sources(sections))
    for article in articles_of(sections):
        gathered[article.url] = article.title
    data = {name: result.data for name, result in sections.items() if result.status == "done"}
    prompt = (
        f"Symbol: {ctx['entities']['tickers'][0]}\n"
        f"Research data:\n{json.dumps(data, default=str)[:8000]}\n"
        f"Fraud check findings:\n{facts(ctx)}\n"
        f"Sources (url: title):\n" + "\n".join(f"{url}: {t}" for url, t in gathered.items())
    )
    result = await guarded(
        lambda: llm.structured(prompt, ProsCons, PROS_CONS_SYSTEM, deadline.left()),
        lambda r: [b.text for b in r.pros + r.cons],
        ctx.get("errors"),
        "explainer_pros_cons",
    )
    if result is None:
        return [], []
    return keep_cited(result.pros, gathered), keep_cited(result.cons, gathered)


class ExplainerStep:
    name = "explainer"
    writes = ("explanation", "stock_research_id", "stock_pros", "stock_cons")

    async def run(self, ctx: dict) -> None:
        deadline = Deadline(BUDGET_S)
        tickers = ctx.get("entities", {}).get("tickers", [])
        ctx["stock_pros"], ctx["stock_cons"] = [], []
        ctx["stock_research_id"] = None
        if tickers:
            ctx["stock_research_id"] = await orchestrator.start_stock_job(
                tickers[0], ctx["capture"].url
            )
        if settings.use_fixture(self.name):
            report = case_fixture(ctx)
            ctx["explanation"] = report["explanation"]
            if tickers:
                ctx["stock_pros"] = [ProCon.model_validate(p) for p in report["stock_pros"]]
                ctx["stock_cons"] = [ProCon.model_validate(c) for c in report["stock_cons"]]
            return

        text = await guarded(
            lambda: llm.text(
                f"Check results:\n{facts(ctx)}", FRAUD_SYSTEM, deadline.left(reserve=6)
            ),
            lambda r: [r],
            ctx.get("errors"),
            "explainer_text",
        )
        ctx["explanation"] = text or fraud_template(ctx["signals"])
        if tickers:
            stock = await orchestrator.wait_for_sections(
                ctx["stock_research_id"], deadline.left(reserve=5)
            )
            ctx["stock_pros"], ctx["stock_cons"] = await stock_pros_cons(ctx, stock, deadline)


async def explain_stock(ctx: dict) -> dict:
    """Summary, pros, cons, questions and articles for a finished stock job."""
    sections: dict[str, AgentResult] = ctx["sections"]
    articles = articles_of(sections)
    out = {"articles": [a.model_dump(mode="json") for a in articles]}
    if settings.use_fixture("explainer"):
        demo = fixture("stock_demo.json")
        out.update({key: demo[key] for key in ("summary", "pros", "cons", "questions")})
        return out

    deadline = Deadline(BUDGET_S)
    sources = section_sources(sections)
    sources.update({a.url: a.title for a in articles})
    data = {name: r.data for name, r in sections.items() if r.status == "done" and name != "news"}
    headlines = [
        {"title": a.title, "url": a.url, "outlet": a.outlet, "press_release": a.is_press_release}
        for a in articles
    ]
    prompt = (
        f"Symbol: {ctx['symbol']}\n"
        f"Research sections:\n{json.dumps(data, default=str)[:8000]}\n"
        f"{UNITS_NOTE}\n"
        f"Articles:\n{json.dumps(headlines)[:4000]}\n"
        "Sources (url: title):\n" + "\n".join(f"{url}: {t}" for url, t in sources.items())
    )
    result = await guarded(
        lambda: llm.structured(prompt, StockSummary, STOCK_SYSTEM, deadline.left()),
        lambda r: [r.summary, *r.questions] + [b.text for b in r.pros + r.cons],
    )
    if result is None:
        out.update(
            summary=f"Research sections were gathered for {ctx['symbol']}. Review each section "
            "and its sources directly.",
            pros=[],
            cons=[],
            questions=DEFAULT_QUESTIONS,
        )
        return out
    questions = [q.strip() for q in result.questions if q.strip()][:3]
    out.update(
        summary=result.summary.strip(),
        pros=[p.model_dump(mode="json") for p in keep_cited(result.pros, sources)],
        cons=[c.model_dump(mode="json") for c in keep_cited(result.cons, sources)],
        questions=questions + DEFAULT_QUESTIONS[len(questions):],
    )
    return out
