# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The browser of an application's computer (LOOP R-23).

*Browse* on, its agent is given a browser in the runtime's container: it
opens a page, reads it, takes a screenshot, clicks and types where a
selector says. A visitor's turn only reads. A person who took the computer
over sees the page and clicks and types in it, while its agent's calls to it
wait. It never reaches the runtime's own network.

Driven here by a fake browser; by a real Chromium too, when one is
installed (`test_a_real_chromium_*`).
"""

import asyncio
import http.server
import os
import threading
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.loop.apps import browser as browsing
from agent_runtimes.loop.apps import computer, sessions
from agent_runtimes.loop.apps.browser import PageSeen, refusal_of
from agent_runtimes.loop.apps.computer import (
    BROWSE_TOOLS,
    ComputerRefused,
    browser_toolset,
)
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError, AppRulesCapability
from agent_runtimes.loop.apps.visitors import enter_visitor_run, leave_visitor_run
from agent_runtimes.routes import agents
from agent_runtimes.routes import apps as routes
from agent_runtimes.types import AppSpec

PNG = b"\x89PNG\r\n\x1a\nfake"


class FakeBrowser:
    """A browser that remembers what it was asked."""

    def __init__(self) -> None:
        self.page = PageSeen(url="about:blank", title="", text="")
        self.done: List[tuple] = []
        self.alive = True

    async def open(self, url: str) -> PageSeen:
        refused = await refusal_of(url, resolve=_public)
        if refused:
            raise ComputerRefused(400, refused)
        self.done.append(("open", url))
        self.page = PageSeen(url=url, title="Example Domain", text="Example text.")
        return self.page

    async def read(self) -> PageSeen:
        return self.page

    async def screenshot(self) -> bytes:
        return PNG

    async def click(self, selector: str) -> PageSeen:
        self.done.append(("click", selector))
        return self.page

    async def type(self, selector: str, text: str, submit: bool = False) -> PageSeen:
        self.done.append(("type", selector, text, submit))
        return self.page

    async def click_at(self, x: float, y: float) -> PageSeen:
        self.done.append(("click_at", x, y))
        return self.page

    async def type_text(self, text: str) -> PageSeen:
        self.done.append(("type_text", text))
        return self.page

    async def press(self, key: str) -> PageSeen:
        if key not in browsing.KEYS:
            raise ComputerRefused(400, f"{key} is not a key it presses.")
        self.done.append(("press", key))
        return self.page

    async def scroll(self, dy: float) -> PageSeen:
        self.done.append(("scroll", dy))
        return self.page

    async def close(self) -> None:
        self.alive = False


async def _public(host: str) -> List[str]:
    return {"localhost": ["127.0.0.1"], "metadata.internal": ["169.254.169.254"]}.get(
        host, ["93.184.215.14"]
    )


@pytest.fixture()
def fake(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[FakeBrowser]:
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(computer, "WAIT_STEP", 0.01)
    made = FakeBrowser()

    async def factory() -> FakeBrowser:
        return made

    browsing.use_browser_factory(factory)
    yield made
    browsing.use_browser_factory(None)
    browsing._BROWSERS.clear()
    browsing._STARTING.clear()
    computer.forget_holders()


def app(**parts: bool) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "permissions": {"computer": parts},
        }
    )


# --- what it is given ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_browse_on_gives_its_browser_and_off_gives_none() -> None:
    offered = [ToolDefinition(name=name) for name in sorted(BROWSE_TOOLS)]
    off = AppRulesCapability(app=app(files=True), agent_id="desk")
    on = AppRulesCapability(app=app(browse=True), agent_id="desk")
    assert await off.prepare_tools(None, offered) == []
    assert {tool.name for tool in await on.prepare_tools(None, offered)} == set(
        BROWSE_TOOLS
    )
    assert browser_toolset(app(files=True), "desk") is None
    toolset = browser_toolset(app(browse=True), "desk")
    assert toolset is not None and set(toolset.tools) == set(BROWSE_TOOLS)


def test_opening_and_looking_read_clicking_and_typing_act() -> None:
    capability = AppRulesCapability(app=app(browse=True), agent_id="desk")
    for tool in ("open_page", "read_page", "page_screenshot"):
        assert capability.decide(tool, {}).decision.classes == ("read",)
    for tool in ("click_on_page", "type_on_page"):
        assert capability.decide(tool, {}).decision.classes == ("write",)


async def _always_yes(tool: str, args: Dict[str, Any], decision: Any) -> None:
    return None


@pytest.mark.asyncio
async def test_its_agent_opens_reads_screenshots_and_clicks(fake: FakeBrowser) -> None:
    calls = iter(
        [
            ToolCallPart("open_page", {"url": "https://example.com"}),
            ToolCallPart("page_screenshot", {}),
            ToolCallPart("click_on_page", {"selector": "a"}),
            ToolCallPart(
                "type_on_page", {"selector": "#q", "text": "loop", "submit": True}
            ),
        ]
    )
    returned: List[Any] = []
    images: List[BinaryContent] = []

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        for part in messages[-1].parts:
            if getattr(part, "part_kind", "") == "tool-return":
                returned.append(part.content)
            if getattr(part, "part_kind", "") == "user-prompt":
                content = part.content if isinstance(part.content, list) else []
                images.extend(c for c in content if isinstance(c, BinaryContent))
        call = next(calls, None)
        return ModelResponse(parts=[call] if call else [TextPart("done")])

    agent = Agent(
        FunctionModel(model),
        capabilities=[
            AppRulesCapability(app=app(browse=True), agent_id="desk", ask=_always_yes)
        ],
    )
    await agent.run("go")
    assert returned[0] == (
        "Opened: Example Domain — https://example.com\n\nExample text."
    )
    assert returned[1].startswith("Screenshot of Example Domain — https://example.com")
    # The screenshot itself is shown to the model.
    assert [image.data for image in images] == [PNG]
    assert fake.done == [
        ("open", "https://example.com"),
        ("click", "a"),
        ("type", "#q", "loop", True),
    ]


@pytest.mark.asyncio
async def test_a_visitors_turn_only_reads(fake: FakeBrowser) -> None:
    capability = AppRulesCapability(app=app(browse=True), agent_id="desk")
    token = enter_visitor_run("visitor-1")
    try:
        assert await capability.before_tool_execute(
            None,
            call=ToolCallPart("open_page", {"url": "https://example.com"}),
            tool_def=None,
            args={"url": "https://example.com"},
        ) == {"url": "https://example.com"}
        with pytest.raises(AppRuleBlockedError, match="only reads"):
            await capability.before_tool_execute(
                None,
                call=ToolCallPart("click_on_page", {"selector": "a"}),
                tool_def=None,
                args={"selector": "a"},
            )
    finally:
        leave_visitor_run(token)


@pytest.mark.asyncio
async def test_its_agents_browser_waits_while_a_person_has_it(
    fake: FakeBrowser,
) -> None:
    capability = AppRulesCapability(app=app(browse=True), agent_id="desk")
    computer.take_over("desk", "person", "ada")
    waiting = asyncio.ensure_future(
        capability.before_tool_execute(
            None, call=ToolCallPart("read_page", {}), tool_def=None, args={}
        )
    )
    await asyncio.sleep(0.05)
    assert not waiting.done()
    computer.hand_back("desk", "person", "ada")
    assert await asyncio.wait_for(waiting, 1) == {}


# --- what it may reach ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_it_never_reaches_the_runtimes_own_network() -> None:
    for url in (
        "http://127.0.0.1:8765/api/v1/apps",
        "http://localhost:2300/jupyter",
        "http://10.0.0.4/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data",
        "http://metadata.internal/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://0.0.0.0/",
    ):
        assert "private network" in await refusal_of(url, resolve=_public), url
    assert "not a web page" in await refusal_of("file:///etc/passwd")
    assert "not a web page" in await refusal_of("javascript:alert(1)")
    assert await refusal_of("https://example.com/", resolve=_public) == ""
    # A laptop's runtime, whose pages are its own.
    assert await refusal_of("http://127.0.0.1:8000/", private=True) == ""


@pytest.mark.asyncio
async def test_every_request_a_page_makes_is_checked() -> None:
    """A redirect, a link, a script's fetch: each passes the same check."""
    sent: List[tuple] = []

    class Connection:
        def on(self, method: str, handler: Any) -> None:
            pass

        async def send(self, method: str, params: Optional[Dict] = None) -> Dict:
            sent.append((method, (params or {}).get("requestId")))
            return {}

    class Process:
        returncode = None

    browser = browsing.ChromiumBrowser(Process(), "/nowhere", Connection(), False)  # type: ignore[arg-type]
    browser._hosts["example.com"] = ""
    for request_id, url in (
        ("1", "http://127.0.0.1:8765/api/v1/apps/agents/desk/computer/take-over"),
        ("2", "https://example.com/style.css"),
        ("3", "file:///etc/passwd"),
    ):
        await browser._decide_request(
            {"requestId": request_id, "request": {"url": url}}
        )
    assert sent == [
        ("Fetch.failRequest", "1"),
        ("Fetch.continueRequest", "2"),
        ("Fetch.failRequest", "3"),
    ]


