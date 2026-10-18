"""Watch-only live view of the agent's browser. Owner B.

The agent opens the captured link in a throwaway headless Chromium on the server and tours the
pages the crawler chose. Only JPEG frames (pixels) are sent to the dashboard: no HTML, scripts or
cookies from the site reach the person's browser, and nothing they do is sent back.
"""

import asyncio
import base64
import logging
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from app.config import FIXTURES, settings
from app.fraud.crawler import USER_AGENT, Aliases
from app.fraud.net import BlockedURL, check_url_allowed

log = logging.getLogger(__name__)

VIEWPORT = {"width": 1280, "height": 800}
BLOCKED_RESOURCES = {"media", "websocket", "eventsource", "manifest", "other"}
DEMO_PREVIEWS = {"clone-demo": "brightwater.jpg", "demo": "brightwater.jpg"}
FIXTURE_PREVIEWS = {"fraud_clone.json": "brightwater.jpg"}
MAX_FRAME_BYTES = 1_500_000
FINISHED = "Finished. The browser is closed."
NO_VIEW = "No live view for this report."


@dataclass
class Hub:
    """Newest frame and caption for one job. Watchers wait on `changed`."""

    state: str = "starting"  # starting, browsing, done, unavailable
    caption: str = "Starting the agent's browser"
    url: str = ""
    frame: bytes | None = None
    seq: int = 0
    reason: str = ""
    changed: asyncio.Event = field(default_factory=asyncio.Event)

    def notify(self):
        self.changed.set()
        self.changed = asyncio.Event()

    def push(self, frame: bytes):
        if len(frame) <= MAX_FRAME_BYTES:
            self.frame, self.seq = frame, self.seq + 1
            self.notify()

    def finish(self, state: str = "done", reason: str = ""):
        self.state, self.reason = state, reason
        if state == "done":
            self.caption = FINISHED
        self.notify()


_hubs: dict[str, Hub] = {}
_tasks: set[asyncio.Task] = set()
_slots: tuple[asyncio.AbstractEventLoop, asyncio.Semaphore] | None = None


def previews_dir() -> Path:
    return settings.database.parent / "previews"


def preview_path(report_id: str) -> Path | None:
    """Saved screenshot for a job, or the demo fixture for the fixed demo ids."""
    if settings.use_fixtures and report_id in DEMO_PREVIEWS:
        return FIXTURES / "previews" / DEMO_PREVIEWS[report_id]
    if not report_id.isalnum():
        return None
    path = previews_dir() / f"{report_id}.jpg"
    return path if path.is_file() else None


def status(report_id: str) -> dict:
    hub = _hubs.get(report_id)
    if hub is not None:
        return {"state": hub.state, "caption": hub.caption, "url": hub.url, "reason": hub.reason}
    if preview_path(report_id):
        return {"state": "done", "caption": FINISHED, "url": "", "reason": ""}
    return {"state": "unavailable", "caption": "", "url": "", "reason": NO_VIEW}


def mjpeg(report_id: str):
    """Async generator of multipart JPEG parts, or None when there is no live view."""
    hub = _hubs.get(report_id)
    if hub is None:
        return None

    async def stream():
        seq = -1
        while True:
            if hub.frame is not None and hub.seq != seq:
                seq = hub.seq
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(hub.frame)}\r\n\r\n".encode()
                    + hub.frame
                    + b"\r\n"
                )
            if hub.state in ("done", "unavailable"):
                return
            changed = hub.changed
            try:
                await asyncio.wait_for(changed.wait(), 15)
            except asyncio.TimeoutError:
                pass

    return stream()


def _semaphore() -> asyncio.Semaphore:
    """At most two browsers at once, per event loop."""
    global _slots
    loop = asyncio.get_running_loop()
    if _slots is None or _slots[0] is not loop:
        _slots = (loop, asyncio.Semaphore(2))
    return _slots[1]


async def guard_route(route) -> None:
    """Abort anything that is not a plain page resource on a public (or allowlisted) host."""
    request = route.request
    if request.resource_type in BLOCKED_RESOURCES:
        await route.abort()
        return
    try:
        await check_url_allowed(request.url)
    except BlockedURL:
        await route.abort()
        return
    await route.continue_()


