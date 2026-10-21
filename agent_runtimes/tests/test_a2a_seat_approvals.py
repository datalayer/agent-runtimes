# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A delegated task's *ask me first*, answered by the control plane (META_HARNESS MH-42).

A team seat — any task the control plane dispatched over A2A — that asks a
person before a call waits as ``input-required`` carrying
``approvalRequest``. The orchestration adapter hands the request to the
control plane's responder (which files it as a tool approval under the
execution, *Waiting for you*), answers the task with the option chosen on the
same task, and follows its stream to the end: one attempt, one session. A
responder that chooses nothing is a refusal, said by the harness. The
worker's own wait outlasts the control plane's deadline, so it never answers
first. A refused turn keeps its turn row.
"""

from __future__ import annotations

import asyncio
import socket
from pathlib import Path
from typing import Any, Mapping

import pytest

from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.tests.test_a2a_harness_worker import harness_agent


@pytest.fixture
def state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    return store


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "README.md").write_text("# A readme\n", encoding="utf-8")
    return tmp_path


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


async def _dispatch(
    state: Any, workspace: Path, goal: str, responder: Any
) -> list[Any]:
    """Serve the fake harness over HTTP and dispatch `goal` to it through the adapter."""
    import uvicorn
    from fasta2a.broker import InMemoryBroker
    from fastapi import FastAPI

    from agent_runtimes.orchestration import ResolvedWorker
    from agent_runtimes.orchestration.adapters.a2a import (
        A2A_CAPABILITIES,
        A2AWorkerAdapter,
    )
    from agent_runtimes.subagents.a2a import A2ARemoteAgent
    from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

    port = _free_port()
    app = FastAPI()
    a2a_routes.set_a2a_app(app, "/api/v1")
    agent = harness_agent(workspace)
    url = f"http://127.0.0.1:{port}/api/v1/a2a/agents/fake-seat"
    card = a2a_routes.A2AAgentCard(
        id="fake-seat", name="Fake", description="A harness", url=url
    )
    a2a_routes.register_a2a_agent(
        agent,
        card,
        broker=InMemoryBroker(),
        storage=DurableStorage(state, "fake-seat"),
    )
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"
        )
    )
    serving = asyncio.create_task(server.serve())
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started
        remote = A2ARemoteAgent(name="fake-seat", url=url, launch="remote")
        resolved = ResolvedWorker(
            binding=an_execution(agent_id="fake-seat", endpoint=url).agent,
            capabilities=A2A_CAPABILITIES,
            endpoint=url,
            details=remote.describe(),
            handle=remote,
        )
        execution = an_execution(
            agent_id="fake-seat", endpoint=url, goal=goal, references=()
        )
        return [
            observation
            async for observation in A2AWorkerAdapter(approvals=responder).dispatch(
                resolved, execution, an_attempt(execution)
            )
        ]
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, 10)
        a2a_routes.unregister_a2a_agent("fake-seat")
        a2a_routes.set_a2a_app(None, "/api/v1")
        await agent.cleanup()


def _said(observations: list[Any]) -> str:
    return " ".join(str(o) for o in observations)


@pytest.mark.asyncio
async def test_the_ask_is_handed_to_the_control_plane_and_the_task_goes_on(
    state: Any, workspace: Path
) -> None:
    asked: list[Mapping[str, Any]] = []

    async def responder(request: Mapping[str, Any]) -> str | None:
        asked.append(request)
        return "allow"

    observations = await _dispatch(state, workspace, "push", responder)
    [request] = asked
    call = request["toolCall"]
    assert call["title"] == "git push origin main"
    assert call["kind"] == "execute"
    assert call["toolCallId"]
    assert call["rawInput"]["command"] == "git push origin main"
    assert [o["optionId"] for o in request["options"]] == ["allow", "reject"]
    events = [getattr(o, "lifecycle_event", None) for o in observations]
    assert any(str(event).endswith("COMPLETE") for event in events), _said(observations)
    assert "outcome='selected'" in _said(observations)


@pytest.mark.asyncio
async def test_no_option_chosen_is_answered_with_the_refusing_one(
    state: Any, workspace: Path
) -> None:
    async def responder(request: Mapping[str, Any]) -> str | None:
        return None

    observations = await _dispatch(state, workspace, "push", responder)
    said = _said(observations)
    assert "option_id='allow'" not in said
    assert "push:" in said


def test_a_delegated_task_waits_longer_than_the_control_planes_deadline() -> None:
    from agent_runtimes.transports.a2a import (
        APPROVAL_TIMEOUT,
        DELEGATED_APPROVAL_TIMEOUT,
    )

    assert DELEGATED_APPROVAL_TIMEOUT >= 24 * 60 * 60
    assert DELEGATED_APPROVAL_TIMEOUT > APPROVAL_TIMEOUT


def test_an_approval_request_is_said_as_a_permission_request() -> None:
    from agent_runtimes.orchestration.adapters.a2a import permission_request_of
    from agent_runtimes.subagents.a2a import approval_request_of, refusing_option

    asked = {
        "toolCall": {
            "id": "s1:t1",
            "title": "python3 hello.py",
            "kind": "execute",
            "sentence": "ask me first",
            "command": "python3 hello.py",
        },
        "options": [
            {"optionId": "allow", "name": "Allow", "kind": "allow_once"},
            {"optionId": "no", "name": "Reject", "kind": "reject_once"},
        ],
        "expiresAt": "2026-10-22T00:00:00+00:00",
    }
    request = permission_request_of(asked)
    assert request["toolCall"] == {
        "toolCallId": "s1:t1",
        "title": "python3 hello.py",
        "kind": "execute",
        "rawInput": {"sentence": "ask me first", "command": "python3 hello.py"},
    }
    assert refusing_option(asked) == "no"
    assert refusing_option({"options": []}) is None
    message = {"metadata": {"datalayer": {"approvalRequest": asked}}}
    assert approval_request_of(message) == asked
    assert approval_request_of({"metadata": {}}) is None
