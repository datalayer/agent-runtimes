# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Signed-out sessions, on the visitors' runtime (plans/LOOP.md, R-30).

Through the real routes, in process, on agents made as the create route makes
them: one visitor never reads, drives or lists another's session on the same
runtime; a token reaches the one application it names; a person is refused
here and a visitor everywhere else; a visitor's turns are limited per day and
a session's life in minutes, each said in a sentence; a turn only reads,
calls its models with the visitor's own token, remembers nothing and keeps no
record; an application at its address is made here as ai-agents shows it to
somebody not signed in.
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterator, List, Optional, Tuple

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import callers, opening, visitors
from agent_runtimes.loop.apps.callers import Caller, CallerRefused
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.memory import NOT_SIGNED_IN, remember_for, withheld
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import ASK_FIRST, DO_IT
from agent_runtimes.loop.apps.visitors import (
    NOT_HERE,
    ONLY_VISITORS,
    OTHER_APPLICATION,
    AddressRefused,
    admit_turn,
    ensure_address_agent,
    path_answered,
    turn_api_key,
    use_address_resolver,
    use_turn_token,
    visitor_refusal,
)
from agent_runtimes.models.offered import InferenceTokenMissing
from agent_runtimes.routes import agents as agent_routes
from agent_runtimes.routes import apps as routes

# The in-process runtime the session API's tests run on (its `runtime` fixture).
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    answer_of,
    events_of,
    runtime,  # noqa: F401  (the fixture, registered under its own name)
)