async def _scroll(page, seconds: float):
    """Scroll down in small steps so the viewer can follow, then back to the top."""
    steps = max(2, int(seconds / 0.5))
    height = await page.evaluate("document.documentElement.scrollHeight - innerHeight")
    down = steps * 2 // 3
    positions = [height * i / down for i in range(1, down + 1)]
    positions += [height * (1 - i / (steps - down)) for i in range(1, steps - down + 1)]
    for top in positions:
        await page.evaluate(f"window.scrollTo({{top: {int(top)}, behavior: 'smooth'}})")
        await asyncio.sleep(seconds / steps)


async def tour(report_id: str, pages: list[str], hub: Hub, playwright_api=None) -> None:
    if playwright_api is None:
        from playwright.async_api import async_playwright as playwright_api
    aliases = Aliases(settings.crawl_host_aliases)
    async with _semaphore(), playwright_api() as pw:
        browser = await pw.chromium.launch()
        try:
            context = await browser.new_context(
                viewport=VIEWPORT,
                user_agent=USER_AGENT,
                accept_downloads=False,
                java_script_enabled=True,
                service_workers="block",
            )
            await context.route("**/*", guard_route)
            page = await context.new_page()
            page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.dismiss()))
            cdp = await context.new_cdp_session(page)

            def on_frame(params):
                hub.push(base64.b64decode(params["data"]))
                asyncio.ensure_future(
                    cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
                )

            cdp.on("Page.screencastFrame", on_frame)
            await cdp.send(
                "Page.startScreencast", {"format": "jpeg", "quality": 60, "maxWidth": 1280}
            )
            hub.state = "browsing"
            saved = False
            for url in pages[: settings.live_view_max_pages]:
                path = urlsplit(url).path or "/"
                hub.url, hub.caption = url, f"Opening {path}"
                hub.notify()
                try:
                    await page.goto(aliases.fetch_url(url), wait_until="load", timeout=8000)
                except Exception as exc:
                    log.info("live view could not open %s: %s", url, exc)
                    continue
                if not saved:
                    previews_dir().mkdir(parents=True, exist_ok=True)
                    await page.screenshot(
                        path=str(previews_dir() / f"{report_id}.jpg"), type="jpeg", quality=70
                    )
                    saved = True
                hub.caption = f"Reading {path}"
                hub.notify()
                await _scroll(page, settings.live_view_seconds_per_page)
            await cdp.send("Page.stopScreencast")
        finally:
            await browser.close()


async def run_tour(report_id: str, pages: list[str], hub: Hub, playwright_api=None):
    try:
        await asyncio.wait_for(
            tour(report_id, pages, hub, playwright_api), settings.live_view_timeout_s
        )
        hub.finish("done")
    except asyncio.CancelledError:
        hub.finish("unavailable", "The live view was stopped.")
        raise
    except Exception as exc:
        log.info("live view failed: %s", exc)
        hub.finish("unavailable", "The agent's browser could not open the site.")
    finally:
        # Keep the hub briefly so late viewers still get the final frame and state.
        def forget():
            if _hubs.get(report_id) is hub:
                _hubs.pop(report_id, None)

        asyncio.get_running_loop().call_later(120, forget)


def playwright_available() -> bool:
    try:
        import playwright.async_api  # noqa: F401
    except ImportError:
        return False
    return True


async def shutdown():
    for task in list(_tasks):
        task.cancel()
    await asyncio.gather(*_tasks, return_exceptions=True)
    _hubs.clear()


class LiveBrowseStep:
    """Starts the agent's browser tour in the background and returns at once.

    The tour runs beside the report instead of inside the step graph, so watching the site never
    delays the fraud score.
    """

    name = "live_view"
    writes = ()

    async def run(self, ctx: dict) -> None:
        report_id = ctx["report_id"]
        if settings.use_fixture(self.name):
            fixture = FIXTURE_PREVIEWS.get(ctx.get("case", ""))
            if fixture:
                previews_dir().mkdir(parents=True, exist_ok=True)
                target = previews_dir() / f"{report_id}.jpg"
                shutil.copyfile(FIXTURES / "previews" / fixture, target)
            return
        visit = ctx.get("site_visit")
        if not settings.live_view_enabled or visit is None or not ctx.get("crawl_ok"):
            return
        if not playwright_available():
            log.info("live view skipped: Playwright is not installed")
            return
        pages = list(dict.fromkeys(visit.pages_visited or [visit.final_url]))
        hub = _hubs[report_id] = Hub(url=pages[0])
        task = asyncio.create_task(run_tour(report_id, pages, hub))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
