# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent run as such is a session of the same model as an application's.

An agent made without an Appspec answers the session routes as the
application of that one agent: a run through the session path opens a
session, kept in the record under ``agent:<agentspec id>`` and listed with
``kind: agent``; it is paused, resumed from its record by a runtime that no
longer holds it — its conversation intact — and ended as an application's
session is. It runs as the person, with their own token, never as a Preview.

Pausing gives its agent's memory the turns it was not given yet, when the
agent has a memory, before the session is marked paused.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.models.function import FunctionModel

from agent_runtimes.apps import sessions
from agent_runtimes.apps.record import agent_app_uid, session_kind
from agent_runtimes.apps.session_store import FileSessionStore, use_session_store
from agent_runtimes.memory.registry import (
    register_memory_backend,
    unregister_memory_backend,
)
from agent_runtimes.routes import agents
from agent_runtimes.routes.agui import register_agui_agent, unregister_agui_agent
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    Said,
    answer_of,
    as_,
    events_of,
    local,
    remote,
    runtime,
)

AGENT = "default"
SPEC = "worker-marketer"
PATH = f"/api/v1/apps/agents/{AGENT}/ag-ui/"
SESSIONS = "/api/v1/apps/sessions"


class Memory:
    """A memory that keeps what it is given, or refuses."""

    def __init__(self, refuses: str = "") -> None:
        self.given: List[List[Dict[str, Any]]] = []
        self.refuses = refuses

    async def add(self, messages: List[Dict[str, Any]], metadata: Any = None) -> None:
        if self.refuses:
            raise RuntimeError(self.refuses)
        self.given.append([dict(m) for m in messages])


@pytest.fixture()
def marketer(
    runtime: Runtime,  # noqa: F811 - the fixture
    tmp_path: Path,
) -> Iterator[Said]:
    """An agent made as such — no Appspec — its sessions kept in files."""
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    use_session_store(FileSessionStore(root=tmp_path / "sessions"))
    model = Said()
    agent = Agent(FunctionModel(model, stream_function=model.stream))
    register_agui_agent(
        AGENT,
        AGUITransport(PydanticAIAdapter(agent, agent_id=AGENT), agent_id=AGENT),
    )
    agents._agentspecs[AGENT] = {"agent_spec_id": SPEC, "name": "The Marketer"}
    try:
        yield model
    finally:
        unregister_agui_agent(AGENT)
        agents._agentspecs.pop(AGENT, None)
        unregister_memory_backend(AGENT)
        use_session_store(None)


def _run(
    client: TestClient,
    thread: str,
    said: List[str],
    answers: List[str],
    headers: Dict[str, str] | None = None,
) -> List[Dict[str, Any]]:
    """A run as a chat sends it: the whole conversation, its last message new."""
    messages: List[Dict[str, Any]] = []
    for index, text in enumerate(said):
        messages.append({"id": f"u{index}", "role": "user", "content": text})
        if index < len(answers):
            messages.append(
                {"id": f"a{index}", "role": "assistant", "content": answers[index]}
            )
    return events_of(
        client.post(
            PATH,
            headers=headers or as_("ada"),
            json={
                "threadId": thread,
                "runId": f"run-{len(said)}",
                "messages": messages,
                "tools": [],
                "context": [],
                "state": None,
                "forwardedProps": None,
            },
        )
    )


def test_the_kind_is_said_by_the_applications_uid() -> None:
    assert agent_app_uid("worker-marketer") == "agent:worker-marketer"
    assert session_kind("agent:worker-marketer") == "agent"
    assert session_kind("app-1") == "application"
    assert session_kind("") == "application"


def test_an_agent_made_as_such_is_the_application_of_that_one_agent(
    marketer: Said,
) -> None:
    app, instance = sessions.session_app(AGENT)
    assert (app.id, app.name, app.kind, app.agent) == (
        SPEC,
        "The Marketer",
        "chat",
        SPEC,
    )
    assert instance == {"app_uid": "agent:worker-marketer"}
    assert "conversations" in app.record.include
    with pytest.raises(sessions.SessionRefused) as refused:
        sessions.session_app("nobody")
    assert refused.value.status == 404
    # What asks for the application an agent runs is still told it runs none.
    with pytest.raises(sessions.SessionRefused) as none:
        sessions.agent_app(AGENT)
    assert "runs no application" in none.value.reason


