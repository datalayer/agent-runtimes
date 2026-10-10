# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who the user is, when it matters (LOOP D-21).

An embedded application whose Appspec says `deployment.embedded.host.user:
signed` opens a session only for a user the host's server signed: a token,
HS256 with the deployment's secret, naming `sub`, `name` and `exp` at most an
hour away. Verified where the session opens, with the secret given to the
runtime; refused in a sentence without it (401), with a bad one (403), or on
a runtime not given the secret (503). The user it names is the session's:
what `host_context` answers as `user`, whoever the page says, and who a page
it saves was written for.
"""

import json
import time
from typing import Any, Dict, Iterator, List

import jwt
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import host_user, sessions
from agent_runtimes.loop.apps.host_user import (
    HostUser,
    UserNotSigned,
    secret_variable,
    signed_host_context,
    use_user_secret,
    verify_host_user,
)
from agent_runtimes.loop.apps.saving import authorship, byline
from agent_runtimes.tests import test_app_embed_sessions as embeds
from agent_runtimes.tests import test_app_sessions as base
from agent_runtimes.tests.test_app_sessions import ASSISTANT, Runtime, as_, events_of

runtime = base.runtime
remote = base.remote
embedded = embeds.embedded

DEPLOYED = embeds.DEPLOYED

#: Not a secret of anybody's: the tests' own.
SECRET = "test-only-deployment-secret-0123456789abcdef"

SIGNED_APP: Dict[str, Any] = {
    **ASSISTANT,
    "deployment": {
        "embedded": {"host": {"context": ["user", "page"], "user": "signed"}}
    },
    "rules": [
        {
            "action": "Read what the page says",
            "applies_to": "host_context",
            "behaviour": "do_it",
        }
    ],
}


def signed(secret: str = SECRET, *, algorithm: str = "HS256", **claims: Any) -> str:
    said = {
        "sub": "cust-42",
        "name": "Ana Lopez",
        "exp": int(time.time()) + 600,
        **claims,
    }
    return jwt.encode(
        {k: v for k, v in said.items() if v is not None}, secret, algorithm=algorithm
    )


@pytest.fixture()
def secret() -> Iterator[str]:
    use_user_secret("dep-1", SECRET)
    yield SECRET
    use_user_secret("dep-1", None)


# --- the token ------------------------------------------------------------------


def test_a_token_the_host_signed_names_its_user() -> None:
    assert verify_host_user(signed(), SECRET) == HostUser(
        sub="cust-42", name="Ana Lopez"
    )
    # Any audience it names is the host's business.
    assert verify_host_user(signed(aud="shop"), SECRET).sub == "cust-42"


@pytest.mark.parametrize(
    ("token", "said"),
    [
        (
            lambda: signed("another-secret-of-somebody-else-0123456789"),
            "not signed with this deployment's secret",
        ),
        (lambda: signed(algorithm="HS512"), "only HS256"),
        (
            lambda: jwt.encode(
                {"sub": "x", "name": "y", "exp": int(time.time()) + 60},
                None,
                algorithm="none",
            ),
            "only HS256",
        ),
        (lambda: signed(exp=int(time.time()) - 120), "has expired"),
        (lambda: signed(exp=int(time.time()) + 7200), "longer than an hour"),
        (lambda: signed(exp=None), "says no exp"),
        (lambda: signed(sub=None), "says no sub"),
        (lambda: signed(sub="  "), "says no sub"),
        (lambda: signed(name=None), "says no name"),
        (lambda: "not-a-token", "not a token"),
    ],
)
def test_a_token_that_is_not_one_is_refused_in_a_sentence(
    token: Any, said: str
) -> None:
    with pytest.raises(UserNotSigned) as refused:
        verify_host_user(token(), SECRET)
    assert refused.value.status == 403
    assert said in refused.value.reason


def test_the_secret_arrives_in_a_variable_named_by_its_deployment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert secret_variable("01jz-dep.1") == "DATALAYER_APP_USER_SECRET_01JZ_DEP_1"
    with pytest.raises(ValueError):
        secret_variable(" ")
    monkeypatch.setenv(secret_variable("dep-9"), SECRET)
    assert host_user._secret_of("dep-9") == SECRET


# --- what host_context answers ---------------------------------------------------


def _answered(content: Any) -> List[Dict[str, Any]]:
    return [
        {"id": "u1", "role": "user", "content": "Who am I?"},
        {
            "id": "a1",
            "role": "assistant",
            "content": "",
            "toolCalls": [
                {
                    "id": "c1",
                    "type": "function",
                    "function": {"name": "host_context", "arguments": "{}"},
                }
            ],
        },
        {"id": "t1", "role": "tool", "toolCallId": "c1", "content": content},
    ]


def test_host_context_answers_the_signed_user_whoever_the_page_says() -> None:
    ana = HostUser(sub="cust-42", name="Ana Lopez")
    page = json.dumps({"values": {"user": "admin", "page": "/orders"}})
    told = json.loads(signed_host_context(_answered(page), ana)[2]["content"])
    assert told == {
        "values": {
            "user": {"sub": "cust-42", "name": "Ana Lopez", "signed": True},
            "page": "/orders",
        }
    }
    # Unsaid by the page, still said; a page that answered nothing readable too.
    unsaid = json.dumps({"values": {}, "unsaid": ["user", "page"]})
    assert json.loads(signed_host_context(_answered(unsaid), ana)[2]["content"]) == {
        "values": {"user": {"sub": "cust-42", "name": "Ana Lopez", "signed": True}},
        "unsaid": ["page"],
    }
    assert (
        json.loads(signed_host_context(_answered("<html>"), ana)[2]["content"])[
            "values"
        ]["user"]["sub"]
        == "cust-42"
    )
    # Without a signed user, what came is left as it came.
    assert signed_host_context(_answered(page), None) == _answered(page)


# --- who wrote what it saves (I-10) ----------------------------------------------


def test_what_it_saves_says_the_signed_user_it_wrote_for() -> None:
    from agent_runtimes.loop.apps.loading import load_app

    app = load_app(SIGNED_APP)
    about = authorship(
        app,
        app_uid="app-1",
        deployment_uid="dep-1",
        person_uid="",
        on_its_own=False,
        session="s-1",
        user={"sub": "cust-42", "name": "Ana Lopez"},
    )
    assert about["for_user"] == {"sub": "cust-42", "name": "Ana Lopez"}
    assert "for_user" not in authorship(
        app,
        app_uid="app-1",
        deployment_uid="dep-1",
        person_uid="",
        on_its_own=False,
        session="s-1",
    )
    face = f"{app.emoji} " if app.emoji else ""
    assert (
        byline(app, on_its_own=False, for_name="Ana Lopez")
        == f"*Written by {face}Notes Assistant, for Ana Lopez.*"
    )
    assert byline(app, on_its_own=False) == f"*Written by {face}Notes Assistant.*"
    # On its own, nobody it wrote for.
    assert (
        byline(app, on_its_own=True, for_name="Ana Lopez")
        == f"*Written by {face}Notes Assistant, on its own.*"
    )


# --- where the session opens ------------------------------------------------------


def start(remote: TestClient, session: str, **body: Any) -> Any:
    return embeds.start(remote, "embed:visit-a", session, **body)


def test_without_a_signed_user_no_session_is_opened(
    runtime: Runtime, remote: TestClient, embedded: Any, secret: str
) -> None:
    runtime.make("notes-assistant", SIGNED_APP, DEPLOYED)
    unsigned = start(remote, "session-none")
    assert unsigned.status_code == 401
    assert unsigned.json()["detail"] == (
        "Notes Assistant acts in the name of each of its users: the page hands over a token "
        "its server signed naming the user (user-token), and none was sent."
    )
    bad = start(
        remote,
        "session-bad",
        user_token=signed("another-secret-of-somebody-else-0123456789"),
    )
    assert bad.status_code == 403
    assert "not signed with this deployment's secret" in bad.json()["detail"]
    assert sessions.session_of("session-none") is None
    assert sessions.session_of("session-bad") is None


def test_a_runtime_not_given_the_secret_says_so(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", SIGNED_APP, DEPLOYED)
    refused = start(remote, "session-nosecret", user_token=signed())
    assert refused.status_code == 503
    assert "DATALAYER_APP_USER_SECRET_DEP_1" in refused.json()["detail"]
    # The secret is named, never said.
    assert SECRET not in refused.text


def test_the_signed_user_is_the_sessions(
    runtime: Runtime, remote: TestClient, embedded: Any, secret: str
) -> None:
    runtime.make("notes-assistant", SIGNED_APP, DEPLOYED)
    started = events_of(start(remote, "session-ana1", user_token=signed()))
    assert started[0]["value"]["user"] == {
        "sub": "cust-42",
        "name": "Ana Lopez",
        "signed": True,
    }
    live = sessions.session_of("session-ana1")
    assert live is not None and live.user_id == "cust-42"
    assert live.recorder.signed_user("session-ana1") == {
        "sub": "cust-42",
        "name": "Ana Lopez",
    }
    # Verified as it opened: the same visit goes on with it.
    described = remote.get(
        "/api/v1/apps/sessions/session-ana1", headers=as_("embed:visit-a")
    )
    assert described.json()["user"]["name"] == "Ana Lopez"


def test_an_application_that_takes_what_the_page_says_needs_no_token(
    runtime: Runtime, remote: TestClient, embedded: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    started = events_of(start(remote, "session-free", user_token="whatever"))
    assert started[0]["value"]["user"] is None


def test_over_ag_ui_the_token_goes_with_the_run_and_host_context_says_its_user(
    runtime: Runtime,
    remote: TestClient,
    embedded: Any,
    secret: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime.make("notes-assistant", SIGNED_APP, DEPLOYED)
    forwarded: List[Dict[str, Any]] = []

    async def forward(
        self: Any, body: Dict[str, Any], *, bearer: str, instructions: str = ""
    ) -> None:
        forwarded.append(body)

    monkeypatch.setattr(sessions.LiveSession, "forward", forward)
    run: Dict[str, Any] = {
        "threadId": "thread-ana-0001",
        "runId": "run-1",
        "state": None,
        "messages": _answered(json.dumps({"values": {"user": "admin"}})),
        "tools": [],
        "context": [],
        "forwardedProps": {"loop": {}},
    }
    url = "/api/v1/apps/agents/notes-assistant/ag-ui/"
    refused = remote.post(url, headers=as_("embed:visit-a"), json=run)
    assert refused.status_code == 401
    run["forwardedProps"] = {"loop": {"user_token": signed()}}
    accepted = remote.post(url, headers=as_("embed:visit-a"), json=run)
    assert accepted.status_code == 200, accepted.text
    told = json.loads(forwarded[-1]["messages"][2]["content"])
    assert told["values"]["user"] == {
        "sub": "cust-42",
        "name": "Ana Lopez",
        "signed": True,
    }
    # The token is the runtime's to read, never the agent's.
    assert "user_token" not in json.dumps(forwarded[-1].get("forwardedProps") or {})
    wrong = remote.post(
        url,
        headers=as_("embed:visit-a"),
        json={
            **run,
            "threadId": "thread-ana-0002",
            "forwardedProps": {"loop": {"user_token": 7}},
        },
    )
    assert wrong.status_code == 422


def test_a_session_woken_by_a_schedule_or_a_preview_has_nobody_to_sign(
    secret: str,
) -> None:
    from agent_runtimes.loop.apps.loading import load_app

    app = load_app(SIGNED_APP)
    assert host_user.host_user_of(app, DEPLOYED, "", woken=True) is None
    # A Preview is its owner's: nobody signs for it.
    assert host_user.host_user_of(app, {"app_uid": "app-1"}, "") is None
    with pytest.raises(UserNotSigned):
        host_user.host_user_of(app, DEPLOYED, "")


def test_nothing_of_the_token_is_kept(
    runtime: Runtime, remote: TestClient, embedded: Any, secret: str
) -> None:
    runtime.make("notes-assistant", SIGNED_APP, DEPLOYED)
    token = signed()
    events_of(start(remote, "session-ana2", user_token=token))
    assert token not in json.dumps(runtime.records)
    assert token not in json.dumps(sessions.session_of("session-ana2").describe())  # type: ignore[union-attr]
