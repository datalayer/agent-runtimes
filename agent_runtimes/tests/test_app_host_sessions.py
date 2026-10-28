# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A host's turns: its person, its deployment, each turn once.

A host — Datalayer's Slack app, an editor, a desktop app — runs a session with
the host token ai-agents exchanged for its installation's key and a linked
user: the session runs the one deployment the token was issued for, as its
principal, and is recorded as opened by the person. A host delivers what its
users say at least once: the same external event, or the same
`Idempotency-Key`, answers the original session and turn and runs nothing;
the same key with another request is refused. Verified by asking ai-agents
(`/apps/hosts/whoami`), remembered a minute at most.
"""

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Tuple

import httpx
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps import callers, external_turns, opening, principal
from agent_runtimes.apps.callers import Caller, CallerRefused, CallerVerifier
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests import test_app_sessions as base
from agent_runtimes.tests.test_app_sessions import ASSISTANT, Runtime, as_, events_of

runtime = base.runtime
remote = base.remote

DEPLOYED = {"app_uid": "app-1", "deployment_uid": "dep-1", "version": 2}


class HostVerifier:
    """`host:<person>:<deployment>` is a host token of installation inst-1; the rest, people."""

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        if not token.startswith("host:"):
            return Caller(kind="person", uid=token)
        _, person, deployment = token.split(":")
        return Caller(
            kind="host",
            uid=person,
            app_uid="app-1",
            visit="inst-1",
            scopes=("session", "decide"),
            deployment_uid=deployment,
        )


@pytest.fixture()
def hosted(
    runtime: Runtime, monkeypatch: pytest.MonkeyPatch
) -> Iterator[List[Tuple[str, str]]]:
    monkeypatch.setattr(routes, "VERIFIER", HostVerifier())
    asked: List[Tuple[str, str]] = []

    async def opens(deployment: str, bearer: str) -> Tuple[int, str]:
        asked.append((deployment, bearer))
        return 200, ""

    async def token(deployment: str, bearer: str) -> Dict[str, Any]:
        return {"access_token": "p-token", "expires_in": 3600, "principal_uid": "p-7"}

    opening.use_opener(opens)
    principal.use_asker(token)
    principal.forget_principal_token("dep-1")
    external_turns.forget()
    yield asked
    external_turns.forget()
    principal.forget_principal_token("dep-1")


def _start(
    remote: TestClient,
    who: str,
    session: str,
    headers: Dict[str, str] | None = None,
    **body: Any,
) -> Any:
    return remote.post(
        "/api/v1/apps/sessions",
        headers={**as_(who), **(headers or {})},
        json={
            "agent": "notes-assistant",
            "deployment_uid": "dep-1",
            "session": session,
            "opener": "Hello",
            **body,
        },
    )


def _turn(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    [found] = [
        e["value"]
        for e in events
        if e.get("type") == "CUSTOM" and e.get("name") == "loop.turn"
    ]
    return found


def test_a_host_runs_its_deployment_as_its_principal_recorded_as_its_person(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    started = events_of(_start(remote, "host:alice:dep-1", "slack-thread-0001"))
    said = started[0]["value"]
    assert said["acts_as"] == {
        "kind": "principal",
        "uid": "p-7",
        "deployment_uid": "dep-1",
    }
    assert said["opened_by"] == {"kind": "host", "uid": "alice"}
    # Let in by ai-agents with the host token itself.
    assert hosted == [("dep-1", "host:alice:dep-1")]
    assert {b["opened_by"] for b in runtime.records} == {"alice"}
    # Its person opens it on the web, signed in as themselves (Open in
    # Datalayer, S-305), its messages read; nobody else does.
    held = remote.get(
        "/api/v1/apps/sessions/slack-thread-0001/messages", headers=as_("alice")
    )
    assert held.status_code == 200
    assert any(
        m.get("role") == "user" and "Hello" in str(m.get("content"))
        for m in held.json()["messages"]
    )
    assert (
        remote.get(
            "/api/v1/apps/sessions/slack-thread-0001", headers=as_("alice")
        ).status_code
        == 200
    )
    for other in ("bob", "host:bob:dep-1"):
        assert (
            remote.get(
                "/api/v1/apps/sessions/slack-thread-0001/messages",
                headers=as_(other),
            ).status_code
            == 404
        )
    assert (
        remote.get(
            "/api/v1/apps/sessions/slack-thread-0001", headers=as_("host:alice:dep-1")
        ).status_code
        == 200
    )


def test_a_host_token_runs_no_other_deployment_and_no_preview(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    refused = _start(remote, "host:alice:dep-2", "slack-thread-0002")
    assert refused.status_code == 403 and "issued for" in refused.json()["detail"]
    runtime.make("preview-assistant", ASSISTANT, {"app_uid": "app-1", "version": 2})
    refused = remote.post(
        "/api/v1/apps/sessions",
        headers=as_("host:alice:dep-1"),
        json={"agent": "preview-assistant", "opener": "Hello"},
    )
    assert refused.status_code == 403


def test_the_same_external_event_runs_once_and_answers_the_original_turn(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    first = events_of(
        _start(
            remote, "host:alice:dep-1", "slack-thread-0003", external_event_id="Ev01"
        )
    )
    turn = _turn(first)
    assert turn["replayed"] is False and turn["external_event_id"] == "Ev01"
    assert turn["session"] == "slack-thread-0003"
    again = events_of(
        _start(
            remote, "host:alice:dep-1", "slack-thread-0003", external_event_id="Ev01"
        )
    )
    replayed = _turn(again)
    assert (replayed["turn"], replayed["replayed"], replayed["state"]) == (
        turn["turn"],
        True,
        "finished",
    )
    assert [e["type"] for e in again] == ["CUSTOM", "CUSTOM"]
    assert len(model.prompts) == 1 and model.prompts[0].startswith("Hello")
    # The same id with another request is refused; nothing runs.
    conflict = _start(
        remote,
        "host:alice:dep-1",
        "slack-thread-0003",
        external_event_id="Ev01",
        opener="Other",
    )
    assert conflict.status_code == 409
    # Another caller's same id is its own turn.
    other = events_of(
        _start(remote, "host:bob:dep-1", "slack-thread-0004", external_event_id="Ev01")
    )
    assert _turn(other)["replayed"] is False


def test_a_message_retried_under_its_idempotency_key_runs_once(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    events_of(_start(remote, "host:alice:dep-1", "slack-thread-0005"))
    send = lambda text, key: remote.post(  # noqa: E731
        "/api/v1/apps/sessions/slack-thread-0005/messages",
        headers={**as_("host:alice:dep-1"), "Idempotency-Key": key},
        json={"text": text, "external_event_id": "Ev02"},
    )
    first = _turn(events_of(send("And the costs?", "k-1")))
    again = _turn(events_of(send("And the costs?", "k-1")))
    assert again["turn"] == first["turn"] and again["replayed"] is True
    assert len(model.prompts) == 2 and model.prompts[1].startswith("And the costs?")
    assert send("Something else", "k-1").status_code == 409
    assert _turn(events_of(send("Something else", "k-2")))["replayed"] is False


def test_a_turn_refused_before_it_ran_is_not_remembered(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    events_of(_start(remote, "host:alice:dep-1", "slack-thread-0006"))
    send = lambda text: remote.post(  # noqa: E731
        "/api/v1/apps/sessions/slack-thread-0006/messages",
        headers=as_("host:alice:dep-1"),
        json={"text": text, "external_event_id": "Ev03"},
    )
    assert send("   ").status_code == 422
    assert _turn(events_of(send("   x")))["replayed"] is False


def test_the_turns_are_held_for_a_day() -> None:
    external_turns.forget()
    who = Caller(kind="host", uid="alice", visit="inst-1")
    key = external_turns.key_of(who, "", "Ev04")
    assert (
        key
        and external_turns.key_of(
            Caller(kind="host", uid="alice", visit="inst-2"), "", "Ev04"
        )
        != key
    )
    turn, again = external_turns.claim(
        key, request={"a": 1}, session_uid="s", external_event_id="Ev04", now=0
    )
    assert again is False
    assert (
        external_turns.peek(key, request={"a": 1}, now=external_turns.TTL_SECONDS - 1)
        is turn
    )
    assert (
        external_turns.peek(key, request={"a": 1}, now=external_turns.TTL_SECONDS + 1)
        is None
    )
    assert external_turns.key_of(who, "", "") is None


# --- the runtime asks ai-agents whether a host token stands ---------------------------------


def _ai_agents(
    monkeypatch: pytest.MonkeyPatch, answer: Tuple[int, Dict[str, Any]]
) -> List[httpx.Request]:
    asked: List[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        return httpx.Response(answer[0], json=answer[1])

    real = httpx.AsyncClient
    monkeypatch.setattr(
        callers.httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(handle)),
    )
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.example")
    return asked


HOST_TOKEN = (
    # {"aud": "datalayer:app:host", "sub": "alice", "exp": 4102444800}, unsigned: the runtime never checks it itself.
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJhdWQiOiJkYXRhbGF5ZXI6YXBwOmhvc3QiLCJzdWIiOiJhbGljZSIsImV4cCI6NDEwMjQ0NDgwMH0."
    "c2lnbmF0dXJl"
)


def test_a_host_token_is_the_person_ai_agents_says_it_stands_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    said = {
        "sub": "alice",
        "azp": "inst-1",
        "deployment_uid": "dep-1",
        "app_uid": "app-1",
        "scope": "session decide",
        "expires_in": 600,
    }
    asked = _ai_agents(monkeypatch, (200, said))
    verifier = CallerVerifier()
    caller = asyncio.run(verifier.verify(HOST_TOKEN, "app-1"))
    assert caller == Caller(
        kind="host",
        uid="alice",
        app_uid="app-1",
        visit="inst-1",
        scopes=("session", "decide"),
        deployment_uid="dep-1",
    )
    assert str(asked[0].url) == "https://r1.example/api/ai-agents/v1/apps/hosts/whoami"
    asyncio.run(verifier.verify(HOST_TOKEN, "app-1"))
    assert len(asked) == 1  # remembered, a minute at most


def test_a_revoked_host_token_is_refused_in_ai_agents_words(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ai_agents(
        monkeypatch,
        (401, {"detail": "The account link this token rests on was revoked."}),
    )
    with pytest.raises(CallerRefused) as refused:
        asyncio.run(CallerVerifier().verify(HOST_TOKEN, "app-1"))
    assert refused.value.status == 401 and "revoked" in refused.value.reason


CONTRACTS = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "src"
        / "portable"
        / "hosts"
        / "contracts.json"
    ).read_text()
)


def test_a_turn_carries_its_provenance_as_the_contract_says(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    """S-204: the turn itself carries
    where it comes from, at most 1 KiB, and a retry naming another
    provenance is another request."""
    turn = CONTRACTS["external_turn"]
    provenance = turn["optional_request"]["provenance"]
    assert turn["provenance_limit_bytes"] == routes.PROVENANCE_LIMIT_BYTES
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    session = CONTRACTS["discord"]["session"]["uid"]
    first = _turn(
        events_of(
            _start(
                remote,
                "host:alice:dep-1",
                session,
                external_event_id="discord:1",
                provenance=provenance,
            )
        )
    )
    assert first["replayed"] is False and first["session"] == session
    again = _start(
        remote,
        "host:alice:dep-1",
        session,
        external_event_id="discord:1",
        provenance=provenance,
    )
    assert _turn(events_of(again))["replayed"] is True
    elsewhere = {**provenance, "place": {"kind": "direct", "id": "678901234567890123"}}
    assert (
        _start(
            remote,
            "host:alice:dep-1",
            session,
            external_event_id="discord:1",
            provenance=elsewhere,
        ).status_code
        == 409
    )
    # A message carries it too.
    sent = remote.post(
        f"/api/v1/apps/sessions/{session}/messages",
        headers=as_("host:alice:dep-1"),
        json={
            "text": "And then?",
            "external_event_id": "discord:2",
            "provenance": provenance,
        },
    )
    assert _turn(events_of(sent))["replayed"] is False
    # The fields' own caps keep the largest provenance within the limit.
    largest = routes.TurnProvenance(
        host_kind="h" * 32,
        place={"kind": "channel", "id": "c" * 255},
        thread="t" * 128,
        message_id="m" * 128,
    )
    assert len(largest.model_dump_json()) <= routes.PROVENANCE_LIMIT_BYTES
    # Refused: a field too long, a key it does not know, a place of another kind.
    for wrong in (
        {**provenance, "thread": "x" * 129},
        {**provenance, "channel_history": ["..."]},
        {**provenance, "place": {"kind": "everywhere", "id": "1"}},
    ):
        refused = _start(
            remote,
            "host:alice:dep-1",
            "discord-refused-0001",
            external_event_id="discord:3",
            provenance=wrong,
        )
        assert refused.status_code == 422, (wrong, refused.text)


def test_a_whatsapp_turn_carries_its_chat_and_its_message(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    """WhatsApp's forms of the contract: a 1:1 chat is a direct place named
    by the person's business-scoped user id — the longest one too — a group a
    channel, and the message its wamid; the session uid is the contract's."""
    whatsapp = CONTRACTS["whatsapp"]
    runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    session = whatsapp["session"]["uid"]
    first = _turn(
        events_of(
            _start(
                remote,
                "host:alice:dep-1",
                session,
                external_event_id=whatsapp["provenance"]["message_id"],
                provenance=whatsapp["provenance"],
            )
        )
    )
    assert first["replayed"] is False and first["session"] == session
    longest = {
        **whatsapp["provenance"],
        "place": {"kind": "direct", "id": whatsapp["external_user_id_longest"]},
        "message_id": "wamid.longest",
    }
    assert (
        _start(
            remote,
            "host:alice:dep-1",
            "whatsapp-longest-0001",
            external_event_id="wamid.longest",
            provenance=longest,
        ).status_code
        == 200
    )
    group = {
        **whatsapp["provenance"],
        "place": whatsapp["group"]["place"],
        "message_id": "wamid.group",
    }
    started = _start(
        remote,
        "host:alice:dep-1",
        whatsapp["group_session"]["uid"],
        external_event_id="wamid.group",
        provenance=group,
    )
    assert _turn(events_of(started))["session"] == whatsapp["group_session"]["uid"]
    too_long = {**longest, "place": {"kind": "direct", "id": "U" * 256}}
    assert (
        _start(
            remote,
            "host:alice:dep-1",
            "whatsapp-refused-0001",
            external_event_id="wamid.refused",
            provenance=too_long,
        ).status_code
        == 422
    )


