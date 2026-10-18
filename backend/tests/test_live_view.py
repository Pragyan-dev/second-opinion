"""Watch-only live view: frame hub, MJPEG stream, request guard, step, and routes."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main
from app.config import fixture, settings
from app.contracts import Capture, SiteVisit
from app.fraud import live_browser, net


@pytest.fixture(autouse=True)
def clean_hubs():
    live_browser._hubs.clear()
    yield
    live_browser._hubs.clear()


async def test_mjpeg_streams_newest_frames_until_done():
    hub = live_browser._hubs["job1"] = live_browser.Hub()
    stream = live_browser.mjpeg("job1")
    parts = []

    async def read():
        async for part in stream:
            parts.append(part)

    reader = asyncio.create_task(read())
    await asyncio.sleep(0)
    hub.push(b"JPEG-1")
    await asyncio.sleep(0.01)
    hub.push(b"JPEG-2")
    hub.push(b"JPEG-3")  # only the newest frame matters
    await asyncio.sleep(0.01)
    hub.finish()
    await asyncio.wait_for(reader, 1)
    assert parts[0].startswith(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: 6")
    assert parts[0].endswith(b"JPEG-1\r\n") and parts[-1].endswith(b"JPEG-3\r\n")
    assert not any(b"JPEG-2" in p for p in parts)
    assert live_browser.mjpeg("missing") is None


class FakeRoute:
    def __init__(self, url, resource_type="document"):
        self.request = SimpleNamespace(url=url, resource_type=resource_type)
        self.result = None

    async def abort(self):
        self.result = "abort"

    async def continue_(self):
        self.result = "continue"


async def test_guard_blocks_private_hosts_and_media(monkeypatch):
    async def resolve(host):
        return {"public.test": ["93.184.216.34"], "inside.test": ["10.1.2.3"]}[host]

    monkeypatch.setattr(net, "resolve", resolve)
    cases = [
        (FakeRoute("https://public.test/style.css", "stylesheet"), "continue"),
        (FakeRoute("http://127.0.0.1:5500/", "document"), "continue"),  # demo allowlist
        (FakeRoute("https://inside.test/admin"), "abort"),
        (FakeRoute("http://169.254.169.254/latest"), "abort"),
        (FakeRoute("https://public.test/video.mp4", "media"), "abort"),
        (FakeRoute("wss://public.test/socket", "websocket"), "abort"),
        (FakeRoute("file:///etc/passwd"), "abort"),
    ]
    for route, expected in cases:
        await live_browser.guard_route(route)
        assert route.result == expected, route.request.url


def ctx_for(case="fraud_clone.json", pages=("https://brightwater-capital.example/",)):
    visit = SiteVisit(start_url=pages[0], final_url=pages[0], pages_visited=list(pages))
    return {
        "report_id": "abc123",
        "case": case,
        "capture": Capture.model_validate(fixture("captures/email_brightwater.json")),
        "site_visit": visit,
        "crawl_ok": True,
        "signals": [],
        "errors": {},
    }


async def test_fixture_mode_copies_demo_preview():
    await live_browser.LiveBrowseStep().run(ctx_for())
    assert live_browser.preview_path("abc123").read_bytes()[:2] == b"\xff\xd8"  # JPEG
    assert live_browser.status("abc123")["state"] == "done"
    await live_browser.LiveBrowseStep().run({**ctx_for("fraud_real.json"), "report_id": "def456"})
    assert live_browser.preview_path("def456") is None
    assert live_browser.status("def456")["state"] == "unavailable"


async def test_live_mode_without_playwright_is_quiet(monkeypatch):
    monkeypatch.setattr(settings, "use_fixtures", False)
    monkeypatch.setattr(live_browser, "playwright_available", lambda: False)
    ctx = ctx_for()
    await live_browser.LiveBrowseStep().run(ctx)
    assert ctx["signals"] == [] and live_browser.status("abc123")["state"] == "unavailable"


class FakeCDP:
    def __init__(self):
        self.handlers, self.sent = {}, []

    def on(self, event, handler):
        self.handlers[event] = handler

    async def send(self, method, params=None):
        self.sent.append(method)
        if method == "Page.startScreencast":
            self.handlers["Page.screencastFrame"]({"data": "SlBFRy1B", "sessionId": 1})


class FakePage:
    def __init__(self, visited):
        self.visited = visited

    def on(self, event, handler):
        pass

    async def goto(self, url, **kwargs):
        if "broken" in url:
            raise RuntimeError("net::ERR_FAILED")
        self.visited.append(url)

    async def screenshot(self, path, **kwargs):
        with open(path, "wb") as f:
            f.write(b"\xff\xd8fake")

    async def evaluate(self, script):
        return 1000


class FakeContext:
    def __init__(self, visited, cdp):
        self.visited, self.cdp, self.routes = visited, cdp, []

    async def route(self, pattern, handler):
        self.routes.append(handler)

    async def new_page(self):
        return FakePage(self.visited)

    async def new_cdp_session(self, page):
        return self.cdp


def fake_playwright(visited, cdp, options):
    class Browser:
        async def new_context(self, **kwargs):
            options.update(kwargs)
            return FakeContext(visited, cdp)

        async def close(self):
            visited.append("closed")

    class Chromium:
        async def launch(self):
            return Browser()

    class Manager:
        async def __aenter__(self):
            return SimpleNamespace(chromium=Chromium())

        async def __aexit__(self, *exc):
            return False

    return Manager


async def test_tour_uses_alias_streams_frames_and_saves_preview(monkeypatch):
    monkeypatch.setattr(settings, "live_view_seconds_per_page", 0.01)
    visited, cdp, options = [], FakeCDP(), {}
    hub = live_browser._hubs["abc123"] = live_browser.Hub()
    pages = [
        "https://brightwater-capital.example/",
        "https://brightwater-capital.example/broken",
        "https://brightwater-capital.example/contact",
    ]
    await live_browser.run_tour("abc123", pages, hub, fake_playwright(visited, cdp, options))
    assert visited == ["http://127.0.0.1:5500/", "http://127.0.0.1:5500/contact", "closed"]
    assert options["accept_downloads"] is False and options["service_workers"] == "block"
    assert hub.frame == b"JPEG-A" and hub.state == "done"
    assert "Page.screencastFrameAck" in cdp.sent and "Page.stopScreencast" in cdp.sent
    assert live_browser.preview_path("abc123").read_bytes() == b"\xff\xd8fake"
    assert live_browser.status("abc123")["state"] == "done"


async def test_tour_failure_marks_unavailable():
    class Broken:
        async def __aenter__(self):
            raise RuntimeError("no browser")

        async def __aexit__(self, *exc):
            return False

    hub = live_browser._hubs["abc123"] = live_browser.Hub()
    await live_browser.run_tour("abc123", ["https://x.test/"], hub, Broken)
    assert hub.state == "unavailable" and "could not open" in hub.reason


def test_routes():
    with TestClient(main.app) as client:
        image = client.get("/v1/fraud/clone-demo/preview.jpg")
        assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
        assert image.headers["cache-control"] == "no-store"
        assert client.get("/v1/fraud/nothing/preview.jpg").status_code == 404
        assert client.get("/v1/fraud/..%2F..%2Fetc/preview.jpg").status_code == 404
        assert client.get("/v1/fraud/nothing/live.mjpg").status_code == 404
        assert client.get("/v1/fraud/nothing/live.json").json()["state"] == "unavailable"
        assert client.get("/v1/fraud/clone-demo/live.json").json()["state"] == "done"
