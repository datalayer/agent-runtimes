# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An embed token runs a session, and nothing beyond (LOOP R-20).

The app embed token reads one application and asks its decisions; it now also
runs a session of that application's deployment — as its principal, never in
its owner's name — when it names the `session` scope. Each visit of the host's
page is apart: one visitor never reaches another's session. It never opens a
Preview, is never resumed from a record that names nobody, remembers nothing,
configures nothing, and its turns only read, as a visitor's.
"""

from typing import Any, Dict, Iterator, List, Tuple

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import opening, principal
from agent_runtimes.loop.apps.callers import Caller, CallerRefused
from agent_runtimes.loop.apps.visitors import in_visitor_turn
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests import test_app_sessions as base
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    Said,
    as_,
    events_of,
)

# The session API's own fixtures: an agent made as the platform makes one,
# and a client that is not the machine itself.
runtime = base.runtime
remote = base.remote

DEPLOYED = {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2}


class EmbedVerifier:
    """`embed:<visit>` is a visit of the owner's embed for app-1; the rest, people."""

    def __init__(self) -> None:
        self.asked_for: List[str] = []

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        if not token.startswith(("embed:", "embed-old:")):
            return Caller(kind="person", uid=token)
        self.asked_for.append(app_uid)
        if app_uid != "app-1":
            raise CallerRefused(403, "The embed token is for another application.")
        old = token.startswith("embed-old:")
        return Caller(
            kind="embed",
            uid="owner",
            app_uid=app_uid,
            visit=token.split(":", 1)[1],
            scopes=("read", "decide") if old else ("read", "decide", "session"),
        )


class Watching(Said):
    """A model that also says whether the turn was a visitor's: read only."""

    def __init__(self) -> None:
        super().__init__()
        self.read_only: List[bool] = []

    def said(self, messages: Any) -> str:
        self.read_only.append(in_visitor_turn())
        return super().said(messages)


@pytest.fixture()
def embedded(
    runtime: Runtime, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Tuple[EmbedVerifier, List[Tuple[str, str]]]]:
    verifier = EmbedVerifier()
    monkeypatch.setattr(routes, "VERIFIER", verifier)
    asked: List[Tuple[str, str]] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        asked.append((deployment, bearer))
        return 200, ""

    async def token(deployment: str, bearer: str) -> Dict[str, Any]:
        return {"access_token": "p-token", "expires_in": 3600, "principal_uid": "p-7"}

    opening.use_opener(opens)
    principal.use_asker(token)
    principal.forget_principal_token("dep-1")
    yield verifier, asked
    principal.forget_principal_token("dep-1")


def start(remote: TestClient, who: str, session: str, **body: Any) -> Any:
    return remote.post(
        "/api/v1/apps/sessions",
        headers=as_(who),
        json={
            "agent": "notes-assistant",
            "deployment_uid": "dep-1",
            "session": session,
            "opener": "Hello",
            **body,
        },
    )


def test_an_embed_runs_a_session_of_its_deployment_as_its_principal(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    verifier, asked = embedded
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    model = Watching()
    runtime.models["notes-assistant"].said = model.said  # type: ignore[method-assign]
    started = events_of(start(remote, "embed:visit-a", "session-visa"))
    said = started[0]["value"]
    assert said["acts_as"] == {
        "kind": "principal",
        "uid": "p-7",
        "deployment_uid": "dep-1",
    }
    # Checked against the application as the platform knows it, and let in
    # by ai-agents with the embed token itself.
    assert verifier.asked_for == ["app-1"]
    assert asked == [("dep-1", "embed:visit-a")]
    # Its visitor is nobody known: its turn only reads, and nobody is named
    # as having opened it (R-31).
    assert model.read_only == [True]
    assert {b["opened_by"] for b in runtime.records} == {""}


def test_one_visit_never_reaches_anothers_session(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    events_of(start(remote, "embed:visit-a", "session-visa"))
    other = as_("embed:visit-b")
    assert (
        remote.get("/api/v1/apps/sessions/session-visa", headers=other).status_code
        == 404
    )
    assert (
        remote.post(
            "/api/v1/apps/sessions/session-visa/messages",
            headers=other,
            json={"text": "What did they ask?"},
        ).status_code
        == 404
    )
    listed = remote.get("/api/v1/apps/sessions", headers=other)
    assert listed.status_code != 200 or listed.json()["sessions"] == []
    # The same visit, with a renewed token for it, goes on.
    again = remote.post(
        "/api/v1/apps/sessions/session-visa/messages",
        headers=as_("embed:visit-a"),
        json={"text": "And then?"},
    )
    assert again.status_code == 200


def test_an_embed_never_opens_a_preview(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 2})
    refused = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("embed:visit-a"),
        json={"agent": "notes-assistant", "opener": "Hello"},
    )
    assert refused.status_code == 403
    assert refused.json()["detail"] == (
        "An embed token runs its application as it is deployed, not a Preview."
    )