def test_a_run_opens_a_session_listed_paused_resumed_and_ended(
    marketer: Said,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    first = answer_of(_run(remote, "session-a001", ["My name is Ada."], []))
    second = answer_of(
        _run(remote, "session-a001", ["My name is Ada.", "And I sell tea."], [first])
    )
    assert first and second

    # Listed, saying what it is a session of.
    [listed] = remote.get(SESSIONS, headers=as_("ada")).json()["sessions"]
    assert (listed["uid"], listed["kind"], listed["state"], listed["agent"]) == (
        "session-a001",
        "agent",
        "open",
        SPEC,
    )
    assert listed["instance"]["app_uid"] == "agent:worker-marketer"
    assert listed["turns"] == 2
    assert listed["title"] == "My name is Ada."
    # It runs as the person, never as a Preview of an application.
    assert listed["acts_as"] == {"kind": "person", "uid": "ada"}
    # Somebody else's listing has none of it.
    assert remote.get(SESSIONS, headers=as_("bob")).json()["sessions"] == []

    # Paused: in the record too.
    paused = remote.post(f"{SESSIONS}/session-a001/stop", headers=as_("ada"))
    assert paused.status_code == 200, paused.text
    assert paused.json()["state"] == "paused"
    assert paused.json()["remembered"] == {}
    again = remote.post(f"{SESSIONS}/session-a001/stop", headers=as_("ada"))
    assert again.status_code == 409

    # A new process: the runtime holds nothing, the record says it all.
    sessions._SESSIONS.clear()
    [recorded] = remote.get(SESSIONS, headers=as_("ada")).json()["sessions"]
    assert (recorded["held"], recorded["kind"], recorded["state"]) == (
        False,
        "agent",
        "paused",
    )
    assert recorded["turns"] == 2

    # Resumed from the record, on the agent named: the conversation intact.
    resumed = events_of(
        remote.post(
            f"{SESSIONS}/session-a001/resume", headers=as_("ada"), json={"agent": AGENT}
        )
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [(m["role"], m["content"]) for m in snapshot["messages"]] == [
        ("user", "My name is Ada."),
        ("assistant", first),
        ("user", "And I sell tea."),
        ("assistant", second),
    ]
    thread = remote.get(f"{SESSIONS}/session-a001/messages", headers=as_("ada")).json()
    assert [m["content"] for m in thread["messages"] if m["role"] == "user"] == [
        "My name is Ada.",
        "And I sell tea.",
    ]
    # Somebody else resumes nothing of it.
    sessions._SESSIONS.clear()
    refused = remote.post(
        f"{SESSIONS}/session-a001/resume", headers=as_("bob"), json={"agent": AGENT}
    )
    assert refused.status_code == 404

    # A third turn goes on, with what was said before.
    events_of(
        remote.post(
            f"{SESSIONS}/session-a001/resume", headers=as_("ada"), json={"agent": AGENT}
        )
    )
    third = answer_of(
        _run(
            remote,
            "session-a001",
            ["My name is Ada.", "And I sell tea.", "What do I sell?"],
            [first, second],
        )
    )
    assert third
    described = remote.get(f"{SESSIONS}/session-a001", headers=as_("ada")).json()
    assert (described["state"], described["turns"], described["resumed"]) == (
        "open",
        3,
        True,
    )

    # Ended: read from the record, never resumed.
    ended = remote.post(f"{SESSIONS}/session-a001/end", headers=as_("ada"))
    assert ended.status_code == 200, ended.text
    [last] = remote.get(SESSIONS, headers=as_("ada"), params={"state": "ended"}).json()[
        "sessions"
    ]
    assert (last["uid"], last["kind"], last["turns"]) == ("session-a001", "agent", 3)
    gone = remote.post(
        f"{SESSIONS}/session-a001/resume", headers=as_("ada"), json={"agent": AGENT}
    )
    assert gone.status_code == 409


def test_the_machine_itself_runs_and_resumes_with_no_token(
    marketer: Said,
    local: TestClient,  # noqa: F811 - the fixture
) -> None:
    first = answer_of(_run(local, "session-a002", ["One"], [], headers={}))
    assert first
    assert local.post(f"{SESSIONS}/session-a002/stop").status_code == 200
    sessions._SESSIONS.clear()
    resumed = events_of(
        local.post(f"{SESSIONS}/session-a002/resume", json={"agent": AGENT})
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [m["content"] for m in snapshot["messages"]] == ["One", first]


def test_an_applications_session_says_application(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    events_of(
        remote.post(
            SESSIONS,
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": "session-a003",
            },
        )
    )
    said = remote.get(f"{SESSIONS}/session-a003", headers=as_("ada")).json()
    assert said["kind"] == "application"


def test_pausing_gives_the_memory_the_turns_it_was_not_given_yet(
    marketer: Said,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    memory = Memory()
    register_memory_backend(AGENT, memory)  # type: ignore[arg-type]
    first = answer_of(_run(remote, "session-a004", ["My name is Ada."], []))
    paused = remote.post(f"{SESSIONS}/session-a004/stop", headers=as_("ada")).json()
    assert paused["remembered"] == {"saved": 2, "turns": 1}
    assert memory.given == [
        [
            {"role": "user", "content": "My name is Ada."},
            {"role": "assistant", "content": first},
        ]
    ]

    # Resumed here and paused again with nothing new: nothing given twice.
    events_of(
        remote.post(f"{SESSIONS}/session-a004/resume", headers=as_("ada"), json={})
    )
    again = remote.post(f"{SESSIONS}/session-a004/stop", headers=as_("ada")).json()
    assert again["remembered"] == {"saved": 0, "turns": 1}
    assert len(memory.given) == 1

    # Resumed from its record by a runtime that no longer holds it: the
    # record says what was given, and only the new turn is.
    sessions._SESSIONS.clear()
    events_of(
        remote.post(
            f"{SESSIONS}/session-a004/resume", headers=as_("ada"), json={"agent": AGENT}
        )
    )
    second = answer_of(
        _run(remote, "session-a004", ["My name is Ada.", "I sell tea."], [first])
    )
    third = remote.post(f"{SESSIONS}/session-a004/stop", headers=as_("ada")).json()
    assert third["remembered"] == {"saved": 2, "turns": 2}
    assert memory.given[1] == [
        {"role": "user", "content": "I sell tea."},
        {"role": "assistant", "content": second},
    ]


def test_a_memory_that_refuses_is_said_and_the_session_is_paused_all_the_same(
    marketer: Said,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    register_memory_backend(AGENT, Memory(refuses="The store is away."))  # type: ignore[arg-type]
    _run(remote, "session-a005", ["One"], [])
    paused = remote.post(f"{SESSIONS}/session-a005/stop", headers=as_("ada"))
    assert paused.status_code == 200, paused.text
    said = paused.json()
    assert said["state"] == "paused"
    assert said["remembered"] == {
        "saved": 0,
        "turns": 0,
        "refused": "The store is away.",
    }
    sessions._SESSIONS.clear()
    [recorded] = remote.get(SESSIONS, headers=as_("ada")).json()["sessions"]
    assert recorded["state"] == "paused"


def test_a_thread_named_in_snake_case_is_the_same_session(
    marketer: Said,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """The terminal's AG-UI client writes ``thread_id`` and ``run_id``: two
    runs of one thread are two turns of one session, not two sessions.
    """
    for number, said in enumerate((["One"], ["One", "Two"]), 1):
        events_of(
            remote.post(
                PATH,
                headers=as_("ada"),
                json={
                    "thread_id": "3f6c2d1e-0000-4000-8000-00000000a006",
                    "run_id": f"run-{number}",
                    "messages": [
                        {"id": f"u{i}", "role": "user", "content": text}
                        for i, text in enumerate(said)
                    ],
                    "state": {},
                    "tools": [],
                    "context": [],
                    "forwardedProps": {},
                },
            )
        )
    [only] = remote.get(SESSIONS, headers=as_("ada")).json()["sessions"]
    assert (only["uid"], only["turns"]) == ("3f6c2d1e-0000-4000-8000-00000000a006", 2)