# --- the routes -------------------------------------------------------------------------


class Verifier:
    async def verify(self, token: str, app_uid: str = "") -> Any:
        from agent_runtimes.loop.apps.callers import Caller

        return Caller(kind="person", uid=token)


class Talking:
    def __init__(self, agent_id: str, uid: str) -> None:
        from agent_runtimes.loop.apps.callers import Caller

        self.agent_id = agent_id
        self.state = "open"
        self.opened_by = Caller(kind="person", uid=uid)

    def answers_to(self, caller: Any) -> bool:
        return (caller.kind, caller.uid) == ("person", self.opened_by.uid)


SPEC = {
    "schema": "loop.app/v1",
    "id": "desk",
    "name": "Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "permissions": {"computer": {"browse": True}},
}

BASE = "/api/v1/apps/agents/desk/computer"


@pytest.fixture()
def held(monkeypatch: pytest.MonkeyPatch, fake: FakeBrowser) -> Iterator[FakeBrowser]:
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    agents._agentspecs["desk"] = {"app_spec": SPEC, "app_instance": {}}
    agents._agentspecs["bare-desk"] = {
        "app_spec": {**SPEC, "permissions": {"computer": {"files": True}}},
        "app_instance": {},
    }
    yield fake
    for agent_id in ("desk", "bare-desk"):
        agents._agentspecs.pop(agent_id, None)
    sessions.forget_sessions()


