# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The browser of an application's computer (LOOP R-23).

When its permissions turn *browse* on, its agent opens pages in a headless
Chromium that runs in the runtime's own container — the image installs the
distribution's ``chromium`` — one browser per agent, started on its first
page and kept until the runtime stops.

It is driven over the DevTools protocol, with nothing between: Playwright
publishes no build for the runtime image's Alpine (musl), and what is asked
of it is little — open a page, read its text, take a screenshot, click or
type where a selector says, and, for a person who took the computer over,
click where they clicked on that screenshot and type what they typed.

What it may reach: the web, never the runtime's own network. A page on a
private, loopback or link-local address — the runtime's routes, its Jupyter
sidecar, the cluster's services, the cloud's metadata — is refused, whether
asked for, followed from a link or fetched by the page itself (every request
is checked through the protocol's ``Fetch`` domain). A laptop's runtime,
whose pages are its own, lets them through with
``AGENT_RUNTIMES_BROWSER_PRIVATE=allow``.
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import logging
import os
import shutil
import socket
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Protocol
from urllib.parse import urlsplit

from agent_runtimes.loop.apps.computer import ComputerRefused

logger = logging.getLogger(__name__)

#: The browser to run, when it is not found on the path.
BROWSER_ENV = "AGENT_RUNTIMES_BROWSER"

#: ``allow`` lets its pages reach private addresses: a laptop's runtime only.
PRIVATE_ENV = "AGENT_RUNTIMES_BROWSER_PRIVATE"

#: What is looked for on the path, in order.
CANDIDATES = ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable")

#: The page's size, in CSS pixels: a screenshot's pixels are the page's.
WIDTH, HEIGHT = 1280, 800

#: How long a page is waited for, and the browser to start, in seconds.
LOAD_TIMEOUT = 30.0
START_TIMEOUT = 20.0

#: The most of a page's text an agent is told.
TEXT_LIMIT = 60_000

#: The keys a person may press on a page they took over.
KEYS: Dict[str, tuple[str, int, str]] = {
    "Enter": ("Enter", 13, "\r"),
    "Tab": ("Tab", 9, ""),
    "Backspace": ("Backspace", 8, ""),
    "Escape": ("Escape", 27, ""),
    "ArrowUp": ("ArrowUp", 38, ""),
    "ArrowDown": ("ArrowDown", 40, ""),
    "ArrowLeft": ("ArrowLeft", 37, ""),
    "ArrowRight": ("ArrowRight", 39, ""),
    "PageUp": ("PageUp", 33, ""),
    "PageDown": ("PageDown", 34, ""),
}


class BrowserFailed(RuntimeError):
    """The browser answered with an error."""


@dataclass(frozen=True)
class PageSeen:
    """A page as its browser has it."""

    url: str
    title: str
    text: str = ""

    def describe(self) -> Dict[str, str]:
        """Say it as the routes do."""
        return {"url": self.url, "title": self.title}


class Browser(Protocol):
    """What a browser of a computer does."""

    async def open(self, url: str) -> PageSeen:
        """Open a page and wait for it."""
        ...

    async def read(self) -> PageSeen:
        """The page open now: its address, its title, its text."""
        ...

    async def screenshot(self) -> bytes:
        """The page as it shows, a PNG of ``WIDTH`` by ``HEIGHT``."""
        ...

    async def click(self, selector: str) -> PageSeen:
        """Click what a CSS selector finds."""
        ...

    async def type(self, selector: str, text: str, submit: bool = False) -> PageSeen:
        """Type in what a CSS selector finds; Enter after it to submit."""
        ...

    async def click_at(self, x: float, y: float) -> PageSeen:
        """Click at a point of the page."""
        ...

    async def type_text(self, text: str) -> PageSeen:
        """Type where the page's focus is."""
        ...

    async def press(self, key: str) -> PageSeen:
        """Press one of ``KEYS``."""
        ...

    async def scroll(self, dy: float) -> PageSeen:
        """Scroll the page by ``dy`` pixels."""
        ...

    @property
    def alive(self) -> bool:
        """Whether it still runs."""
        ...

    async def close(self) -> None:
        """Stop it."""
        ...


# --- what it may reach ----------------------------------------------------------------


Resolver = Callable[[str], Awaitable[List[str]]]


async def _resolve(host: str) -> List[str]:
    """The addresses a host name resolves to."""
    loop = asyncio.get_running_loop()
    found = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [str(item[4][0]) for item in found]


def _private(address: str) -> bool:
    """Whether an address is the runtime's own network, not the web."""
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip.is_multicast


def private_allowed() -> bool:
    """Whether its pages may reach private addresses (a laptop's runtime)."""
    return os.environ.get(PRIVATE_ENV, "").strip().lower() == "allow"


async def refusal_of(
    url: str, *, private: bool = False, resolve: Optional[Resolver] = None
) -> str:
    """Why the browser may not reach an address, or ``""`` when it may."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return f"{url} is not a web page: give an http or https address."
    host = (parts.hostname or "").strip("[]")
    if not host:
        return f"{url} names no host."
    if private:
        return ""
    try:
        addresses = [host] if _is_address(host) else await (resolve or _resolve)(host)
    except OSError:
        return f"{host} could not be found."
    if not addresses or any(_private(address) for address in addresses):
        return (
            f"{host} is on a private network: its computer's browser opens "
            "pages of the web only."
        )
    return ""


def _is_address(host: str) -> bool:
    try:
        ipaddress.ip_address(host.split("%", 1)[0])
    except ValueError:
        return False
    return True


# --- the DevTools protocol ------------------------------------------------------------


class _Connection:
    """One DevTools connection: commands answered by id, events by name."""

    def __init__(self, socket_: Any) -> None:
        self._socket = socket_
        self._next = 0
        self._waiting: Dict[int, asyncio.Future] = {}
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], None]]] = {}
        self._reader = asyncio.create_task(self._read())

    async def _read(self) -> None:
        try:
            async for message in self._socket:
                data = json.loads(message)
                if "id" in data:
                    waiting = self._waiting.pop(data["id"], None)
                    if waiting is None or waiting.done():
                        continue
                    if "error" in data:
                        waiting.set_exception(
                            BrowserFailed(str(data["error"].get("message", data)))
                        )
                    else:
                        waiting.set_result(data.get("result", {}))
                    continue
                for handler in self._handlers.get(data.get("method", ""), []):
                    handler(data.get("params", {}))
        except Exception as error:  # the socket closed, the browser died
            logger.debug("The browser's connection ended: %s", error)
        finally:
            for waiting in self._waiting.values():
                if not waiting.done():
                    waiting.set_exception(BrowserFailed("The browser stopped."))
            self._waiting.clear()

    @property
    def open(self) -> bool:
        return not self._reader.done()

    def on(self, method: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        self._handlers.setdefault(method, []).append(handler)

    async def send(
        self,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        timeout: float = LOAD_TIMEOUT,
    ) -> Dict[str, Any]:
        if not self.open:
            raise BrowserFailed("The browser stopped.")
        self._next += 1
        ident = self._next
        waiting: asyncio.Future = asyncio.get_running_loop().create_future()
        self._waiting[ident] = waiting
        await self._socket.send(
            json.dumps({"id": ident, "method": method, "params": params or {}})
        )
        try:
            return await asyncio.wait_for(waiting, timeout)
        finally:
            self._waiting.pop(ident, None)

    async def close(self) -> None:
        await self._socket.close()
        self._reader.cancel()


def find_browser() -> str:
    """The Chromium this runtime runs.

    Raises
    ------
    ComputerRefused
        When none is installed: 503, said as the computer view says it.
    """
    named = os.environ.get(BROWSER_ENV, "").strip()
    if named:
        if not Path(named).is_file():
            raise ComputerRefused(503, f"No browser at {named} ({BROWSER_ENV}).")
        return named
    for name in CANDIDATES:
        found = shutil.which(name)
        if found:
            return found
    raise ComputerRefused(503, "No browser is installed on this computer.")


_READ_PAGE = """JSON.stringify({
  url: location.href,
  title: document.title,
  text: document.body ? document.body.innerText : ''
})"""

_CLICK = """(selector) => {
  const found = document.querySelector(selector);
  if (!found) return false;
  found.scrollIntoView({block: 'center'});
  found.click();
  return true;
}"""

_FOCUS = """(selector) => {
  const found = document.querySelector(selector);
  if (!found) return false;
  found.scrollIntoView({block: 'center'});
  found.focus();
  return document.activeElement === found;
}"""


class ChromiumBrowser:
    """A headless Chromium, one page, driven over the DevTools protocol."""

    def __init__(
        self,
        process: asyncio.subprocess.Process,
        profile: str,
        connection: _Connection,
        private: bool,
    ) -> None:
        self._process = process
        self._profile = profile
        self._connection = connection
        self._private = private
        self._lock = asyncio.Lock()
        self._loaded: Optional[asyncio.Event] = None
        # What each host was found to be, so a page's hundred requests to it
        # are resolved once.
        self._hosts: Dict[str, str] = {}
        connection.on("Page.loadEventFired", self._on_load)
        connection.on("Fetch.requestPaused", self._on_request)

    @classmethod
    async def launch(cls) -> "ChromiumBrowser":
        """Start a headless Chromium with one blank page."""
        executable = find_browser()
        profile = tempfile.mkdtemp(prefix="computer-browser-")
        process = await asyncio.create_subprocess_exec(
            executable,
            "--headless=new",
            # The runtime's container runs as nobody, with no user namespaces
            # for Chromium's own sandbox: the pod is the sandbox.
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--no-first-run",
            "--no-default-browser-check",
            "--mute-audio",
            f"--window-size={WIDTH},{HEIGHT}",
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=0",
            f"--user-data-dir={profile}",
            "about:blank",
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            port = await _devtools_port(profile, process)
            page_url = await _page_socket(port)
            import websockets

            socket_ = await websockets.connect(page_url, max_size=None)
        except BaseException:
            _stop(process)
            shutil.rmtree(profile, ignore_errors=True)
            raise
        private = private_allowed()
        browser = cls(process, profile, _Connection(socket_), private)
        await browser._prepare()
        return browser

    async def _prepare(self) -> None:
        send = self._connection.send
        await send("Page.enable")
        await send("Runtime.enable")
        await send(
            "Emulation.setDeviceMetricsOverride",
            {"width": WIDTH, "height": HEIGHT, "deviceScaleFactor": 1, "mobile": False},
        )
        if not self._private:
            # Every request the page makes is checked, not only the address
            # asked for: a redirect, a link, a script's fetch.
            await send("Fetch.enable", {"patterns": [{"urlPattern": "*"}]})

    # --- events -------------------------------------------------------------------

    def _on_load(self, params: Dict[str, Any]) -> None:
        if self._loaded is not None:
            self._loaded.set()

    def _on_request(self, params: Dict[str, Any]) -> None:
        asyncio.ensure_future(self._decide_request(params))

    async def _decide_request(self, params: Dict[str, Any]) -> None:
        request_id = params.get("requestId")
        url = str(params.get("request", {}).get("url", ""))
        try:
            refused = await self._refusal(url) if url.startswith("http") else ""
            if refused or not url.startswith(("http", "data:", "blob:")):
                logger.info("Its browser did not reach %s: %s", url, refused)
                await self._connection.send(
                    "Fetch.failRequest",
                    {"requestId": request_id, "errorReason": "AccessDenied"},
                )
            else:
                await self._connection.send(
                    "Fetch.continueRequest", {"requestId": request_id}
                )
        except BrowserFailed as failed:
            logger.debug("A request of its browser was not decided: %s", failed)

    async def _refusal(self, url: str) -> str:
        host = (urlsplit(url).hostname or "").lower()
        if host not in self._hosts:
            self._hosts[host] = await refusal_of(url)
        return self._hosts[host]

    # --- reading ------------------------------------------------------------------

    async def _evaluate(self, expression: str) -> Any:
        answer = await self._connection.send(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
        )
        if "exceptionDetails" in answer:
            details = answer["exceptionDetails"]
            said = details.get("exception", {}).get("description") or details.get(
                "text", "The page refused it."
            )
            raise BrowserFailed(str(said))
        return answer.get("result", {}).get("value")

    async def _call(self, function: str, *arguments: Any) -> Any:
        given = ", ".join(json.dumps(argument) for argument in arguments)
        return await self._evaluate(f"({function})({given})")

    async def _seen(self) -> PageSeen:
        page = json.loads(await self._evaluate(_READ_PAGE))
        text = page.get("text") or ""
        if len(text) > TEXT_LIMIT:
            text = (
                text[:TEXT_LIMIT] + f"\n… ({len(text) - TEXT_LIMIT:,} characters more)"
            )
        return PageSeen(url=page.get("url", ""), title=page.get("title", ""), text=text)

    async def _settle(self) -> None:
        """Wait for what a click or a key started: a page loading, or nothing."""
        await asyncio.sleep(0.3)
        for _ in range(int(LOAD_TIMEOUT / 0.1)):
            try:
                if await self._evaluate("document.readyState") == "complete":
                    return
            except BrowserFailed:
                pass  # A page between two documents.
            await asyncio.sleep(0.1)

    async def open(self, url: str) -> PageSeen:
        refused = await refusal_of(url, private=self._private)
        if refused:
            raise ComputerRefused(400, refused)
        async with self._lock:
            self._loaded = asyncio.Event()
            navigated = await self._connection.send("Page.navigate", {"url": url})
            if navigated.get("errorText"):
                raise ComputerRefused(
                    502, f"{url} did not open: {navigated['errorText']}."
                )
            try:
                await asyncio.wait_for(self._loaded.wait(), LOAD_TIMEOUT)
            except asyncio.TimeoutError:
                logger.info("%s did not finish loading in %ss", url, LOAD_TIMEOUT)
            finally:
                self._loaded = None
            return await self._seen()

    async def read(self) -> PageSeen:
        async with self._lock:
            return await self._seen()

    async def screenshot(self) -> bytes:
        async with self._lock:
            shot = await self._connection.send(
                "Page.captureScreenshot", {"format": "png"}
            )
        return base64.b64decode(shot["data"])

    async def click(self, selector: str) -> PageSeen:
        async with self._lock:
            if not await self._call(_CLICK, selector):
                raise ComputerRefused(404, f"Nothing on the page matches {selector}.")
            await self._settle()
            return await self._seen()

    async def type(self, selector: str, text: str, submit: bool = False) -> PageSeen:
        async with self._lock:
            if not await self._call(_FOCUS, selector):
                raise ComputerRefused(
                    404, f"Nothing on the page that takes typing matches {selector}."
                )
            await self._connection.send("Input.insertText", {"text": text})
            if submit:
                await self._key("Enter")
            await self._settle()
            return await self._seen()

    async def click_at(self, x: float, y: float) -> PageSeen:
        if not (0 <= x <= WIDTH and 0 <= y <= HEIGHT):
            raise ComputerRefused(400, f"{x}, {y} is not on the page.")
        async with self._lock:
            for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
                await self._connection.send(
                    "Input.dispatchMouseEvent",
                    {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1},
                )
            await self._settle()
            return await self._seen()

    async def type_text(self, text: str) -> PageSeen:
        async with self._lock:
            await self._connection.send("Input.insertText", {"text": text})
            return await self._seen()

    async def _key(self, key: str) -> None:
        name, code, text = KEYS[key]
        down: Dict[str, Any] = {
            "type": "keyDown",
            "key": name,
            "code": name,
            "windowsVirtualKeyCode": code,
        }
        if text:
            down["text"] = text
        await self._connection.send("Input.dispatchKeyEvent", down)
        await self._connection.send(
            "Input.dispatchKeyEvent",
            {"type": "keyUp", "key": name, "code": name, "windowsVirtualKeyCode": code},
        )

    async def press(self, key: str) -> PageSeen:
        if key not in KEYS:
            raise ComputerRefused(400, f"{key} is not a key it presses.")
        async with self._lock:
            await self._key(key)
            await self._settle()
            return await self._seen()

    async def scroll(self, dy: float) -> PageSeen:
        async with self._lock:
            await self._connection.send(
                "Input.dispatchMouseEvent",
                {
                    "type": "mouseWheel",
                    "x": WIDTH / 2,
                    "y": HEIGHT / 2,
                    "deltaX": 0,
                    "deltaY": dy,
                },
            )
            await asyncio.sleep(0.1)
            return await self._seen()

    @property
    def alive(self) -> bool:
        return self._process.returncode is None and self._connection.open

    async def close(self) -> None:
        try:
            await self._connection.close()
        except Exception:
            pass
        _stop(self._process)
        try:
            await asyncio.wait_for(self._process.wait(), 5)
        except asyncio.TimeoutError:
            self._process.kill()
        shutil.rmtree(self._profile, ignore_errors=True)


def _stop(process: asyncio.subprocess.Process) -> None:
    if process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass


async def _devtools_port(profile: str, process: asyncio.subprocess.Process) -> int:
    """The port Chromium chose, from the file it writes in its profile."""
    written = Path(profile) / "DevToolsActivePort"
    for _ in range(int(START_TIMEOUT / 0.05)):
        if process.returncode is not None:
            raise ComputerRefused(503, "Its browser did not start.")
        if written.is_file():
            first = written.read_text().splitlines()[:1]
            if first and first[0].strip().isdigit():
                return int(first[0])
        await asyncio.sleep(0.05)
    raise ComputerRefused(503, "Its browser did not start in time.")


async def _page_socket(port: int) -> str:
    """The DevTools address of the browser's one page."""
    import httpx

    async with httpx.AsyncClient(timeout=5) as client:
        for _ in range(int(START_TIMEOUT / 0.1)):
            listed = (await client.get(f"http://127.0.0.1:{port}/json/list")).json()
            for target in listed:
                if target.get("type") == "page":
                    return str(target["webSocketDebuggerUrl"])
            await asyncio.sleep(0.1)
    raise ComputerRefused(503, "Its browser opened no page.")


# --- one per agent ----------------------------------------------------------------------


BrowserFactory = Callable[[], Awaitable[Browser]]

_BROWSERS: Dict[str, Browser] = {}
_STARTING: Dict[str, asyncio.Lock] = {}
_FACTORY: Optional[BrowserFactory] = None


def use_browser_factory(factory: Optional[BrowserFactory]) -> None:
    """Start browsers with another factory (a test's), or Chromium again."""
    global _FACTORY
    _FACTORY = factory


def browser_running(agent_id: str) -> Optional[Browser]:
    """An agent's browser, when it runs, without starting one."""
    browser = _BROWSERS.get(agent_id)
    return browser if browser is not None and browser.alive else None


async def browser_of(agent_id: str) -> Browser:
    """An agent's browser, started on its first page."""
    lock = _STARTING.setdefault(agent_id, asyncio.Lock())
    async with lock:
        running = browser_running(agent_id)
        if running is not None:
            return running
        stale = _BROWSERS.pop(agent_id, None)
        if stale is not None:
            await stale.close()
        browser = await (_FACTORY or ChromiumBrowser.launch)()
        _BROWSERS[agent_id] = browser
        return browser


async def close_browser(agent_id: str) -> None:
    """Stop an agent's browser (its agent deleted)."""
    _STARTING.pop(agent_id, None)
    browser = _BROWSERS.pop(agent_id, None)
    if browser is not None:
        await browser.close()


async def close_browsers() -> None:
    """Stop every browser (the runtime stopping, a test)."""
    browsers = list(_BROWSERS.values())
    _BROWSERS.clear()
    _STARTING.clear()
    for browser in browsers:
        try:
            await browser.close()
        except Exception as error:
            logger.warning("A browser did not stop: %s", error)


__all__ = [
    "BROWSER_ENV",
    "Browser",
    "BrowserFailed",
    "ChromiumBrowser",
    "HEIGHT",
    "KEYS",
    "PRIVATE_ENV",
    "PageSeen",
    "WIDTH",
    "browser_of",
    "browser_running",
    "close_browser",
    "close_browsers",
    "find_browser",
    "private_allowed",
    "refusal_of",
    "use_browser_factory",
]
