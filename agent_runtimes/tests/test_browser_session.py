# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person's LinkedIn browser session, made in the runtime's browser (15 November 2026)."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Any, Dict, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.apps import browser as browsers
from agent_runtimes.apps.browser import PageSeen
from agent_runtimes.mcp import browser_session as sessions
from agent_runtimes.routes.browser_sessions import router

LI_AT = {
    "name": "li_at",
    "value": "secret-session",
    "domain": ".www.linkedin.com",
    "path": "/",
    "expires": 4102444800.0,
    "httpOnly": True,
    "secure": True,
    "sameSite": "None",
}
JSESSION = {
    "name": "JSESSIONID",
    "value": "ajax:1",
    "domain": ".www.linkedin.com",
    "path": "/",
    "session": True,
    "expires": -1,
}


class FakeBrowser:
    """A browser that remembers what it was asked and gives LinkedIn's cookies."""

    def __init__(self, cookies: List[Dict[str, Any]]) -> None:
        self.opened: List[str] = []
        self.steps: List[Any] = []
        self.given = cookies
        self.closed = False

    async def open(self, url: str) -> PageSeen:
        self.opened.append(url)
        return PageSeen(url=url, title="LinkedIn Login", text="")

    async def read(self) -> PageSeen:
        return PageSeen(url=self.opened[-1], title="", text="")

    async def screenshot(self) -> bytes:
        return b"\x89PNG"

    async def click(self, selector: str) -> PageSeen:
        self.steps.append(("click", selector))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def type(self, selector: str, text: str, submit: bool = False) -> PageSeen:
        self.steps.append(("type", selector, text, submit))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def click_at(self, x: float, y: float) -> PageSeen:
        self.steps.append(("click", x, y))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def type_text(self, text: str) -> PageSeen:
        self.steps.append(("type", text))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def press(self, key: str) -> PageSeen:
        self.steps.append(("key", key))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def scroll(self, dy: float) -> PageSeen:
        self.steps.append(("scroll", dy))
        return PageSeen(url=self.opened[-1], title="", text="")

    async def cookies(self, urls: List[str]) -> List[Dict[str, Any]]:
        assert "https://www.linkedin.com/" in urls
        return self.given

    @property
    def alive(self) -> bool:
        return not self.closed

    async def close(self) -> None:
        self.closed = True


