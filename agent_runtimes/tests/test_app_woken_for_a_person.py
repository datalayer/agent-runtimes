# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session woken for one person's own source reads it in their name (STUDIO W-03).

A message in a person's mailbox wakes a session nobody opened, run by the
scheduler on the owner's key. With that key IAM would list what the owner
let applications do, never the person's: so the scheduler mints the person's
token naming the application from their grant and gives it with the session
request (`X-Datalayer-Acting-Token`), and the runtime holds it where a
person's own session's token would be — every run of the session, Gmail and
the gateway's servers in the person's name alike, finds it through
`acting.acting_token` as any session does. Without it the session is
refused; a token of somebody else, from another grant, or ended too; a given
token that ends reaches nothing more in their name, and the owner's key is
never exchanged in its place.
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any, Dict, Iterator, List

import httpx
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import acting, principal, sessions
from agent_runtimes.mcp import google_workspace as gw
from agent_runtimes.models.models import remember_app_instance
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    answer_of,
    as_,
    events_of,
    remote,
    runtime,
)

DEPLOYMENT = {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2}
PERSON = "ada"
GRANT = "grant-1"
OWNER_KEY = "owner"

TRIAGE = {
    "schema": "loop.app/v1",
    "id": "inbox-triage",
    "name": "Inbox triage",
    "kind": "worker",
    "agent": "cog-crawler:0.0.1",
    "goal": "Sort what arrives.",
    "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
    "triggers": [
        {
            "type": "event",
            "event": "email_received",
            "prompt": "A message arrived: read it and sort it.",
        }
    ],
}


def token_of(person: str = PERSON, grant: str = GRANT, *, ends_in: float = 900) -> str:
    """A token as IAM mints it from a person's grant: its claims, unsigned here."""
    claims = {
        "sub": person,
        "app_uid": "app-1",
        "task_grant_uid": grant,
        "exp": int(time.time() + ends_in),
    }
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{payload}.signature"


def woken_for(person: str = PERSON, grant: str = GRANT) -> Dict[str, Any]:
    details = {"message_id": "m-1", "mailbox": "inbox@datalayer.io", "person": person}
    if grant:
        details["grant"] = grant
    return {
        "kind": "event",
        "event": "email_received",
        "details": details,
        "position": 0,
    }


@pytest.fixture(autouse=True)
def fresh() -> Iterator[None]:
    acting.forget_acting()
    gw.forget_tokens()
    yield
    acting.forget_acting()
    acting.use_iam(None)
    gw.forget_tokens()
    gw.use_iam(None)


@pytest.fixture()
def never_asked() -> List[str]:
    """IAM's acting routes, which a session given its token never reaches."""
    asked: List[str] = []

    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        asked.append(bearer)
        pytest.fail("IAM was asked with the owner's key in the person's place")

    acting.use_iam(ask)
    return asked


# --- the hold -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_token_given_is_the_one_the_session_acts_with(
    never_asked: List[str],
) -> None:
    token = token_of()
    acting.given("dep-1", OWNER_KEY, token, person=PERSON, grant=GRANT)
    assert await acting.acting_token("dep-1", OWNER_KEY) == token
    # Another deployment, or another bearer, holds nothing of it.
    assert acting.servers_in_users_name(None) == frozenset()
    assert never_asked == []


