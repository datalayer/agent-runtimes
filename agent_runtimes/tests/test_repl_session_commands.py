# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The REPL's session commands (MH-18): `/sessions`, `/resume <uid>`,
`/swap <agent>`, `/clone [turn]`, `/export [file]` through `LoopSession`,
each against a fake session; `/swap` shows the sentence; `/browser` unchanged.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterator, List

import httpx
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps import sessions
from agent_runtimes.apps.session_store import FileSessionStore, use_session_store
from agent_runtimes.chat.commands import clone, export, resume, swap
from agent_runtimes.chat.commands import sessions as sessions_command
from agent_runtimes.loop.session import LoopSession
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

HARNESS_AGENT = "example-harness-codex"


class Console:
    def __init__(self) -> None:
        self.lines: List[str] = []

    def print(self, text: Any = "", **kwargs: Any) -> None:
        self.lines.append(str(text))


@pytest.fixture()
def tux(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[Any]:  # noqa: F811 - the fixtures
    """A REPL bound to the test runtime: httpx reaches the TestClient, signed as Ada."""
    from agent_runtimes.apps.record import agent_recorder, send_to_store

    use_session_store(FileSessionStore(root=tmp_path / "sessions"))
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    recorder = agent_recorder("notes-assistant")
    assert recorder is not None
    recorder.send = send_to_store

    def request(
        method: str, url: str, headers: Any = None, timeout: Any = None, **kwargs: Any
    ) -> Any:
        return remote.request(
            method, url.replace("http://runtime", ""), headers=headers, **kwargs
        )

    monkeypatch.setattr(httpx, "request", request)
    monkeypatch.setattr(
        httpx,
        "post",
        lambda url, json, headers, timeout: remote.post(
            url.replace("http://runtime", ""), json=json, headers=headers
        ),
    )

    async def rebound(live: Any, agent: str, request: Any) -> None:
        return None

    sessions.use_rebinder(rebound)
    session = LoopSession(
        server_url="http://runtime", agent_id="notes-assistant", token="ada"
    )
    made = SimpleNamespace(
        console=Console(),
        server_url="http://runtime",
        session=session,
        agent_id="notes-assistant",
    )
    try:
        yield made
    finally:
        sessions.use_rebinder(None)
        use_session_store(None)


def _open(client: TestClient, uid: str, opener: str = "One") -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": opener,
                "session": uid,
            },
        )
    )


def _run(command: Any, tux: Any, argv: str = "") -> List[str]:
    tux.console.lines.clear()
    asyncio.run(command.execute(tux, argv))
    return list(tux.console.lines)


def test_the_commands_act_on_the_session_this_conversation_is(
    tux: Any,
    remote: TestClient,  # noqa: F811 - the fixture
    tmp_path: Path,
) -> None:
    from agent_shield.policy import Harnesses, Policy

    from agent_runtimes.guardrails import managed_policies
    from agent_runtimes.tests.test_shield_policies import FakeIam, served

    managed_policies.use_source(
        FakeIam(
            served(Policy(scope="organization", harnesses=Harnesses(admit=["codex"])))
        )
    )
    try:
        _open(remote, "session-r101", opener="Hello there")
        remote.post("/api/v1/apps/sessions/session-r101/stop", headers=as_("ada"))
        # Not a session yet: /swap, /clone and /export say so.
        for command, argv in ((swap, HARNESS_AGENT), (clone, ""), (export, "")):
            [said] = _run(command, tux, argv)
            assert "This conversation is not an application session" in said
        listed = _run(sessions_command, tux)
        assert any(
            line.startswith("session-r101  paused  notes-assistant  1 turn")
            for line in listed
        )
        [resumed] = _run(resume, tux, "session-r101")
        assert (
            resumed
            == "Resumed session-r101 (notes-assistant): 1 turn replayed. /swap, /clone and /export act on it now."
        )
        assert (
            tux.session.session_uid == "session-r101"
            and tux.session.conversation_id == "session-r101"
        )
        told, swapped = _run(swap, tux, HARNESS_AGENT)
        assert told.startswith(
            f'{HARNESS_AGENT} is told: "This conversation was with notes-assistant until turn 1; from here it is with Codex.'
        )
        assert swapped == f"Swapped. {HARNESS_AGENT} answers from here."
        assert tux.agent_id == HARNESS_AGENT and tux.session.said.startswith(
            "This conversation was with"
        )
        [cloned] = _run(clone, tux, "1")
        assert (
            cloned.startswith("Cloned as ") and "(paused, 1 turn). /resume " in cloned
        )
        [refused] = _run(clone, tux, "x")
        assert "the turn is a number" in refused
        out = tmp_path / "r101.session.jsonl"
        [exported] = _run(export, tux, str(out))
        assert (
            exported.startswith("Exported 1 turn, ") and f"→ {out} (sha256:" in exported
        )
        assert out.read_text().startswith('{"record_type": "session"')
        [again] = _run(swap, tux, HARNESS_AGENT)
        assert f"is with {HARNESS_AGENT} already" in again
    finally:
        managed_policies.use_source(None)


def test_browser_is_unchanged() -> None:
    from agent_runtimes.chat.commands import browser

    assert browser.NAME == "browser" and browser.ALIASES == ["chat"]
