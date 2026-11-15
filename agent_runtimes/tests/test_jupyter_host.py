# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""LinkedIn's server, sign-in browser and session in the Pod's Jupyter container.

The user, 15 November 2026: "OK in the jupyter which is not a sidecar, but a
container as such - no new sidecar/container, reuse the existing jupyter one."
"""

from __future__ import annotations

import asyncio
import glob
import json
import os
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.apps import browser as browsers
from agent_runtimes.apps.browser import CHROMIUM_FLAGS, ChromiumBrowser, PageSeen
from agent_runtimes.mcp import browser_session as sessions
from agent_runtimes.mcp import jupyter_host
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.routes.browser_sessions import router

LOCAL_CHROMIUM = os.path.expanduser(
    "~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome"
)


def run_cell(operation: str, **arguments: Any) -> tuple[Dict[str, Any], str]:
    """Run a cell as the Jupyter container's kernel would, in a Python of its own."""
    ran = subprocess.run(
        [sys.executable, "-c", jupyter_host.cell(operation, arguments)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert ran.returncode == 0, ran.stderr
    return jupyter_host.answer_of(ran.stdout), ran.stdout


@pytest.fixture
def sessions_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "sessions"
    monkeypatch.setattr(jupyter_host, "SESSIONS_ROOT", str(root))
    return root


def test_the_cell_carries_no_secret_and_answers_once(sessions_root: Path) -> None:
    code = jupyter_host.cell(
        "state", {"provider": "linkedin", "session_cookie": "li_at"}
    )
    compile(code, "cell", "exec")
    answer, _ = run_cell("state", provider="linkedin", session_cookie="li_at")
    assert answer == {"state": "none", "expires": None}


def test_a_session_written_there_is_read_and_forgotten_there(
    sessions_root: Path,
) -> None:
    root = sessions_root / "linkedin" / "auth"
    root.mkdir(parents=True)
    (root / "cookies.json").write_text(
        json.dumps(
            [{"name": "li_at", "value": "secret-session", "expires": 4102444800.0}]
        )
    )
    answer, stdout = run_cell("state", provider="linkedin", session_cookie="li_at")
    assert answer == {"state": "signed-in", "expires": 4102444800.0}
    assert "secret-session" not in stdout
    answer, _ = run_cell("forget", provider="linkedin", session_cookie="li_at")
    assert answer["state"] == "none"
    assert not (root / "cookies.json").exists()


def test_a_server_not_installed_is_said(sessions_root: Path) -> None:
    answer, _ = run_cell(
        "start-server",
        provider="linkedin",
        command=["no-such-linkedin-server"],
        env={},
        wait=5,
        session_cookie="li_at",
    )
    assert "not installed" in answer["error"]


@pytest.mark.skipif(not glob.glob(LOCAL_CHROMIUM), reason="no local Chromium")
def test_signed_in_in_a_browser_there_the_cookies_stay_there(
    sessions_root: Path,
) -> None:
    """The browser runs there, is driven from here; the cookies never come here."""

    async def scenario() -> None:
        started, _ = run_cell(
            "start-browser",
            provider="linkedin",
            browsers=LOCAL_CHROMIUM,
            flags=list(CHROMIUM_FLAGS),
            wait=60,
        )
        stopped: List[bool] = []

        async def stop() -> None:
            run_cell("stop-browser", provider="linkedin")
            stopped.append(True)

        browser = await ChromiumBrowser.attach(started["port"], stop)
        assert browser.devtools_port == started["port"]
        await browser._connection.send(
            "Network.setCookie",
            {
                "name": "li_at",
                "value": "secret-session",
                "domain": ".www.linkedin.com",
                "path": "/",
                "secure": True,
                "httpOnly": True,
                "expires": 4102444800,
            },
        )
        kept, stdout = run_cell(
            "keep-session",
            provider="linkedin",
            port=browser.devtools_port,
            urls=["https://www.linkedin.com/"],
            session_cookie="li_at",
            source_runtime=sessions.SOURCE_RUNTIME,
            profile_mark=sessions.PROFILE_MARK,
        )
        assert kept["state"] == "signed-in"
        assert "secret-session" not in stdout
        await browser.close()
        assert stopped == [True]

    asyncio.run(scenario())
    root = sessions_root / "linkedin" / "auth"
    written = json.loads((root / "cookies.json").read_text())
    assert [c["value"] for c in written if c["name"] == "li_at"] == ["secret-session"]
    state = json.loads((root / "source-state.json").read_text())
    assert state["source_runtime_id"] == sessions.SOURCE_RUNTIME
    assert state["profile_path"] == str(root / "profile")
    assert (root / "profile" / sessions.PROFILE_MARK).exists()
    for path in (sessions_root, root.parent, root, root / "profile"):
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o700
    for name in ("cookies.json", "source-state.json"):
        assert stat.S_IMODE(os.stat(root / name).st_mode) == 0o600
    # The sign-in browser's own profile is gone with it.
    assert not (root.parent / "signin").exists()


# --- the routes, on an Alpine runtime with a Jupyter container -------------------------------


class FakeBrowser:
    def __init__(self) -> None:
        self.opened: List[str] = []
        self.closed = False
        self.devtools_port = 9333

    async def open(self, url: str) -> PageSeen:
        self.opened.append(url)
        return PageSeen(url=url, title="LinkedIn Login", text="")

    async def cookies(self, urls: List[str]) -> List[Dict[str, Any]]:
        raise AssertionError("no cookie is read into agent-runtimes")

    @property
    def alive(self) -> bool:
        return not self.closed

    async def close(self) -> None:
        self.closed = True


@pytest.fixture
def alpine_with_jupyter(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.delenv("AGENT_RUNTIMES_VISITORS", raising=False)
    monkeypatch.setenv(
        "AGENT_RUNTIMES_JUPYTER_SANDBOX", "http://127.0.0.1:2300/jupyter?token=t"
    )
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path / "local" / "profile"))
    monkeypatch.setattr(sessions, "on_musl", lambda: True)
    monkeypatch.setattr(sessions, "_HELD", {})
    monkeypatch.setattr(sessions, "_server_known", lambda provider: True)
    calls: List[tuple[str, Dict[str, Any]]] = []
    held: Dict[str, Any] = {"state": "none", "expires": None}

    async def call(
        operation: str, timeout: float = 0, **arguments: Any
    ) -> Dict[str, Any]:
        calls.append((operation, arguments))
        if operation == "start-browser":
            return {"port": 9333}
        if operation == "keep-session":
            held.update(state="signed-in", expires=4102444800.0)
        if operation == "forget":
            held.update(state="none", expires=None)
        return dict(held)

    monkeypatch.setattr(jupyter_host, "call", call)
    made: List[FakeBrowser] = []

    async def attach(port: int, on_close: Any) -> FakeBrowser:
        assert port == 9333
        made.append(FakeBrowser())
        return made[-1]

    monkeypatch.setattr(ChromiumBrowser, "attach", staticmethod(attach))

    class Lifecycle:
        restarted: List[str] = []

        async def restart(self, server_id: str) -> bool:
            self.restarted.append(server_id)
            return True

        async def stop_server(self, server_id: str) -> bool:
            return True

        def knows(self, server_id: str) -> bool:
            return True

    lifecycle = Lifecycle()
    monkeypatch.setattr(
        "agent_runtimes.mcp.lifecycle.get_mcp_lifecycle_manager", lambda: lifecycle
    )
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client, calls, made, lifecycle
    browsers._BROWSERS.clear()
    browsers._STARTING.clear()


def test_on_alpine_with_jupyter_linkedin_is_offered(alpine_with_jupyter) -> None:
    test_client, calls, _, _ = alpine_with_jupyter
    status = test_client.get("/api/v1/configure/browser-sessions/linkedin").json()
    assert status["offered"] is True
    assert status["unavailable"] == ""
    assert status["state"] == "none"
    # Asked once of the Jupyter container, then known.
    test_client.get("/api/v1/configure/browser-sessions/linkedin")
    assert [c[0] for c in calls] == ["state"]


def test_signing_in_there_keeps_the_session_there(
    alpine_with_jupyter, tmp_path: Path
) -> None:
    test_client, calls, made, lifecycle = alpine_with_jupyter
    started = test_client.post("/api/v1/configure/browser-sessions/linkedin/start")
    assert started.status_code == 200
    assert made[0].opened == ["https://www.linkedin.com/login"]

    done = test_client.post("/api/v1/configure/browser-sessions/linkedin/finish").json()
    assert done["state"] == "signed-in"
    assert done["restarted"] is True
    assert lifecycle.restarted == ["linkedin"]
    kept = next(
        arguments for operation, arguments in calls if operation == "keep-session"
    )
    assert kept["port"] == 9333
    assert kept["session_cookie"] == "li_at"
    # Nothing written on agent-runtimes' disk.
    assert not (tmp_path / "local").exists()

    gone = test_client.delete("/api/v1/configure/browser-sessions/linkedin").json()
    assert gone["state"] == "none"
    assert "forget" in [operation for operation, _ in calls]


def test_the_lifecycle_runs_linkedin_in_jupyter_only_there(
    alpine_with_jupyter, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert MCPLifecycleManager._in_jupyter("linkedin") is True
    assert MCPLifecycleManager._in_jupyter("tavily") is False
    monkeypatch.setattr(sessions, "on_musl", lambda: False)
    assert MCPLifecycleManager._in_jupyter("linkedin") is False


def test_a_hosted_server_keeps_its_address_for_codemode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Codemode reaches it where it listens, the same port after a restart."""
    asked: List[Dict[str, Any]] = []

    async def call(
        operation: str, timeout: float = 0, **arguments: Any
    ) -> Dict[str, Any]:
        asked.append({"do": operation, **arguments})
        return (
            {"port": arguments.get("port") or 41234}
            if operation == "start-server"
            else {}
        )

    monkeypatch.setattr(jupyter_host, "call", call)
    monkeypatch.setattr(jupyter_host, "_HOSTED", {})
    monkeypatch.setattr(jupyter_host, "_PORTS", {})
    url = asyncio.run(jupyter_host.start_server("linkedin", {"HEADLESS": "true"}))
    assert url == "http://127.0.0.1:41234/mcp"
    assert jupyter_host.hosted_url("linkedin") == url
    asyncio.run(jupyter_host.stop_server("linkedin"))
    assert jupyter_host.hosted_url("linkedin") == ""
    asyncio.run(jupyter_host.start_server("linkedin", {"HEADLESS": "true"}))
    assert asked[-1]["port"] == 41234
    assert jupyter_host.hosted_url("linkedin") == url
