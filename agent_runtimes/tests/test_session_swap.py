# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The swap (MH-06), the old route gone (MH-07), the Shield on a swap (MH-08).

`POST /sessions/{uid}/agent` swaps a session's agent in place: refused while
a turn runs or the harness loads, the new agent bound through the one way
to reconfigure a running agent, the conversation carried with the sentence
of what carries appended to it and in the record, the files still listed, a
harness → framework swap and back; the old `loop/sessions/{id}/agent`
answers 410 naming the session route and `LoopSession.with_agent` goes
through the new one; the session's Rules carry, the organization's policy
for the new harness is pulled before its first turn, fail closed.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.session import LoopRefused, LoopSession
from agent_runtimes.specs.agents.agents import list_agentspecs
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

HARNESS_AGENT = "example-harness-codex"
FRAMEWORK_AGENT = next(
    spec.id
    for spec in list_agentspecs()
    if spec.harness in ("pydantic-ai", "vercel-ai")
)


@pytest.fixture()
def rebinder() -> Any:
    """A double of configure-from-spec, recording what it was asked to bind;
    and IAM stood in for, serving the organization's policy the new harness
    is admitted by (MH-08: pulled before its first turn, fail closed).
    """
    from agent_shield.policy import Harnesses, Policy

    from agent_runtimes.guardrails import managed_policies
    from agent_runtimes.tests.test_shield_policies import FakeIam, served

    bound: List[tuple[str, str]] = []

    async def rebind(live: Any, agent: str, request: Any) -> None:
        bound.append((live.uid, agent))

    sessions.use_rebinder(rebind)
    managed_policies.use_source(
        FakeIam(
            served(Policy(scope="organization", harnesses=Harnesses(admit=["codex"])))
        )
    )
    try:
        yield bound
    finally:
        sessions.use_rebinder(None)
        managed_policies.use_source(None)


def _open(client: TestClient, uid: str) -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": uid,
            },
        )
    )


def _swapped(made: Runtime, uid: str) -> List[Dict[str, Any]]:
    return [e["payload"] for e in made.entries("swapped") if e["session_uid"] == uid]