class Visitors:
    """Each token is ``v:<visitor>:<app>``: what ai-inference would say of it."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        kind, _, rest = token.partition(":")
        if kind != "v":
            raise CallerRefused(403, ONLY_VISITORS)
        visitor, _, app = rest.partition(":")
        return Caller(kind="visitor", uid=visitor, app_uid=app)


@pytest.fixture()
def visitors_runtime(
    runtime: Runtime, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    monkeypatch.setenv(visitors.VISITORS_ENV, "notes-assistant")
    monkeypatch.setenv(visitors.TURNS_ENV, "3")
    monkeypatch.setattr(routes, "VERIFIER", Visitors())
    # Nothing to warm in process: the test makes its agents itself.
    monkeypatch.setattr(visitors, "warm", _nothing_to_warm)
    visitors.forget_turns()
    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        yield client
    visitors.forget_turns()


async def _nothing_to_warm(base_url: str, *, attempts: int = 60) -> List[str]:
    return []


def as_visitor(visitor: str, app: str = "notes-assistant") -> Dict[str, str]:
    return {"Authorization": f"Bearer v:{visitor}:{app}"}


def agui(thread: str, text: str = "Hello") -> Dict[str, Any]:
    return {
        "threadId": thread,
        "runId": f"run-{thread}",
        "state": None,
        "messages": [{"id": f"m-{thread}", "role": "user", "content": text}],
        "tools": [],
        "context": [],
    }


AGUI = "/api/v1/apps/agents/notes-assistant/ag-ui/"


def make_example(runtime: Runtime) -> Any:
    return runtime.make(
        "notes-assistant", ASSISTANT, {"visitor_app": "notes-assistant"}
    )


# --- isolation --------------------------------------------------------------------


def test_one_visitor_never_reaches_anothers_session_on_the_same_runtime(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_example(runtime)
    ada = events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json=agui("thread-ada", "My secret plan"),
        )
    )
    assert answer_of(ada)
    said = visitors_runtime.get(
        "/api/v1/apps/sessions/thread-ada", headers=as_visitor("tab-ada-0001")
    ).json()
    assert said["opened_by"] == {"kind": "visitor", "uid": "tab-ada-0001"}
    assert said["acts_as"] == {"kind": "visitor", "uid": "tab-ada-0001"}

    bob = as_visitor("tab-bob-0002")
    # Not read, not driven, not listed, not stopped: it is not said to exist.
    assert (
        visitors_runtime.get(
            "/api/v1/apps/sessions/thread-ada", headers=bob
        ).status_code
        == 404
    )
    assert (
        visitors_runtime.post(
            "/api/v1/apps/sessions/thread-ada/messages",
            headers=bob,
            json={"text": "What did they say?"},
        ).status_code
        == 404
    )
    assert (
        visitors_runtime.post(
            AGUI, headers=bob, json=agui("thread-ada", "Go on")
        ).status_code
        == 404
    )
    assert (
        visitors_runtime.post(
            "/api/v1/apps/sessions/thread-ada/stop", headers=bob
        ).status_code
        == 404
    )
    assert visitors_runtime.get("/api/v1/apps/sessions", headers=bob).json() == {
        "sessions": []
    }

    # Their own, on the same agent, apart.
    own = events_of(
        visitors_runtime.post(AGUI, headers=bob, json=agui("thread-bob", "Hi"))
    )
    assert "My secret plan" not in answer_of(own)
    listed = visitors_runtime.get(
        "/api/v1/apps/sessions", headers=as_visitor("tab-ada-0001")
    ).json()
    assert [entry["uid"] for entry in listed["sessions"]] == ["thread-ada"]


def test_a_token_reaches_the_one_application_it_names(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_example(runtime)
    other = as_visitor("tab-ada-0001", "web-research")
    refused = visitors_runtime.post(AGUI, headers=other, json=agui("thread-x"))
    assert refused.status_code == 403 and refused.json()["detail"] == OTHER_APPLICATION


def test_nobody_without_a_token_and_nobody_signed_in(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_example(runtime)
    nobody = visitors_runtime.post(AGUI, json=agui("thread-y"))
    assert nobody.status_code == 401 and nobody.json()["detail"] == visitors.NO_TOKEN
    person = visitors_runtime.post(
        AGUI, headers={"Authorization": "Bearer ada"}, json=agui("thread-z")
    )
    assert person.status_code == 403 and person.json()["detail"] == ONLY_VISITORS


def test_nothing_is_kept_so_nothing_is_resumed_or_judged(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_example(runtime)
    headers = as_visitor("tab-ada-0001")
    resumed = visitors_runtime.post(
        "/api/v1/apps/sessions/gone-0001/resume",
        headers=headers,
        json={"agent": "notes-assistant"},
    )
    assert (
        resumed.status_code == 404 and resumed.json()["detail"] == visitors.NOTHING_KEPT
    )
    recorder = AppRecorder(app=load_app(ASSISTANT))
    assert not recorder.kept("conversation") and not recorder.kept("feedback")


def test_only_the_application_routes_answer_anybody_but_itself(
    visitors_runtime: TestClient,
) -> None:
    assert path_answered("POST", "/api/v1/apps/agents/web-research/ag-ui/")
    assert path_answered("GET", "/api/v1/configure/models")
    assert path_answered("GET", "/health/ready")
    assert not path_answered("PUT", "/api/v1/configure/inference/provider")
    assert not path_answered("POST", "/api/v1/agents")
    made = visitors_runtime.post("/api/v1/agents", json={"name": "mine"})
    assert made.status_code == 404
    assert made.json()["detail"] == "This route of the visitors' runtime is its own."


# --- who it answers, on every runtime ----------------------------------------------


def _token(**claims: Any) -> str:
    return jwt.encode(
        {"exp": time.time() + 300, **claims}, "not-the-platforms", algorithm="HS256"
    )


def _verify(token: str) -> Caller:
    return asyncio.run(callers.CallerVerifier().verify(token))


def test_a_visitors_token_is_refused_by_any_other_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv(visitors.VISITORS_ENV, raising=False)
    with pytest.raises(CallerRefused) as refused:
        _verify(
            _token(
                sub="anonymous:j",
                aud=visitors.ANONYMOUS_AUDIENCE,
                visitor="tab-ada-0001",
            )
        )
    assert (refused.value.status, refused.value.reason) == (403, NOT_HERE)


def test_the_visitors_runtime_refuses_a_person_and_asks_ai_inference_for_a_visitor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(visitors.VISITORS_ENV, "web-research")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://inference.example")
    with pytest.raises(CallerRefused) as refused:
        _verify(_token(sub="u-ada"))
    assert (refused.value.status, refused.value.reason) == (403, ONLY_VISITORS)

    asked: List[str] = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url))
        if request.headers["authorization"].endswith("lapsed"):
            return httpx.Response(401, json={"detail": "no"})
        return httpx.Response(
            200,
            json={"visitor": "tab-ada-0001", "app": "web-research", "expires_in": 200},
        )

    real = httpx.AsyncClient
    monkeypatch.setattr(
        callers.httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(answer), **kwargs),
    )
    token = _token(sub="anonymous:j", aud=visitors.ANONYMOUS_AUDIENCE)
    caller = _verify(token)
    assert caller == Caller(kind="visitor", uid="tab-ada-0001", app_uid="web-research")
    assert asked == ["https://inference.example/api/ai-inference/v1/anonymous/whoami"]
    with pytest.raises(CallerRefused) as lapsed:
        _verify(_token(sub="anonymous:k", aud=visitors.ANONYMOUS_AUDIENCE) + "lapsed")
    assert lapsed.value.status == 401


# --- limits --------------------------------------------------------------------------


def test_a_visitor_has_so_many_turns_a_day_whatever_the_session(
    runtime: Runtime, visitors_runtime: TestClient
) -> None:
    make_example(runtime)
    ada = as_visitor("tab-ada-0001")
    for turn in range(3):
        thread = "thread-a" if turn < 2 else "thread-b"
        response = visitors_runtime.post(
            AGUI, headers=ada, json=agui(thread, f"Turn {turn}")
        )
        assert response.status_code == 200, response.text
        events_of(response)
    refused = visitors_runtime.post(
        AGUI, headers=ada, json=agui("thread-c", "One more")
    )
    assert refused.status_code == 429
    assert refused.json()["detail"] == (
        "You have taken today's 3 turns without an account: sign in to keep going, or come back tomorrow."
    )
    # Another visitor's are their own.
    assert (
        visitors_runtime.post(
            AGUI, headers=as_visitor("tab-bob-0002"), json=agui("thread-d")
        ).status_code
        == 200
    )


def test_a_session_lives_so_many_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(visitors.SESSION_MINUTES_ENV, "15")
    visitors.forget_turns()
    started = datetime.now(timezone.utc) - timedelta(minutes=16)
    assert admit_turn("tab-ada-0001", started.isoformat()) == (
        "This conversation without an account has had its 15 minutes: start a new one, or sign in to keep going."
    )
    assert admit_turn("tab-ada-0001", datetime.now(timezone.utc).isoformat()) == ""


def test_limits_that_are_not_numbers_are_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(visitors.TURNS_ENV, "many")
    with pytest.raises(ValueError, match="is not a whole number"):
        visitors.turns_a_day()
    monkeypatch.setenv(visitors.TURNS_ENV, "0")
    with pytest.raises(ValueError, match="is not a positive number"):
        visitors.turns_a_day()


# --- what a turn is given ----------------------------------------------------------


def test_a_visitors_turn_only_reads_and_asks_nobody() -> None:
    async def in_a_turn() -> Tuple[str, str, str, str]:
        use_turn_token("visitor-token")
        return (
            visitor_refusal("tavily_search", ("read",), DO_IT),
            visitor_refusal("send_mail", ("send",), DO_IT),
            visitor_refusal("lookup", ("read",), ASK_FIRST),
            visitor_refusal("mystery", (), DO_IT),
        )

    reads, sends, asks, unclassed = asyncio.run(in_a_turn())
    assert reads == ""
    assert sends == (
        "Without an account it only reads: `send_mail` would do more than read, so it asked nobody and did nothing."
    )
    assert (
        asks
        == "Without an account nobody is asked: `lookup` waits for a person, so it did nothing."
    )
    assert unclassed.startswith("Without an account it only reads")
    # Outside a visitor's turn, the rules alone decide.
    assert visitor_refusal("send_mail", ("send",), DO_IT) == ""


def test_its_models_are_called_with_the_visitors_token_and_nothing_else() -> None:
    async def outside() -> str:
        return await turn_api_key()

    with pytest.raises(InferenceTokenMissing):
        asyncio.run(outside())

    async def inside() -> str:
        use_turn_token("visitor-token")
        return await turn_api_key()

    assert asyncio.run(inside()) == "visitor-token"


def test_nothing_is_remembered_of_a_visitor() -> None:
    async def turn() -> str:
        remember_for(Caller(kind="visitor", uid="tab-ada-0001"), "visitor-token")
        return withheld()

    assert asyncio.run(turn()) == NOT_SIGNED_IN


# --- an application at its address -----------------------------------------------------


class Address:
    def __init__(self) -> None:
        self.version = 2
        self.opens = True
        self.made: List[Tuple[str, Optional[Dict[str, Any]]]] = []

    async def resolve(self, slug: str) -> Tuple[int, Dict[str, Any]]:
        if slug != "notes":
            return 404, {"detail": "No application is at this address."}
        return 200, {
            "visitor": True,
            "deployment": {"uid": "dep-1", "app_uid": "app-1", "version": self.version},
            "spec": ASSISTANT,
            "session": {
                "opens": self.opens,
                "reason": "" if self.opens else "Without an account it is not run.",
            },
        }

    async def make(self, name: str, body: Optional[Dict[str, Any]]) -> Tuple[int, str]:
        self.made.append((name, body))
        if body is None:
            agent_routes._agentspecs.pop(name, None)
        else:
            agent_routes._agentspecs[name] = {
                "app_spec": body["app_spec"],
                "app_instance": body["app_instance"],
            }
        return 200, ""


@pytest.fixture()
def address() -> Iterator[Address]:
    found = Address()
    use_address_resolver(found.resolve, found.make)
    yield found
    use_address_resolver()
    agent_routes._agentspecs.pop("at-notes", None)


def test_an_address_is_made_here_once_and_again_when_its_version_moves(
    address: Address,
) -> None:
    assert asyncio.run(ensure_address_agent("at:notes")) == "at-notes"
    assert asyncio.run(ensure_address_agent("at:notes")) == "at-notes"
    assert [(name, bool(body)) for name, body in address.made] == [("at-notes", True)]
    made = address.made[0][1] or {}
    assert made["app_instance"] == {
        "app_uid": "app-1",
        "deployment_uid": "dep-1",
        "version": 2,
        "visitor_app": "at:notes",
    }
    address.version = 3
    asyncio.run(ensure_address_agent("at:notes"))
    assert [(name, bool(body)) for name, body in address.made][1:] == [
        ("at-notes", False),
        ("at-notes", True),
    ]


def test_an_address_a_visitor_may_not_talk_to_is_refused_in_its_sentence(
    address: Address,
) -> None:
    address.opens = False
    with pytest.raises(AddressRefused) as refused:
        asyncio.run(ensure_address_agent("at:notes"))
    assert (refused.value.status, refused.value.reason) == (
        401,
        "Without an account it is not run.",
    )
    with pytest.raises(AddressRefused) as missing:
        asyncio.run(ensure_address_agent("at:elsewhere"))
    assert missing.value.status == 404


def test_a_visitor_is_let_in_to_a_deployment_as_nobody() -> None:
    asked: List[Tuple[str, str]] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        asked.append((deployment, bearer))
        return 200, ""

    opening.use_opener(opens)
    try:
        for visitor in ("tab-ada-0001", "tab-bob-0002"):
            asyncio.run(
                opening.ensure_may_open(
                    "dep-1", Caller(kind="visitor", uid=visitor), "visitor-token"
                )
            )
    finally:
        opening.use_opener(None)
    # Asked with no token, once for every visitor alike.
    assert asked == [("dep-1", "")]
