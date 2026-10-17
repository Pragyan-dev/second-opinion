"""Reef Academy dev server: static files plus one LLM route for the marine biologist.

Standard library only. Reads OPENROUTER_API_KEY and OPENROUTER_MODEL from the environment or
the repo's .env. Without a key, /api/biologist returns 503 and the page uses offline notes.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_BODY = 32_000

SYSTEM = " ".join(
    """
You are Dr. Octavia Inkwell, a warm, witty marine biologist (an octopus in a lab coat) inside an
educational game called Reef Academy. In the game every ETF is a species on a coral reef:
diversification is biodiversity, a portfolio of similar funds is a monoculture, fees are slow
pollution that clouds the water, and real market events are storms.

Explain what happened in plain words a teenager would follow. Use the reef metaphor, and name the
real finance idea it stands for once (for example "biodiversity (diversification)"). Ground every
claim in the facts you are given; quote their numbers, and do not invent new statistics. Explain
why specific species did well or badly using the real economic cause of that event.

Money values in the facts are US dollars; fee fields (avgFee, fee) are percent per year, so 0.04
means 0.04% a year.

Rules: 90 to 150 words in one or two short paragraphs, plain text, no markdown, no lists, no
headings. Never tell the player to buy or sell a specific fund and never give personal financial
advice; talk about how reefs behave, not what they should do with real money. Numbers are rounded
historical approximations.
""".split()
)

PROMPTS = {
    "storm": "The player's reef just went through a storm. Explain what happened to their reef "
    "and why, comment on their hold-or-abandon decision, and end with the one lesson this storm "
    "teaches.",
    "gauntlet": "The player's reef went through 2008, 2020 and 2022 back to back. Explain how it "
    "fared across the three storms, which species carried it in each one, and what the fees cost.",
    "fees": "The player fast-forwarded 30 calm years to see fee pollution. Explain what the fees "
    "cost versus the zero-fee twin reef and why small fees compound into big losses.",
    "ask": "The player is asking you a question about their reef. Answer it using the reef facts. "
    "If it is unrelated to reefs, investing basics or the game, steer back to the reef kindly.",
}


def load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def ask_llm(mode: str, facts: dict, question: str) -> str:
    key = os.getenv("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("no key")
    prompt = f"{PROMPTS[mode]}\n\nGame facts (JSON):\n{json.dumps(facts)[:8000]}"
    if mode == "storm" and facts.get("decision"):
        prompt += f"\n\nThe player's decision after the storm: {facts['decision']}."
    if mode == "ask":
        prompt += f"\n\nPlayer question: {question[:240]}"
    body = {
        "model": os.getenv("OPENROUTER_MODEL") or "anthropic/claude-haiku-5.5",
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        # Short persona replies: skip hidden reasoning so the budget goes to the answer.
        "reasoning": {"enabled": False},
        "max_tokens": 1200,
        "temperature": 0.7,
    }
    if os.getenv("OPENROUTER_PROVIDER_SORT", "latency"):
        body["provider"] = {"sort": os.getenv("OPENROUTER_PROVIDER_SORT", "latency")}
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("OPENROUTER_REFERER") or "http://localhost",
            "X-Title": "Reef Academy",
        },
    )
    with urllib.request.urlopen(req, timeout=18) as res:
        data = json.load(res)
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    if not text.strip():
        raise RuntimeError("empty reply")
    return text.strip()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path != "/api/biologist":
            return self.send_error(404)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_error(413)
        try:
            payload = json.loads(self.rfile.read(length))
            mode = payload.get("mode")
            if mode not in PROMPTS:
                return self.send_error(400)
            text = ask_llm(mode, payload.get("facts") or {}, str(payload.get("question") or ""))
        except (json.JSONDecodeError, AttributeError):
            return self.send_error(400)
        except (RuntimeError, urllib.error.URLError, TimeoutError, KeyError, ValueError) as exc:
            sys.stderr.write(f"biologist offline: {type(exc).__name__}: {exc}\n")
            return self.send_error(503)
        out = json.dumps({"text": text}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main() -> None:
    load_env()
    port = int(os.getenv("PORT") or os.getenv("REEF_PORT") or "5600")
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    llm = "on" if os.getenv("OPENROUTER_API_KEY") else "off (offline field notes)"
    print(f"Reef Academy on http://127.0.0.1:{port}  ·  AI biologist {llm}")
    server.serve_forever()


if __name__ == "__main__":
    main()