@pytest.fixture
def profile(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    where = tmp_path / ".linkedin-mcp" / "profile"
    monkeypatch.setenv("USER_DATA_DIR", str(where))
    monkeypatch.delenv("AGENT_RUNTIMES_VISITORS", raising=False)
    monkeypatch.delenv("AGENT_RUNTIMES_JUPYTER_SANDBOX", raising=False)
    monkeypatch.setattr(sessions, "on_musl", lambda: False)
    monkeypatch.setattr(sessions, "_HELD", {})
    return where


@pytest.fixture
def client(profile: Path):
    made: List[FakeBrowser] = []

    async def factory() -> FakeBrowser:
        made.append(FakeBrowser([LI_AT, JSESSION]))
        return made[-1]

    browsers.use_browser_factory(factory)
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client, made
    browsers.use_browser_factory(None)
    browsers._BROWSERS.clear()
    browsers._STARTING.clear()


def test_a_session_is_signed_in_in_the_runtimes_browser_and_kept_for_the_server(
    client, profile: Path
) -> None:
    test_client, made = client
    assert (
        test_client.get("/api/v1/configure/browser-sessions/linkedin").json()["state"]
        == "none"
    )

    started = test_client.post("/api/v1/configure/browser-sessions/linkedin/start")
    assert started.status_code == 200
    assert made[0].opened == ["https://www.linkedin.com/login"]
    assert (
        test_client.get("/api/v1/configure/browser-sessions/linkedin").json()[
            "signingIn"
        ]
        is True
    )

    assert (
        test_client.get(
            "/api/v1/configure/browser-sessions/linkedin/screenshot"
        ).content
        == b"\x89PNG"
    )
    test_client.post(
        "/api/v1/configure/browser-sessions/linkedin/click", json={"x": 10, "y": 20}
    )
    test_client.post(
        "/api/v1/configure/browser-sessions/linkedin/type",
        json={"text": "me@example.com"},
    )
    test_client.post(
        "/api/v1/configure/browser-sessions/linkedin/key", json={"key": "Enter"}
    )
    assert made[0].steps == [
        ("click", 10.0, 20.0),
        ("type", "me@example.com"),
        ("key", "Enter"),
    ]

    done = test_client.post("/api/v1/configure/browser-sessions/linkedin/finish").json()
    assert done["state"] == "signed-in"
    assert done["signingIn"] is False
    assert made[0].closed

    root = profile.parent
    written = json.loads((root / "cookies.json").read_text())
    assert {c["name"] for c in written} == {"li_at", "JSESSIONID"}
    assert next(c for c in written if c["name"] == "JSESSIONID")["expires"] == -1
    state = json.loads((root / "source-state.json").read_text())
    # A foreign source runtime: the server always derives a fresh profile from the cookies.
    assert state["source_runtime_id"] == sessions.SOURCE_RUNTIME
    assert state["cookies_path"] == str(root / "cookies.json")
    assert any(profile.iterdir())
    # The person's alone: files 0600, directories 0700.
    assert stat.S_IMODE(os.stat(root / "cookies.json").st_mode) == 0o600
    assert stat.S_IMODE(os.stat(root).st_mode) == 0o700

    gone = test_client.delete("/api/v1/configure/browser-sessions/linkedin").json()
    assert gone["state"] == "none"
    assert not (root / "cookies.json").exists()


def test_done_before_linkedin_signed_in_keeps_nothing(profile: Path) -> None:
    with pytest.raises(sessions.SessionRefused) as refused:
        sessions.write_linkedin_session([JSESSION])
    assert refused.value.status == 409
    assert not (profile.parent / "cookies.json").exists()


def test_an_expired_session_is_said_expired(profile: Path) -> None:
    sessions.write_linkedin_session([{**LI_AT, "expires": 1000.0}])
    assert sessions.session_state(sessions.LINKEDIN, now=2000.0) == "expired"
    assert sessions.session_state(sessions.LINKEDIN, now=500.0) == "signed-in"


def test_a_visitor_never_gets_one(client, monkeypatch: pytest.MonkeyPatch) -> None:
    test_client, made = client
    monkeypatch.setenv("AGENT_RUNTIMES_VISITORS", "web-research")
    refused = test_client.post("/api/v1/configure/browser-sessions/linkedin/start")
    assert refused.status_code == 403
    assert made == []


def test_another_provider_is_refused(client) -> None:
    test_client, _ = client
    assert (
        test_client.get("/api/v1/configure/browser-sessions/twitter").status_code == 404
    )


def test_no_cookie_is_logged(client, caplog: pytest.LogCaptureFixture) -> None:
    test_client, _ = client
    caplog.set_level("DEBUG")
    test_client.post("/api/v1/configure/browser-sessions/linkedin/start")
    test_client.post("/api/v1/configure/browser-sessions/linkedin/finish")
    assert "secret-session" not in caplog.text


def test_alpine_without_jupyter_says_the_server_does_not_run_here(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_client, made = client
    monkeypatch.setattr(sessions, "on_musl", lambda: True)
    monkeypatch.setattr("agent_runtimes.mcp.jupyter_host.available", lambda: False)
    status = test_client.get("/api/v1/configure/browser-sessions/linkedin").json()
    assert status["offered"] is False
    assert "Alpine" in status["unavailable"]
    assert (
        test_client.post(
            "/api/v1/configure/browser-sessions/linkedin/start"
        ).status_code
        == 409
    )
    assert made == []