def test_a_swap_is_refused_while_a_turn_runs_or_the_harness_loads(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    rebinder: Any,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-w001")
    live = sessions.session_of("session-w001")
    assert live is not None
    live.turn = "running"
    refused = remote.post(
        "/api/v1/apps/sessions/session-w001/agent",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Session session-w001 is answering turn 1: swap it when the turn is over, or interrupt it first.",
    )
    live.turn = "waiting"
    assert (
        "waiting for an answer to turn 1"
        in remote.post(
            "/api/v1/apps/sessions/session-w001/agent",
            headers=as_("ada"),
            json={"agent": HARNESS_AGENT},
        ).json()["detail"]
    )
    live.turn = "idle"

    class Loading:
        loading = {"session-w001"}
        harness = type("H", (), {"name": "Claude Code", "id": "claude-code"})()
        _acp_of: Dict[str, str] = {}
        sessions: Dict[str, Any] = {}

    live._shield = lambda: Loading()  # type: ignore[method-assign]
    refused = remote.post(
        "/api/v1/apps/sessions/session-w001/agent",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    )
    assert (
        refused.json()["detail"]
        == "Session session-w001: Claude Code is still loading its session; swap it once it is loaded."
    )
    del live._shield
    assert rebinder == []
    unknown = remote.post(
        "/api/v1/apps/sessions/session-w001/agent",
        headers=as_("ada"),
        json={"agent": "nope"},
    )
    assert (unknown.status_code, unknown.json()["detail"]) == (
        404,
        "There is no agentspec 'nope' on this runtime to swap to.",
    )
    assert (
        remote.post(
            "/api/v1/apps/sessions/session-w001/agent",
            headers=as_("bob"),
            json={"agent": HARNESS_AGENT},
        ).status_code
        == 404
    )


def test_the_swap_carries_the_conversation_tells_the_new_agent_and_is_in_the_record(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    rebinder: Any,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-w002")
    live = sessions.session_of("session-w002")
    assert live is not None
    live.files.append(
        {
            "name": "a.csv",
            "type": "text/csv",
            "size": 3,
            "path": "",
            "digest": "sha256:0",
        }
    )
    remote.post(
        "/api/v1/apps/sessions/session-w002/rules",
        headers=as_("ada"),
        json={"name": "no-delete", "decision": "deny", "classes": ["delete"]},
    )
    answer = remote.post(
        "/api/v1/apps/sessions/session-w002/agent",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    )
    assert answer.status_code == 200, answer.text
    said = answer.json()
    assert (said["uid"], said["agent"], said["harness"], said["state"]) == (
        "session-w002",
        HARNESS_AGENT,
        "codex",
        "open",
    )
    assert said["said"] == (
        "This conversation was with notes-assistant until turn 1; from here it is with Codex. "
        "What was said stays; what notes-assistant kept for itself is gone."
    )
    assert said["carried"] == {
        "turns": 1,
        "files": 1,
        "rules": 1,
        "settings": ["tone"],
        "workspace": True,
    }
    assert (
        said["dropped"]["allow_always"] == 0
        and said["dropped"]["harness_state"] == "gone"
    )
    assert rebinder == [("session-w002", HARNESS_AGENT)]
    # The sentence is in the thread, read by the new agent with its first turn; the files are still listed.
    assert (
        live.messages[-1]["content"] == said["said"]
        and live.messages[-1]["agent"] == HARNESS_AGENT
    )
    described = remote.get(
        "/api/v1/apps/sessions/session-w002", headers=as_("ada")
    ).json()
    assert described["agent"] == HARNESS_AGENT and [
        f["name"] for f in described["files"]
    ] == ["a.csv"]
    # The session's Rules carry (MH-08).
    assert [
        r["name"]
        for r in remote.get(
            "/api/v1/apps/sessions/session-w002/rules", headers=as_("ada")
        ).json()["session_rules"]
    ] == ["no-delete"]
    # In the record: `swapped` with what was said, carried and dropped.
    [row] = _swapped(runtime, "session-w002")
    assert (row["from"], row["to"], row["to_harness"], row["at_turn"], row["said"]) == (
        "notes-assistant",
        HARNESS_AGENT,
        "codex",
        1,
        said["said"],
    )
    assert row["carried"]["files"] == 1 and row["agent"] == HARNESS_AGENT
    # The same agent again: refused.
    again = remote.post(
        "/api/v1/apps/sessions/session-w002/agent",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    )
    assert (again.status_code, again.json()["detail"]) == (
        409,
        f"Session session-w002 is with {HARNESS_AGENT} already.",
    )
    # A harness → framework swap, and the record's second row.
    back = remote.post(
        "/api/v1/apps/sessions/session-w002/agent",
        headers=as_("ada"),
        json={"agent": FRAMEWORK_AGENT},
    ).json()
    assert (back["agent"], back["harness"]) == (FRAMEWORK_AGENT, None)
    assert [r["to"] for r in _swapped(runtime, "session-w002")] == [
        HARNESS_AGENT,
        FRAMEWORK_AGENT,
    ]
    # The person's turns are tagged with the agent that had them (MH-04).
    events_of(
        remote.post(
            "/api/v1/apps/sessions/session-w002/messages",
            headers=as_("ada"),
            json={"text": "Two"},
        )
    )
    assert [m.get("agent") for m in live.messages if m["role"] == "user"] == [
        "notes-assistant",
        FRAMEWORK_AGENT,
    ]


def test_the_old_loop_route_is_gone_and_the_loop_session_swaps_through_the_new_one(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    rebinder: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gone = remote.post(
        "/api/v1/loop/sessions/session-w003/agent", json={"agent_id": HARNESS_AGENT}
    )
    assert (gone.status_code, gone.json()["detail"]) == (
        410,
        "A session's agent is swapped at POST /api/v1/apps/sessions/session-w003/agent; this route is gone.",
    )
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-w003")
    import httpx

    def post(url: str, json: Any, headers: Dict[str, str], timeout: float) -> Any:
        return remote.post(
            url.replace("http://runtime", ""), json=json, headers=headers
        )

    monkeypatch.setattr(httpx, "post", post)
    loop = LoopSession(server_url="http://runtime", agent_id="notes-assistant")
    with pytest.raises(LoopRefused, match="not an application session: resume one"):
        loop.with_agent(HARNESS_AGENT)
    loop.session_uid = "session-w003"
    loop.token = "ada"
    assert loop.with_agent(HARNESS_AGENT) is loop
    assert loop.agent_id == HARNESS_AGENT and loop.said.startswith(
        "This conversation was with notes-assistant until turn 1"
    )
    with pytest.raises(LoopRefused, match="is with example-harness-codex already"):
        loop.with_agent(HARNESS_AGENT)


def test_a_harness_whose_policy_cannot_be_read_is_refused_and_nothing_is_swapped(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    rebinder: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_shield.saas import PolicyUnavailable

    from agent_runtimes.guardrails import shield_policy

    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-w004")

    def unreadable(*args: Any, **kwargs: Any) -> Any:
        raise PolicyUnavailable("IAM answered 503 and no unexpired copy is kept")

    monkeypatch.setattr(shield_policy, "policies_in_force", unreadable)
    refused = remote.post(
        "/api/v1/apps/sessions/session-w004/agent",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        503,
        "The harness 'codex' is refused: IAM answered 503 and no unexpired copy is kept.",
    )
    assert rebinder == []
    assert (
        remote.get("/api/v1/apps/sessions/session-w004", headers=as_("ada")).json()[
            "agent"
        ]
        == "notes-assistant"
    )


def test_always_answers_are_counted_from_the_harness_and_dropped() -> None:
    from agent_runtimes.loop.apps.session_carry import DEFAULT_CARRY

    class State:
        session_rules = ["r1", "r2"]

    class Shield:
        _acp_of = {"session-w005": "acp-1"}
        sessions = {"acp-1": State()}
        harness = type("H", (), {"name": "Claude Code", "id": "claude-code"})()

    class Live:
        uid = "session-w005"
        agent_spec = "shield-mvp-claude-code"
        agent_name = "Claude Code"
        capabilities = {"resume": "load"}
        messages: List[Dict[str, Any]] = [{"role": "user", "content": "a"}]
        files: List[Dict[str, Any]] = []
        settings: Dict[str, Any] = {}
        model = ""

        def allow_always_count(self) -> int:
            return sessions.LiveSession.allow_always_count(self)  # type: ignore[arg-type]

        def _shield(self) -> Any:
            return Shield()

    carried = DEFAULT_CARRY.swap(
        Live(),
        {
            "agent": "x",
            "name": "Codex",
            "harness": "codex",
            "capabilities": {"resume": "load"},
        },
    )
    assert (
        carried.dropped["allow_always"] == 2
        and carried.dropped["harness_state"] == "kept for a swap back"
    )