def test_an_external_turn_holds_to_the_shared_contract(
    runtime: Runtime, remote: TestClient, hosted: Any
) -> None:
    """S-004: the `external_turn` section of the hosts' shared contracts,
    held by the session API that answers it: its requests are taken as
    written, the `loop.turn` event carries exactly its keys, and a retry is
    answered as its replay rule says, under the external event id (a start)
    and under the `Idempotency-Key` (a message)."""
    contract = CONTRACTS["external_turn"]
    start, message = contract["start_request"], contract["message_request"]
    optional = set(contract["optional_request"])
    assert set(start) | optional <= set(routes.StartSessionRequest.model_fields)
    assert set(message) | optional <= set(routes.SessionMessageRequest.model_fields)
    event = contract["turn_event"]
    assert (event["type"], event["name"]) == ("CUSTOM", external_turns.TURN_EVENT)
    assert contract["provenance_limit_bytes"] == routes.PROVENANCE_LIMIT_BYTES
    # The event as the runtime encodes it, before any request.
    encoded = external_turns.turn_event(
        external_turns.ExternalTurn(
            session_uid="s", turn="t", external_event_id="e", fingerprint="f", at=0
        ),
        replayed=False,
    )
    [data] = [line for line in encoded.splitlines() if line.startswith("data:")]
    emitted = json.loads(data[len("data:") :])
    assert (emitted["type"], emitted["name"]) == (event["type"], event["name"])
    assert sorted(emitted["value"]) == sorted(event["value_keys"])

    model = runtime.make(start["agent"], ASSISTANT, DEPLOYED)
    who = as_("host:alice:dep-1")
    sessions = "/api/v1/apps/sessions"
    first = _turn(events_of(remote.post(sessions, headers=who, json=start)))
    assert sorted(first) == sorted(event["value_keys"])
    assert (first["session"], first["external_event_id"], first["replayed"]) == (
        start["session"],
        start["external_event_id"],
        False,
    )
    # The same event id, the same request: the original turn, nothing run.
    again = _turn(events_of(remote.post(sessions, headers=who, json=start)))
    assert sorted(again) == sorted(event["value_keys"])
    assert (again["turn"], again["replayed"]) == (first["turn"], True)
    assert len(model.prompts) == 1
    # The same event id, another request: 409, nothing run.
    assert (
        remote.post(
            sessions, headers=who, json={**start, "opener": "Other"}
        ).status_code
        == 409
    )
    assert len(model.prompts) == 1

    keyed = {**who, CONTRACTS["headers"]["idempotency_key"]: "k-contract"}
    messages = f"{sessions}/{start['session']}/messages"
    said = _turn(events_of(remote.post(messages, headers=keyed, json=message)))
    assert sorted(said) == sorted(event["value_keys"])
    assert (said["external_event_id"], said["replayed"]) == (
        message["external_event_id"],
        False,
    )
    assert len(model.prompts) == 2
    retried = _turn(events_of(remote.post(messages, headers=keyed, json=message)))
    assert (retried["turn"], retried["replayed"]) == (said["turn"], True)
    assert len(model.prompts) == 2
    other = {**message, "text": "Something else"}
    assert remote.post(messages, headers=keyed, json=other).status_code == 409
    assert len(model.prompts) == 2