def test_a_token_that_does_not_name_sessions_runs_none(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    refused = start(remote, "embed-old:visit-a", "session-olda")
    assert refused.status_code == 403
    assert "does not run a session" in refused.json()["detail"]


def test_an_embed_reaches_nothing_beyond_its_session(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    embed = as_("embed:visit-a")
    # Not resumed from a record that names nobody.
    resumed = remote.post(
        "/api/v1/apps/sessions/session-gone/resume",
        headers=embed,
        json={"agent": "notes-assistant"},
    )
    assert resumed.status_code == 404
    assert "only while this runtime holds it" in resumed.json()["detail"]
    # What it remembers is each person's, and an embed's visitor is nobody's.
    assert (
        remote.get("/api/v1/apps/memories/notes-assistant", headers=embed).status_code
        == 403
    )
    # It configures nothing, and lists no applications.
    assert remote.get("/api/v1/apps", headers=embed).status_code == 403


def test_the_page_an_embed_is_on_is_said_to_ai_agents(
    runtime: Runtime,
    remote: TestClient,
    embedded: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """ai-agents opens an embed's session only for a page of a site its
    owner allows it on (LOOP D-12): the runtime says the page's origin, as
    the visitor's browser sent it, and each page is asked about apart."""
    monkeypatch.setenv(
        "AGENT_RUNTIMES_APP_ORIGINS", "https://host.example,https://other.example"
    )
    said: List[Dict[str, str]] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        said.append(opening.page_origin_headers())
        if opening.PAGE_ORIGIN.get() == "https://other.example":
            return (
                403,
                "It is not embedded on https://other.example: its owner allows it on https://host.example only.",
            )
        return 200, ""

    opening.use_opener(opens)
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    on_host = remote.post(
        "/api/v1/apps/sessions",
        headers={**as_("embed:visit-a"), "Origin": "https://host.example"},
        json={
            "agent": "notes-assistant",
            "deployment_uid": "dep-1",
            "session": "session-host",
            "opener": "Hello",
        },
    )
    assert on_host.status_code == 200, on_host.text
    elsewhere = remote.post(
        "/api/v1/apps/sessions",
        headers={**as_("embed:visit-a"), "Origin": "https://other.example"},
        json={
            "agent": "notes-assistant",
            "deployment_uid": "dep-1",
            "session": "session-other",
            "opener": "Hello",
        },
    )
    assert elsewhere.status_code == 403
    assert "not embedded on https://other.example" in elsewhere.json()["detail"]
    assert said == [
        {"X-Datalayer-Embed-Origin": "https://host.example"},
        {"X-Datalayer-Embed-Origin": "https://other.example"},
    ]


def test_a_visit_reads_its_thread_again_after_a_reload(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    """The page reloaded asks for its session's conversation with a token
    renewed for the same visit, and draws it again (LOOP D-13); another
    visit, or a session the runtime let go, is told nothing is there."""
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    events_of(start(remote, "embed:visit-a", "session-visa"))
    thread = remote.get(
        "/api/v1/apps/sessions/session-visa/messages", headers=as_("embed:visit-a")
    )
    assert thread.status_code == 200, thread.text
    body = thread.json()
    assert body["uid"] == "session-visa"
    roles = [message["role"] for message in body["messages"]]
    assert roles[0] == "user" and "assistant" in roles
    assert body["messages"][0]["content"].startswith("Hello")
    assert all(message["id"] for message in body["messages"])
    other = remote.get(
        "/api/v1/apps/sessions/session-visa/messages", headers=as_("embed:visit-b")
    )
    assert other.status_code == 404
    gone = remote.get(
        "/api/v1/apps/sessions/session-gone/messages", headers=as_("embed:visit-a")
    )
    assert gone.status_code == 404
