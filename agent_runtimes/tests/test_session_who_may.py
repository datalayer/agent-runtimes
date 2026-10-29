# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who may (MH-31): the opener for every operation; an embed's visitor
refused clone, export and resume with `NOTHING_KEPT`; a stranger's — an
organization's admin included — clone, export, swap, rename or end a 404; a
pending question answered first wins, the second answer 409.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, Iterator

import pytest
from fastapi.testclient import TestClient
from reactor.ui import UiAction

from agent_runtimes.apps import sessions
from agent_runtimes.apps.callers import Caller, CallerRefused
from agent_runtimes.apps.loading import load_app
from agent_runtimes.apps.session import TextQuestion
from agent_runtimes.apps.visitors import NOTHING_KEPT
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)


class KindsVerifier:
    """Each token is a caller of the kind its name says."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        if token == "expired":
            raise CallerRefused(401, "The token has expired.")
        if token.startswith("visitor-"):
            return Caller(
                kind="visitor", uid=token, visit=f"visit-{token}", app_uid=app_uid
            )
        if token.startswith("embed-"):
            return Caller(
                kind="embed", uid=token, visit=f"visit-{token}", app_uid=app_uid
            )
        return Caller(kind="person", uid=token)


@pytest.fixture()
def kinds(runtime: Runtime, monkeypatch: pytest.MonkeyPatch) -> Iterator[Runtime]:  # noqa: F811 - the fixture
    monkeypatch.setattr(routes, "VERIFIER", KindsVerifier())
    # A visitor's token reaches the one application it names (R-30), checked
    # elsewhere: here every caller reaches the test's agent.
    monkeypatch.setattr(routes, "_reaches", lambda caller, agent: None)
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    yield runtime


def _open_as(uid: str, caller: Caller) -> sessions.LiveSession:
    """A session opened by a caller of any kind, held here."""
    return sessions.new_session(
        agent_id="notes-assistant",
        app=load_app(ASSISTANT),
        instance={"app_uid": "app-1", "version": 3},
        opened_by=caller,
        acts_as={"kind": "person", "uid": caller.uid},
        uid=uid,
        messages=[
            {"id": "m1", "role": "user", "content": "One"},
            {"id": "m2", "role": "assistant", "content": "ok"},
        ],
    )


OPERATIONS: Dict[str, Any] = {
    "clone": ("POST", "/clone", {}),
    "export": ("GET", "/export", None),
    "swap": ("POST", "/agent", {"agent": "example-harness-codex"}),
    "rename": ("PUT", "/title", {"title": "Mine"}),
    "end": ("POST", "/end", None),
    "resume": ("POST", "/resume", {}),
}


def _call(client: TestClient, uid: str, operation: str, token: str) -> Any:
    method, path, body = OPERATIONS[operation]
    return client.request(
        method, f"/api/v1/apps/sessions/{uid}{path}", headers=as_(token), json=body
    )


def test_a_strangers_operations_are_a_404_the_admin_included(
    kinds: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open_as("session-m001", Caller(kind="person", uid="ada"))
    for operation in OPERATIONS:
        for stranger in ("bob", "org-admin"):
            answer = _call(remote, "session-m001", operation, stranger)
            assert answer.status_code == 404, (operation, stranger, answer.text)
            assert answer.json()["detail"] == "No session session-m001 is held here."
    # The opener may: a clone, an export, a rename.
    assert _call(remote, "session-m001", "rename", "ada").status_code == 200
    assert _call(remote, "session-m001", "export", "ada").status_code == 200
    assert _call(remote, "session-m001", "clone", "ada").status_code == 201


def test_an_embeds_visitor_is_refused_clone_export_and_resume(
    kinds: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    live = _open_as(
        "session-m002",
        Caller(
            kind="visitor", uid="visitor-1", visit="visit-visitor-1", app_uid="app-1"
        ),
    )
    for operation in ("clone", "export"):
        answer = _call(remote, "session-m002", operation, "visitor-1")
        assert (answer.status_code, answer.json()["detail"]) == (404, NOTHING_KEPT), (
            operation
        )
    # Nothing is kept: once this runtime no longer holds it, a resume finds nothing.
    sessions._SESSIONS.pop("session-m002", None)
    answer = remote.post(
        "/api/v1/apps/sessions/session-m002/resume",
        headers=as_("visitor-1"),
        json={"agent": "notes-assistant"},
    )
    assert (answer.status_code, answer.json()["detail"]) == (404, NOTHING_KEPT)
    assert live.uid == "session-m002"
    # An embedded session's record names nobody who opened it: resumed only while held.
    sessions._SESSIONS.pop("session-m003", None)
    embed = remote.post(
        "/api/v1/apps/sessions/session-m003/resume",
        headers=as_("embed-1"),
        json={"agent": "notes-assistant"},
    )
    assert (embed.status_code, embed.json()["detail"]) == (
        404,
        "An embedded session is resumed only while this runtime holds it.",
    )


def test_the_first_answer_to_a_pending_question_wins(
    kinds: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    live = _open_as("session-m004", Caller(kind="person", uid="ada"))
    live.turn = "waiting"
    loop = asyncio.new_event_loop()
    try:
        live._question = TextQuestion(prompt="Which?")
        live._answer = loop.create_future()
        live._asked = sessions.QuestionShown.of("q-1", "m-1", live._question)
        first = UiAction(
            action="reactor.answer",
            display_id="q-1",
            payload={"value": "this one"},
            token="t",
        )
        stream = live._answered(first)
        assert stream is not None and live.turn == "running"
        second = remote.post(
            "/api/v1/apps/sessions/session-m004/messages",
            headers=as_("ada"),
            json={"text": "that one"},
        )
        assert (second.status_code, second.json()["detail"]) == (
            409,
            "Session session-m004 is answering: wait, or stop it.",
        )
    finally:
        loop.run_until_complete(live._close())
        loop.close()