def _client(host: str) -> TestClient:
    from agent_runtimes.app import create_app

    return TestClient(create_app(), client=(host, 50000))


def test_a_person_sees_its_page_takes_it_over_and_hands_it_back(
    held: FakeBrowser,
) -> None:
    with _client("10.0.0.4") as remote:
        ada = {"Authorization": "Bearer ada"}
        bob = {"Authorization": "Bearer bob"}
        sessions._SESSIONS["s-1"] = Talking("desk", "ada")  # type: ignore[assignment]
        sessions._SESSIONS["s-2"] = Talking("desk", "bob")  # type: ignore[assignment]
        assert remote.get(f"{BASE}/browser", headers=ada).json() == {"page": None}
        assert remote.get(f"{BASE}/browser/screenshot", headers=ada).status_code == 404
        # Its agent opens a page.
        asyncio.run(browsing.browser_of("desk")).page = PageSeen(
            url="https://example.com/", title="Example Domain"
        )
        described = remote.get(BASE, headers=ada).json()
        assert described["page"] == {
            "url": "https://example.com/",
            "title": "Example Domain",
        }
        shot = remote.get(f"{BASE}/browser/screenshot", headers=ada)
        assert shot.content == PNG and shot.headers["content-type"] == "image/png"
        assert shot.headers["cache-control"] == "no-store"
        # Only who took it over clicks and types.
        click = {"x": 40, "y": 120}
        assert (
            remote.post(f"{BASE}/browser/click", json=click, headers=ada).status_code
            == 409
        )
        assert remote.post(f"{BASE}/take-over", headers=ada).status_code == 200
        assert (
            remote.post(f"{BASE}/browser/click", json=click, headers=bob).status_code
            == 409
        )
        clicked = remote.post(f"{BASE}/browser/click", json=click, headers=ada)
        assert clicked.json()["page"]["title"] == "Example Domain"
        remote.post(f"{BASE}/browser/type", json={"text": "loop"}, headers=ada)
        remote.post(f"{BASE}/browser/key", json={"key": "Enter"}, headers=ada)
        remote.post(f"{BASE}/browser/scroll", json={"dy": 300}, headers=ada)
        refused = remote.post(f"{BASE}/browser/key", json={"key": "F12"}, headers=ada)
        assert refused.status_code == 400
        inside = remote.post(
            f"{BASE}/browser/open",
            json={"url": "http://127.0.0.1:8765/api/v1/apps"},
            headers=ada,
        )
        assert (
            inside.status_code == 400 and "private network" in inside.json()["detail"]
        )
        remote.post(
            f"{BASE}/browser/open", json={"url": "https://example.org/"}, headers=ada
        )
        assert held.done == [
            ("click_at", 40.0, 120.0),
            ("type_text", "loop"),
            ("press", "Enter"),
            ("scroll", 300.0),
            ("open", "https://example.org/"),
        ]
        assert remote.post(f"{BASE}/hand-back", headers=ada).status_code == 200
        assert (
            remote.post(f"{BASE}/browser/click", json=click, headers=ada).status_code
            == 409
        )