@pytest.mark.asyncio
async def test_a_token_given_that_ends_reaches_nothing_more_in_their_name(
    never_asked: List[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    token = token_of(ends_in=30)
    acting.given("dep-1", OWNER_KEY, token, person=PERSON, grant=GRANT)
    # Used until it ends: no margin, since nothing could be asked in its place.
    assert await acting.acting_token("dep-1", OWNER_KEY) == token
    now = time.time()
    monkeypatch.setattr(acting.time, "time", lambda: now + 60)
    assert await acting.acting_token("dep-1", OWNER_KEY) == ""
    assert never_asked == []


def test_a_token_not_the_persons_from_their_grant_or_ended_is_refused() -> None:
    with pytest.raises(ValueError, match="not ada's"):
        acting.given(
            "dep-1", OWNER_KEY, token_of(person="bob"), person=PERSON, grant=GRANT
        )
    with pytest.raises(ValueError, match="not minted from the grant"):
        acting.given(
            "dep-1", OWNER_KEY, token_of(grant="grant-2"), person=PERSON, grant=GRANT
        )
    with pytest.raises(ValueError, match="has ended"):
        acting.given(
            "dep-1", OWNER_KEY, token_of(ends_in=-5), person=PERSON, grant=GRANT
        )
    with pytest.raises(ValueError, match="not a token IAM minted"):
        acting.given(
            "dep-1", OWNER_KEY, "dla_a_temporary_key", person=PERSON, grant=GRANT
        )
    with pytest.raises(ValueError, match="deployment's session only"):
        acting.given("", OWNER_KEY, token_of(), person=PERSON)
    # Nothing held by a refusal.
    assert acting._HELD == {}


def test_whom_an_event_woke_the_session_for() -> None:
    assert acting.person_woken_for(woken_for()) == (PERSON, GRANT)
    assert acting.person_woken_for(woken_for(grant="")) == (PERSON, "")
    assert acting.person_woken_for({"kind": "schedule", "position": 1}) == ("", "")
    assert acting.person_woken_for(None) == ("", "")


# --- the route -------------------------------------------------------------------


@pytest.fixture()
def deployed(runtime: Runtime) -> Iterator[Runtime]:  # noqa: F811 - the fixture
    async def ask(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-7",
        }

    principal.use_asker(ask)
    principal.forget_principal_token("dep-1")
    runtime.make("inbox-triage", TRIAGE, DEPLOYMENT)
    remember_app_instance("inbox-triage", DEPLOYMENT)
    yield runtime
    principal.forget_principal_token("dep-1")
    remember_app_instance("inbox-triage", None)
    gw.remember_gmail_connection("inbox-triage", None)


def start(client: TestClient, woken_by: Dict[str, Any], **headers: str) -> Any:
    return client.post(
        "/api/v1/apps/sessions",
        headers={**as_(OWNER_KEY), **headers},
        json={
            "agent": "inbox-triage",
            **DEPLOYMENT,
            "opener": "A message arrived: read it and sort it.",
            "woken_by": woken_by,
            "session": "session-mail-01",
        },
    )


@pytest.mark.asyncio
async def test_a_session_woken_for_a_person_reads_in_their_name_with_the_token_given(
    deployed: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    never_asked: List[str],
) -> None:
    token = token_of()
    events = events_of(
        start(remote, woken_for(), **{acting.ACTING_TOKEN_HEADER: token})
    )
    assert "A message arrived" in answer_of(events)
    live = sessions.session_of("session-mail-01")
    assert live is not None
    # It runs as the application's principal, as any woken session does (I-03)...
    assert live.describe()["acts_as"]["kind"] == "principal"
    # ...and its runs find the person's token where a person's own session's
    # would be: keyed on the request's bearer, the owner's key.
    assert await acting.acting_token("dep-1", OWNER_KEY) == token
    # The one path: the Gmail toolset, in the user's name, asks IAM with it.
    gw.remember_gmail_connection(
        "inbox-triage",
        [type("C", (), {"server": "google-workspace", "acts_as": "user"})()],
    )
    asked: List[str] = []

    async def mint(bearer: str) -> Dict[str, Any]:
        asked.append(bearer)
        return {"access_token": "ya29.for-adas-mailbox", "expires_in": 3599}

    gw.use_iam(mint)
    assert (
        await gw.gmail_access_token("inbox-triage", OWNER_KEY)
        == "ya29.for-adas-mailbox"
    )
    assert asked == [token]
    assert never_asked == []


def test_a_session_woken_for_a_person_without_their_token_is_refused(
    deployed: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    never_asked: List[str],
) -> None:
    refused = start(remote, woken_for())
    assert refused.status_code == 422, refused.text
    assert (
        "woken for the source of ada and carries no token of theirs"
        in refused.json()["detail"]
    )
    assert sessions.session_of("session-mail-01") is None
    # Somebody else's token, or one from another grant, or ended: refused too.
    for wrong, said in (
        (token_of(person="bob"), "not ada's"),
        (token_of(grant="grant-9"), "not minted from the grant"),
        (token_of(ends_in=-1), "has ended"),
        ("owner", "not a token IAM minted"),
    ):
        refused = start(remote, woken_for(), **{acting.ACTING_TOKEN_HEADER: wrong})
        assert refused.status_code == 422, refused.text
        assert said in refused.json()["detail"]
    assert sessions.session_of("session-mail-01") is None
    assert acting._HELD == {}
    assert never_asked == []


def test_a_token_given_to_a_session_not_woken_for_a_person_is_refused(
    deployed: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    refused = start(
        remote,
        {
            "kind": "event",
            "event": "email_received",
            "details": {"message_id": "m-1"},
            "position": 0,
        },
        **{acting.ACTING_TOKEN_HEADER: token_of()},
    )
    assert refused.status_code == 422, refused.text
    assert (
        "given only to a session woken for the person it names"
        in refused.json()["detail"]
    )
    assert acting._HELD == {}


# --- what the scheduler sends ------------------------------------------------------


def test_the_scheduler_s_start_session_sends_the_token_with_the_session_request_only() -> (
    None
):
    from agent_runtimes.loop.apps.deployments import start_session

    seen: List[tuple[str, str]] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(
            (
                request.url.path.rsplit("/api/v1/", 1)[1],
                request.headers.get(acting.ACTING_TOKEN_HEADER, ""),
            )
        )
        if request.url.path.endswith("/api/v1/agents"):
            return httpx.Response(200, json={"id": "inbox-triage"})
        assert request.headers["authorization"] == f"Bearer {OWNER_KEY}"
        stream = (
            'data: {"type": "CUSTOM", "name": "loop.session", "value": {"uid": "s-1"}}\n\n'
            'data: {"type": "RUN_FINISHED"}\n\n'
        )
        return httpx.Response(
            200, content=stream.encode(), headers={"content-type": "text/event-stream"}
        )

    token = token_of()
    started = start_session(
        ingress="https://r1.example/jupyter/server/rt-1",
        token=OWNER_KEY,
        payload={
            "name": "inbox-triage",
            "transport": "ag-ui",
            "app_instance": {**DEPLOYMENT, "woken_by": woken_for()},
        },
        prompt="A message arrived.",
        client=httpx.Client(transport=httpx.MockTransport(handle)),
        acting_token=token,
    )
    assert started["session_uid"] == "s-1"
    assert started["result"]["status"] == "completed"
    # With the agent's creation, nothing; with the session request, the token.
    assert seen == [("agents", ""), ("apps/sessions", token)]
