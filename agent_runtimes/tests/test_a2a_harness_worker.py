# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A harness served over A2A (SHIELD.md §4.2, SH-15), on the ACP SDK's fake agent.

The worker publishes the harness's plan as one artifact replaced as it
progresses, each file it changed as a ``text/x-diff`` artifact named by its
path with the extension's ``artifactProvenance``, its tool calls as
``working`` statuses carrying ``{kind, title, status}``, and an approval as
``input-required`` carrying ``approvalRequest {toolCall, options,
expiresAt}``, answered on the same task — by the option chosen, or by one
whole word from a caller that does not know the extension. Reasoning is not
an artifact (decision 8). The last test is the drill: an orchestrator
delegates to the worker over HTTP and gets the diff back.
"""

from __future__ import annotations

import asyncio
import hashlib
import socket
import sys
from pathlib import Path
from typing import Any, Callable

import pytest

from agent_runtimes.adapters.acp_agent import ACPAgent
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.tests.test_acp_agent import FAKE, fake_harness
from agent_runtimes.transports.a2a import (
    DIFF_MEDIA_TYPE,
    A2AWorker,
    TaskCancellation,
    chosen_option,
    unified_diff,
)


@pytest.fixture
def state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    return store


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    (tmp_path / "README.md").write_text("# A readme\n", encoding="utf-8")
    return tmp_path


def harness_agent(workspace: Path) -> ACPAgent:
    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        policies=policies_of(None),
    )


def _message(text: str, **fields: Any) -> dict[str, Any]:
    return {
        "role": "user",
        "parts": [{"text": text}],
        "message_id": f"m-{text[:12]}",
        "context_id": "ctx-1",
        **fields,
    }


async def _run(
    state: SqliteProtocolStateStore,
    agent: ACPAgent,
    message: dict[str, Any],
    answer: Callable[[dict[str, Any]], dict[str, Any] | None] | None = None,
) -> tuple[str, list[dict[str, Any]], DurableStorage]:
    """Run one task as an A2A client would: a stream ends at ``input-required``, the answer is a message naming the task, and the client subscribes again."""
    from fasta2a.broker import InMemoryBroker

    storage = DurableStorage(state, "agent-1")
    broker = InMemoryBroker()
    worker = A2AWorker(
        broker=broker,
        storage=storage,
        agent=agent,
        cancellation=TaskCancellation(
            register=a2a_routes.register_task,
            unregister=a2a_routes.unregister_task,
            cancel=a2a_routes.cancel_task,
        ),
    )
    task = await storage.submit_task("ctx-1", message)
    params: dict[str, Any] = {
        "id": task["id"],
        "context_id": "ctx-1",
        "message": message,
    }
    events: list[dict[str, Any]] = []
    try:
        async with broker, worker.run():
            while True:
                waiting: dict[str, Any] | None = None
                async with broker.event_bus.subscribe(task["id"]) as receive:
                    await broker.run_task(params)
                    async for event in receive:
                        events.append(event)
                        status = event.get("status_update", {}).get("status", {})
                        if status.get("state") == "input-required" and status.get(
                            "message"
                        ):
                            # Over HTTP the stream ends here (A2A 1.0); the
                            # client answers and subscribes again.
                            waiting = status["message"]
                            break
                if waiting is None or answer is None:
                    break
                reply = answer(waiting)
                if reply is None:
                    break
                continued = await storage.submit_task(
                    "ctx-1", {**reply, "task_id": task["id"]}
                )
                assert continued["id"] == task["id"]
                params = {"id": task["id"], "context_id": "ctx-1", "message": reply}
    finally:
        await agent.cleanup()
    return task["id"], events, storage


def _statuses(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e["status_update"]["status"] for e in events if "status_update" in e]


def _artifacts(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [e["artifact_update"]["artifact"] for e in events if "artifact_update" in e]


def _text(message: dict[str, Any] | None) -> str:
    return "".join(
        str(part.get("text") or "") for part in (message or {}).get("parts") or []
    )


@pytest.mark.asyncio
async def test_the_plan_and_each_diff_are_artifacts_with_provenance(
    state: Any, workspace: Path
) -> None:
    _, events, storage = await _run(
        state, harness_agent(workspace), _message("plan edit")
    )
    assert _statuses(events)[-1]["state"] == "completed"
    artifacts = _artifacts(events)
    plans = [a for a in artifacts if a["name"] == "plan"]
    assert plans and plans[-1]["parts"][0]["text"] == "- [~] step one (medium)\n"
    assert plans[-1]["parts"][1]["data"]["steps"][0]["content"] == "step one"
    diffs = [a for a in artifacts if a["name"] == "hello.txt"]
    assert diffs, "the file the harness changed is a diff artifact named by its path"
    diff = diffs[-1]
    [part] = diff["parts"]
    assert part["media_type"] == DIFF_MEDIA_TYPE and part["filename"] == "hello.txt"
    # The fake reports its edit with an empty old text, as Claude Code does.
    assert part["text"] == unified_diff("hello.txt", "", "hello, shield\n")
    assert "+hello, shield" in part["text"]
    provenance = diff["metadata"]["datalayer"]["artifactProvenance"]
    digest = hashlib.sha256(part["text"].encode()).hexdigest()
    assert provenance["contentHash"] == f"sha256:{digest}"
    assert provenance["sourceReferences"] == ["hello.txt"] and provenance["producedAt"]
    # The same path, the same artifact: replaced, never a second one.
    assert len({a["artifact_id"] for a in diffs}) == 1
    # Kept with the task, for tasks/get.
    task_id = events[0]["status_update"]["task_id"]
    kept = await storage.load_task(task_id)
    names = [a.get("name") for a in kept["artifacts"]]
    assert "plan" in names and "hello.txt" in names and "result" in names
    # Reasoning is not an artifact, nor a message (decision 8).
    assert "thinking" not in str(events)


@pytest.mark.asyncio
async def test_tool_calls_are_working_statuses_with_kind_title_and_status(
    state: Any, workspace: Path
) -> None:
    _, events, _ = await _run(state, harness_agent(workspace), _message("read"))
    titled = [
        s["message"]["metadata"]
        for s in _statuses(events)
        if s["state"] == "working" and s.get("message") and s["message"].get("metadata")
    ]
    assert {
        "kind": "read",
        "title": "Read README.md",
        "status": "in_progress",
    } in titled
    assert any(
        t["title"] == "Read README.md" and t["status"] == "completed" for t in titled
    )
    # The Shield's own answer to the read is a row too, decided.
    assert any(t["title"].startswith("Read README.md — do it") for t in titled)


@pytest.mark.asyncio
async def test_an_approval_is_input_required_and_answered_on_the_task(
    state: Any, workspace: Path
) -> None:
    asked: list[dict[str, Any]] = []

    def answer(message: dict[str, Any]) -> dict[str, Any]:
        asked.append(message)
        return _message(
            "allow it",
            message_id="m-answer",
            metadata={"datalayer": {"approval": {"optionId": "allow"}}},
        )

    _, events, _ = await _run(state, harness_agent(workspace), _message("push"), answer)
    [request] = asked
    approval = request["metadata"]["datalayer"]["approvalRequest"]
    assert approval["toolCall"]["title"] == "git push origin main"
    assert approval["toolCall"]["kind"] == "execute"
    assert approval["toolCall"]["command"] == "git push origin main"
    assert [o["optionId"] for o in approval["options"]] == ["allow", "reject"]
    assert [o["kind"] for o in approval["options"]] == ["allow_once", "reject_once"]
    assert approval["expiresAt"].endswith("+00:00")
    assert "Allow (allow), Reject (reject)" in _text(request)
    states = [s["state"] for s in _statuses(events)]
    assert states.index("input-required") < states.index("completed")
    assert "working" in states[states.index("input-required") :]
    assert "option_id='allow' outcome='selected'" in str(_artifacts(events)[-1])


@pytest.mark.asyncio
async def test_a_caller_without_the_extension_answers_with_one_word(
    state: Any, workspace: Path
) -> None:
    said: list[str] = []
    replies = iter(["maybe later", "no"])

    def answer(message: dict[str, Any]) -> dict[str, Any]:
        said.append(_text(message))
        return _message(next(replies), message_id=f"m-{len(said)}")

    _, events, _ = await _run(state, harness_agent(workspace), _message("push"), answer)
    assert len(said) == 2 and "That chooses none of the options" in said[1]
    assert _statuses(events)[-1]["state"] == "completed"
    assert "option_id='reject' outcome='selected'" in str(_artifacts(events)[-1])


def test_one_whole_word_chooses_an_option_and_nothing_else_does() -> None:
    options = [
        {"option_id": "allow", "name": "Allow", "kind": "allow_once"},
        {"option_id": "always", "name": "Always", "kind": "allow_always"},
        {"option_id": "reject", "name": "Reject", "kind": "reject_once"},
    ]
    choose = lambda text: chosen_option(_message(text), options)  # noqa: E731
    assert choose("yes") == "allow" and choose("Allow") == "allow"
    assert choose("always") == "always" and choose("no") == "reject"
    assert choose("reject") == "reject" and choose("ok") == "allow"
    assert choose("yes please") is None and choose("") is None
    assert choose("allow, but only once") is None
    assert (
        chosen_option(
            _message(
                "whatever", metadata={"datalayer": {"approval": {"optionId": "always"}}}
            ),
            options,
        )
        == "always"
    )
    assert (
        chosen_option(
            _message("yes", metadata={"datalayer": {"approval": {"optionId": "nope"}}}),
            options,
        )
        is None
    )


def test_unified_diff_names_the_file_and_a_new_one_comes_from_dev_null() -> None:
    text = unified_diff("a.py", "x = 1\n", "x = 2\n")
    assert text.startswith("--- a/a.py\n+++ b/a.py\n")
    assert "-x = 1\n+x = 2\n" in text
    assert unified_diff("new.txt", None, "hi\n").startswith(
        "--- /dev/null\n+++ b/new.txt\n"
    )
    assert unified_diff("same.txt", "a\n", "a\n") == "--- a/same.txt\n+++ b/same.txt\n"


@pytest.mark.asyncio
async def test_the_card_takes_its_skills_and_output_modes_from_the_harness(
    workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx
    from fasta2a.broker import InMemoryBroker
    from fasta2a.storage import InMemoryStorage

    monkeypatch.setattr(a2a_routes, "_app", None)
    agent = harness_agent(workspace)
    card = a2a_routes.A2AAgentCard(
        id="fake-card",
        name="Fake",
        description="A harness",
        url="http://worker.test/api/v1/a2a/agents/fake-card",
    )
    a2a_routes.register_a2a_agent(
        agent, card, broker=InMemoryBroker(), storage=InMemoryStorage()
    )
    try:
        registration = a2a_routes._a2a_agents["fake-card"]
        assert registration.card.skills[0]["id"] == "fake"
        assert "acp" in registration.card.skills[0]["tags"]
        assert registration.card.default_output_modes == [
            "text/plain",
            DIFF_MEDIA_TYPE,
            "application/json",
        ]
        served = registration.app
        async with (
            served.router.lifespan_context(served),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=served), base_url="http://w"
            ) as http,
        ):
            published = None
            for path in ("/.well-known/agent-card.json", "/.well-known/agent.json"):
                answer = await http.get(path)
                if answer.status_code == 200:
                    published = answer.json()
                    break
        assert published is not None
        assert [s["id"] for s in published["skills"]] == ["fake"]
        assert DIFF_MEDIA_TYPE in published["skills"][0]["outputModes"]
    finally:
        a2a_routes.unregister_a2a_agent("fake-card")
        await agent.cleanup()


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.mark.asyncio
async def test_an_orchestrator_delegates_to_the_harness_and_gets_the_diff_back(
    state: Any, workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The drill: `orchestration/adapters/a2a.py` → the worker over HTTP → a `text/x-diff` artifact."""
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
    url = f"http://127.0.0.1:{port}/api/v1/a2a/agents/fake-drill"
    card = a2a_routes.A2AAgentCard(
        id="fake-drill", name="Fake", description="A harness", url=url
    )
    a2a_routes.register_a2a_agent(
        agent,
        card,
        broker=InMemoryBroker(),
        storage=DurableStorage(state, "fake-drill"),
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
        remote = A2ARemoteAgent(name="fake-drill", url=url, launch="remote")
        resolved = ResolvedWorker(
            binding=an_execution(agent_id="fake-drill", endpoint=url).agent,
            capabilities=A2A_CAPABILITIES,
            endpoint=url,
            details=remote.describe(),
            handle=remote,
        )
        execution = an_execution(
            agent_id="fake-drill", endpoint=url, goal="edit the greeting", references=()
        )
        attempt = an_attempt(execution)
        observations = [
            observation
            async for observation in A2AWorkerAdapter().dispatch(
                resolved, execution, attempt
            )
        ]
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, 10)
        a2a_routes.unregister_a2a_agent("fake-drill")
        a2a_routes.set_a2a_app(None, "/api/v1")
        await agent.cleanup()
    produced = [o for o in observations if getattr(o, "artifact", None) is not None]
    diffs = [o for o in produced if o.artifact.media_type == DIFF_MEDIA_TYPE]
    assert diffs, f"no diff came back: {[str(o)[:120] for o in observations]}"
    [diff] = diffs
    assert diff.artifact.name == "hello.txt"
    assert "+hello, shield" in diff.data["text"]
    [provenance] = diff.artifact.provenance
    assert provenance.content_hash == (
        "sha256:" + hashlib.sha256(diff.data["text"].encode()).hexdigest()
    )
    assert "differs" not in diff.artifact.summary
    assert (workspace / "hello.txt").read_text() == "hello, shield\n"