def test_a_computer_that_does_not_browse_has_no_browser(held: FakeBrowser) -> None:
    with _client("127.0.0.1") as local:
        bare = "/api/v1/apps/agents/bare-desk/computer"
        described = local.get(bare).json()
        assert (described["browser"], described["page"]) == (False, None)
        refused = local.get(f"{bare}/browser")
        assert (
            refused.status_code == 409 and "browse is off" in refused.json()["detail"]
        )
        assert local.get(f"{bare}/browser/screenshot").status_code == 409


# --- a real Chromium ------------------------------------------------------------------


def _chromium() -> Optional[str]:
    try:
        return browsing.find_browser()
    except ComputerRefused:
        return None


PAGE = b"""<!doctype html><html><head><title>Its own page</title></head>
<body><h1>Hello from the computer</h1>
<input id="q"><button id="go" onclick="document.title = 'Typed: ' +
document.getElementById('q').value">Go</button></body></html>"""


@pytest.fixture()
def served() -> Iterator[str]:
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(PAGE)

        def log_message(self, *args: Any) -> None:
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/"
    server.shutdown()


@pytest.mark.skipif(_chromium() is None, reason="no Chromium installed")
@pytest.mark.asyncio
async def test_a_real_chromium_opens_reads_types_and_shows_a_page(
    served: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(browsing.PRIVATE_ENV, "allow")
    browser = await browsing.ChromiumBrowser.launch()
    try:
        page = await browser.open(served)
        assert page.title == "Its own page"
        assert "Hello from the computer" in page.text
        png = await browser.screenshot()
        assert png.startswith(b"\x89PNG")
        # Width and height, from the PNG's header: the page's own size.
        assert int.from_bytes(png[16:20], "big") == browsing.WIDTH
        assert int.from_bytes(png[20:24], "big") == browsing.HEIGHT
        await browser.type("#q", "loop")
        assert (await browser.click("#go")).title == "Typed: loop"
        with pytest.raises(ComputerRefused, match="Nothing on the page matches"):
            await browser.click("#missing")
        # A person clicks where the field and the button show on the
        # screenshot, and types between.
        centre = (
            "(id) => { const r = document.getElementById(id).getBoundingClientRect();"
            " return [r.x + r.width / 2, r.y + r.height / 2]; }"
        )
        field = await browser._call(centre, "q")
        await browser.click_at(*field)
        await browser.press("Backspace")
        await browser.type_text("p!")
        button = await browser._call(centre, "go")
        assert (await browser.click_at(*button)).title == "Typed: loop!"
        # What a page fetches is let through where private pages are allowed.
        reached = await browser._evaluate(
            f"fetch({served!r}, {{mode: 'no-cors'}})"
            ".then(() => 'reached', () => 'refused')"
        )
        assert reached == "reached"
    finally:
        await browser.close()


@pytest.mark.skipif(_chromium() is None, reason="no Chromium installed")
@pytest.mark.asyncio
async def test_a_real_chromium_refuses_the_runtimes_own_network(
    served: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv(browsing.PRIVATE_ENV, raising=False)
    browser = await browsing.ChromiumBrowser.launch()
    try:
        with pytest.raises(ComputerRefused, match="private network"):
            await browser.open(served)
        # Not reached from a page either: a script's fetch is failed.
        await browser._connection.send(
            "Page.navigate", {"url": "data:text/html,<title>here</title>"}
        )
        await asyncio.sleep(0.5)
        reached = await browser._evaluate(
            f"fetch({served!r}, {{mode: 'no-cors'}})"
            ".then(() => 'reached', () => 'refused')"
        )
        assert reached == "refused"
    finally:
        await browser.close()


def test_no_chromium_is_said(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(browsing.BROWSER_ENV, os.path.join("/nowhere", "chromium"))
    with pytest.raises(ComputerRefused, match="No browser at"):
        browsing.find_browser()
