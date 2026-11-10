# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Amazon Bedrock AgentCore Runtime's contract, answered by agent-runtimes (AC-01..AC-03).

The contract's routes in process, on an agent registered as configure-from-spec
registers it — its AG-UI app over a pydantic-ai agent — on a model that says
what it was given: ``/ping`` and its timestamp, ``/invocations`` as an AG-UI
run (SSE) and as ``{"prompt"}`` (JSON or SSE), ``/ws``, the session header
mapped to the thread by the padding rule, a run naming another thread
refused, a session unknown to the process resumed from its record; and
``serve --target agentcore`` refusing to start without ``AGENT_SPEC_ID``.
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterator, List

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel
from reactor import PluginPlatform

from agent_runtimes.agentcore import contract
from agent_runtimes.agentcore.contract import LIVENESS, SESSION_HEADER, Liveness
from agent_runtimes.agentcore.session_ids import (
    AGENTCORE_MAX,
    AGENTCORE_MIN,
    PADDING,
    agentcore_to_session_uid,
    session_uid_to_agentcore,
)
from agent_runtimes.agentcore.settings import AGENT_ID, agentcore_settings
from agent_runtimes.apps import plugins, sessions
from agent_runtimes.apps.agent import app_capabilities
from agent_runtimes.apps.loading import load_app
from agent_runtimes.apps.record import AppRecorder, keep_agent_recorder
from agent_runtimes.routes import agents
from agent_runtimes.routes.agui import register_agui_agent, unregister_agui_agent

UID = "session-0001"
SID = session_uid_to_agentcore(UID)

ASSISTANT: Dict[str, Any] = {
    "schema": "loop.app/v1",
    "id": "notes-assistant",
    "name": "Notes Assistant",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "record": {"keep_for": "30_days", "include": ["conversations", "outputs"]},
}


class Said:
    """A model that answers how many prompts it was given and the last one;
    asked to, it calls the ``slow`` tool once first."""

    def __init__(self, with_tool: bool = False) -> None:
        self.prompts: List[List[str]] = []
        self.with_tool = with_tool

    def _prompts(self, messages: List[ModelMessage]) -> List[str]:
        return [
            part.content
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, UserPromptPart) and isinstance(part.content, str)
        ]

    def _called(self, messages: List[ModelMessage]) -> bool:
        return any(
            isinstance(part, ToolReturnPart)
            for message in messages
            for part in getattr(message, "parts", [])
        )

    def said(self, messages: List[ModelMessage]) -> str:
        prompts = self._prompts(messages)
        self.prompts.append(prompts)
        return f"Heard {len(prompts)}: {prompts[-1] if prompts else ''}"

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        if self.with_tool and not self._called(messages):
            return ModelResponse(parts=[ToolCallPart("slow", {})])
        return ModelResponse(parts=[TextPart(self.said(messages))])

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[Any]:
        if self.with_tool and not self._called(messages):
            yield {0: DeltaToolCall(name="slow", json_args="{}", tool_call_id="call-1")}
            return
        text = self.said(messages)
        yield text[:5]
        yield text[5:]


def _register(agent: Agent) -> None:
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    register_agui_agent(
        AGENT_ID,
        AGUITransport(PydanticAIAdapter(agent, agent_id=AGENT_ID), agent_id=AGENT_ID),
    )


@pytest.fixture()
def model() -> Iterator[Said]:
    said = Said()
    _register(Agent(FunctionModel(said, stream_function=said.stream)))
    yield said


@pytest.fixture(autouse=True)
def _fresh() -> Iterator[None]:
    LIVENESS.reset()
    contract.forget_held()
    yield
    unregister_agui_agent(AGENT_ID)
    agents._agentspecs.pop(AGENT_ID, None)
    keep_agent_recorder(AGENT_ID, None)
    sessions.forget_sessions()
    contract.forget_held()
    LIVENESS.reset()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    app = FastAPI()
    app.include_router(contract.router)
    with TestClient(app) as test_client:
        yield test_client


def events_of(response: Any) -> List[Dict[str, Any]]:
    assert response.status_code == 200, response.text
    found: List[Dict[str, Any]] = []
    for block in response.text.split("\n\n"):
        data = "".join(
            line[len("data:") :].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if data:
            found.append(json.loads(data))
    return found


def run_input(text: str, thread: str = UID) -> Dict[str, Any]:
    return {
        "threadId": thread,
        "runId": "run-1",
        "state": {},
        "messages": [{"id": "m-1", "role": "user", "content": text}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


# --- AC-03: the padding rule ------------------------------------------------------------


@pytest.mark.parametrize(
    "uid", ["abcd1234", UID, "a" * 25, "a" * 33, "x_Y-9" * 25 + "abc"]
)
def test_a_session_uid_goes_to_agentcore_and_back_whole(uid: str) -> None:
    sid = session_uid_to_agentcore(uid)
    assert AGENTCORE_MIN <= len(sid) <= AGENTCORE_MAX
    assert sid == PADDING + uid
    assert agentcore_to_session_uid(sid) == uid


def test_the_shortest_uid_is_exactly_agentcores_shortest_id() -> None:
    assert len(session_uid_to_agentcore("abcd1234")) == AGENTCORE_MIN


@pytest.mark.parametrize("uid", ["", "short", "has space x", "a" * 129, "dots.are.not"])
def test_what_is_not_a_session_uid_is_refused(uid: str) -> None:
    with pytest.raises(ValueError, match="is not a session uid"):
        session_uid_to_agentcore(uid)


@pytest.mark.parametrize(
    "sid", ["", UID, "f" * 40, PADDING, PADDING + "short", "x" + SID]
)
def test_what_the_rule_did_not_make_is_not_a_session(sid: str) -> None:
    with pytest.raises(ValueError, match="is not a Datalayer session"):
        agentcore_to_session_uid(sid)


# --- AC-02: /ping -----------------------------------------------------------------------


def test_ping_is_healthy_with_no_time_before_any_change(client: TestClient) -> None:
    assert client.get("/ping").json() == {"status": "Healthy"}
    assert client.get("/ping").json() == {"status": "Healthy"}


def test_the_time_is_taken_on_a_change_and_the_same_on_every_ping() -> None:
    now = [1000.0]
    liveness = Liveness(clock=lambda: now[0])
    liveness.begin()
    assert liveness.ping() == {"status": "HealthyBusy", "time_of_last_update": 1000}
    now[0] = 1005.0
    liveness.begin()  # more work: busy already, no change
    assert liveness.ping() == {"status": "HealthyBusy", "time_of_last_update": 1000}
    liveness.end()
    now[0] = 1010.0
    assert liveness.ping() == {"status": "HealthyBusy", "time_of_last_update": 1000}
    liveness.end()
    assert liveness.ping() == {"status": "Healthy", "time_of_last_update": 1010}
    now[0] = 2000.0
    assert liveness.ping() == {"status": "Healthy", "time_of_last_update": 1010}


def test_busy_during_a_long_tool_call_then_healthy(client: TestClient) -> None:
    seen: List[Dict[str, Any]] = []
    said = Said(with_tool=True)
    agent = Agent(FunctionModel(said, stream_function=said.stream))

    @agent.tool_plain
    async def slow() -> str:
        """A long tool call."""
        await asyncio.sleep(0.05)
        seen.append(LIVENESS.ping())
        return "done"

    _register(agent)
    answer = client.post(
        "/invocations",
        headers={SESSION_HEADER: SID, "Accept": "application/json"},
        json={"prompt": "Go"},
    )
    assert answer.json() == {"response": "Heard 1: Go", "status": "success"}
    assert [s["status"] for s in seen] == ["HealthyBusy"]
    after = client.get("/ping").json()
    assert after["status"] == "Healthy"
    assert after["time_of_last_update"] >= seen[0]["time_of_last_update"]
    assert client.get("/ping").json() == after


def test_a_background_task_keeps_it_busy_until_done() -> None:
    async def scenario() -> List[str]:
        gate = asyncio.Event()

        async def work() -> None:
            await gate.wait()

        task = contract.track_background(asyncio.ensure_future(work()))
        states = [LIVENESS.ping()["status"]]
        gate.set()
        await task
        await asyncio.sleep(0)
        states.append(LIVENESS.ping()["status"])
        return states

    assert asyncio.run(scenario()) == ["HealthyBusy", "Healthy"]


# --- AC-02 / AC-03: /invocations ------------------------------------------------------


def test_a_run_agent_input_is_streamed_as_sse_on_the_sessions_thread(
    client: TestClient, model: Said
) -> None:
    events = events_of(
        client.post(
            "/invocations", headers={SESSION_HEADER: SID}, json=run_input("Hello")
        )
    )
    assert events[0]["type"] == "RUN_STARTED"
    assert events[0]["threadId"] == UID
    assert "RUN_FINISHED" in [e["type"] for e in events]
    text = "".join(
        e.get("delta", "") for e in events if e["type"] == "TEXT_MESSAGE_CONTENT"
    )
    assert text == "Heard 1: Hello"


def test_a_run_without_a_thread_is_given_the_sessions(
    client: TestClient, model: Said
) -> None:
    body = run_input("Hello")
    del body["threadId"]
    events = events_of(
        client.post("/invocations", headers={SESSION_HEADER: SID}, json=body)
    )
    assert events[0]["threadId"] == UID


def test_a_run_naming_the_agentcore_id_itself_is_the_same_session(
    client: TestClient, model: Said
) -> None:
    events = events_of(
        client.post(
            "/invocations", headers={SESSION_HEADER: SID}, json=run_input("Hi", SID)
        )
    )
    assert events[0]["threadId"] == UID


def test_a_prompt_is_answered_as_json(client: TestClient, model: Said) -> None:
    answer = client.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "Hello"}
    )
    assert answer.status_code == 200
    assert answer.json() == {"response": "Heard 1: Hello", "status": "success"}


def test_a_prompt_is_streamed_when_the_client_takes_events(
    client: TestClient, model: Said
) -> None:
    events = events_of(
        client.post(
            "/invocations",
            headers={SESSION_HEADER: SID, "Accept": "text/event-stream"},
            json={"prompt": "Hello"},
        )
    )
    assert events[0]["type"] == "RUN_STARTED"
    assert "RUN_FINISHED" in [e["type"] for e in events]
    assert events[0]["threadId"] == UID


def test_a_sessions_prompts_carry_its_earlier_turns(
    client: TestClient, model: Said
) -> None:
    # A {"prompt"} caller sends only its new message: the session's earlier
    # turns, kept in this process, go before it (10 November 2026).
    first = client.post(
        "/invocations",
        headers={SESSION_HEADER: SID},
        json={"prompt": "Remember PELICAN"},
    )
    assert first.json()["response"] == "Heard 1: Remember PELICAN"
    second = client.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "What word?"}
    )
    assert second.json()["response"] == "Heard 2: What word?"
    assert model.prompts[-1] == ["Remember PELICAN", "What word?"]


def test_a_streamed_prompt_is_remembered_too_and_sessions_stay_apart(
    client: TestClient, model: Said
) -> None:
    events_of(
        client.post(
            "/invocations",
            headers={SESSION_HEADER: SID, "Accept": "text/event-stream"},
            json={"prompt": "One"},
        )
    )
    again = client.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "Two"}
    )
    assert again.json()["response"] == "Heard 2: Two"
    from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore

    alone = client.post(
        "/invocations",
        headers={SESSION_HEADER: session_uid_to_agentcore("session-0002")},
        json={"prompt": "Fresh"},
    )
    assert alone.json()["response"] == "Heard 1: Fresh"


def test_an_ag_ui_run_brings_its_own_conversation(
    client: TestClient, model: Said
) -> None:
    client.post("/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "Kept"})
    events_of(
        client.post(
            "/invocations", headers={SESSION_HEADER: SID}, json=run_input("Alone")
        )
    )
    assert model.prompts[-1] == ["Alone"]


def test_a_run_naming_another_thread_is_refused_in_a_sentence(
    client: TestClient, model: Said
) -> None:
    refused = client.post(
        "/invocations",
        headers={SESSION_HEADER: SID},
        json=run_input("Hi", "session-0002"),
    )
    assert refused.status_code == 400
    assert refused.json()["detail"] == (
        f"The run names thread session-0002, but the invocation is session {UID} "
        f"({SESSION_HEADER}): one session per invocation."
    )
    other = client.post(
        "/invocations",
        headers={SESSION_HEADER: SID},
        json={"prompt": "Hi", "session_id": "session-0002"},
    )
    assert other.status_code == 400
    assert model.prompts == []


def test_an_invocation_without_its_session_or_with_a_foreign_one_is_refused(
    client: TestClient, model: Said
) -> None:
    missing = client.post("/invocations", json={"prompt": "Hi"})
    assert (missing.status_code, missing.json()["detail"]) == (
        400,
        f"An invocation names its session in {SESSION_HEADER}.",
    )
    foreign = client.post(
        "/invocations", headers={SESSION_HEADER: "f" * 40}, json={"prompt": "Hi"}
    )
    assert foreign.status_code == 400
    assert "is not a Datalayer session" in foreign.json()["detail"]


def test_neither_shape_is_refused(client: TestClient, model: Said) -> None:
    refused = client.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"text": "Hi"}
    )
    assert refused.status_code == 400
    assert "RunAgentInput" in refused.json()["detail"]


def test_no_agent_configured_is_said(client: TestClient) -> None:
    refused = client.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "Hi"}
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        503,
        "No agent is configured on this runtime to invoke.",
    )


# --- AC-02: /ws -------------------------------------------------------------------------


def test_the_websocket_runs_the_same_turn(client: TestClient, model: Said) -> None:
    with client.websocket_connect("/ws", headers={SESSION_HEADER: SID}) as socket:
        socket.send_text(json.dumps({"prompt": "Hello", "session_id": UID}))
        received: List[Dict[str, Any]] = []
        while True:
            message = json.loads(socket.receive_text())
            received.append(message)
            if "status" in message:
                break
        assert received[0]["type"] == "RUN_STARTED"
        assert received[0]["threadId"] == UID
        assert received[-1] == {
            "response": "Heard 1: Hello",
            "status": "success",
            "session_id": UID,
        }
        socket.send_text(json.dumps({"prompt": "Again", "session_id": "session-0002"}))
        refused = json.loads(socket.receive_text())
        assert refused["status"] == "error"
        assert "one session per invocation" in refused["error"]


# --- AC-03: a session unknown to the process, resumed from its record ------------------


@pytest.fixture()
def recorded(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[Said]:
    """An agent running an application whose record is the test's file store."""
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(plugins, "PLATFORM", PluginPlatform())
    app = load_app(ASSISTANT)
    plugins.register_app(app)
    instance = {"app_uid": "app-1"}
    recorder = AppRecorder(app=app, app_uid="app-1")
    said = Said()
    agent = Agent(
        FunctionModel(said, stream_function=said.stream),
        capabilities=app_capabilities(app, recorder=recorder, agent_id=AGENT_ID),
    )
    _register(agent)
    agents._agentspecs[AGENT_ID] = {"app_spec": ASSISTANT, "app_instance": instance}
    keep_agent_recorder(AGENT_ID, recorder)
    yield said


def test_a_session_unknown_here_is_resumed_from_its_record(
    client: TestClient, recorded: Said
) -> None:
    uid = "session-resume-0001"
    sid = session_uid_to_agentcore(uid)
    first = client.post(
        "/invocations", headers={SESSION_HEADER: sid}, json={"prompt": "Remember"}
    )
    assert first.json() == {"response": "Heard 1: Remember", "status": "success"}
    # Another microVM: nothing held, the record alone knows the session.
    contract.forget_held()
    sessions.forget_sessions()
    second = client.post(
        "/invocations", headers={SESSION_HEADER: sid}, json={"prompt": "Again"}
    )
    assert second.json() == {"response": "Heard 2: Again", "status": "success"}
    assert recorded.prompts[-1] == ["Remember", "Again"]
    # Held now: the next turn is not given the record again.
    third = client.post(
        "/invocations",
        headers={SESSION_HEADER: sid},
        json={
            **run_input("Third", uid),
            "messages": [
                {"id": "a", "role": "user", "content": "Remember"},
                {"id": "b", "role": "assistant", "content": "Heard 1: Remember"},
                {"id": "c", "role": "user", "content": "Third"},
            ],
        },
    )
    assert third.status_code == 200
    assert recorded.prompts[-1] == ["Remember", "Third"]


def test_each_invocation_is_recorded_with_its_wall_time(
    client: TestClient, recorded: Said
) -> None:
    """The run's end in the record carries its invocation: what the usage sums
    as invocation hours, measured from the invocation's arrival to the run's end."""
    from agent_runtimes.apps.record import agent_recorder

    recorder = agent_recorder(AGENT_ID)
    assert recorder is not None
    bodies: List[Dict[str, Any]] = []

    async def kept(body: Dict[str, Any]) -> None:
        bodies.append(body)

    recorder.send = kept
    sid = session_uid_to_agentcore("session-invoked-0001")
    before = time.time()
    for prompt in ("One", "Two"):
        answer = client.post(
            "/invocations", headers={SESSION_HEADER: sid}, json={"prompt": prompt}
        )
        assert answer.json()["status"] == "success"
    # Streamed as SSE: the same.
    streamed = client.post(
        "/invocations",
        headers={SESSION_HEADER: sid},
        json=run_input("Three", "session-invoked-0001"),
    )
    assert streamed.status_code == 200
    ends = [
        entry["payload"]
        for body in bodies
        for entry in body["entries"]
        if entry["kind"] == "output"
    ]
    assert len(ends) == 3
    for end in ends:
        invocation = end["invocation"]
        assert invocation["target"] == "agentcore"
        assert invocation["ended_at"] == end["ended_at"]
        assert 0 <= invocation["seconds"] <= time.time() - before
        # The process's start, the same on every invocation it answers.
        assert (
            invocation["microvm_started_at"]
            == ends[0]["invocation"]["microvm_started_at"]
        )
    assert ends[0]["invocation"]["started_at"] <= ends[1]["invocation"]["started_at"]


def test_a_first_session_is_run_as_it_comes(client: TestClient, recorded: Said) -> None:
    sid = session_uid_to_agentcore("session-new-0001")
    answer = client.post(
        "/invocations", headers={SESSION_HEADER: sid}, json={"prompt": "Hi"}
    )
    assert answer.json() == {"response": "Heard 1: Hi", "status": "success"}


# --- AC-01: serve --target agentcore ----------------------------------------------------


def test_the_settings_refuse_without_a_spec_and_read_the_port() -> None:
    with pytest.raises(ValueError) as refused:
        agentcore_settings({})
    assert str(refused.value) == (
        "--target agentcore serves the agentspec named by AGENT_SPEC_ID, which is not set."
    )
    default = agentcore_settings({"AGENT_SPEC_ID": "crawler"})
    assert (default.spec_id, default.host, default.port) == ("crawler", "0.0.0.0", 8080)
    moved = agentcore_settings({"AGENT_SPEC_ID": "crawler", "AGENTCORE_PORT": "9090"})
    assert moved.port == 9090
    with pytest.raises(ValueError, match="AGENTCORE_PORT is a port"):
        agentcore_settings({"AGENT_SPEC_ID": "crawler", "AGENTCORE_PORT": "http"})


def test_serve_refuses_to_start_without_agent_spec_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import uvicorn

    from agent_runtimes.commands.serve import ServeError, Target, serve_server

    monkeypatch.delenv("AGENT_SPEC_ID", raising=False)
    started: List[Any] = []
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: started.append(k))
    with pytest.raises(ServeError, match="AGENT_SPEC_ID, which is not set"):
        serve_server(target=Target.agentcore)
    assert started == []


def test_serve_starts_on_agentcores_host_and_port_from_the_spec(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import uvicorn

    from agent_runtimes.commands.serve import ServeError, Target, serve_server
    from agent_runtimes.specs.agents import AGENTSPECS

    spec_id = next(iter(AGENTSPECS))
    for name in (
        "AGENT_RUNTIMES_TARGET",
        "AGENT_RUNTIMES_PROTOCOL",
        "AGENT_RUNTIMES_PORT",
    ):
        monkeypatch.setenv(name, "")
    for name in ("AGENT_RUNTIMES_NODE", "AGENT_RUNTIMES_DISABLE_TOOL_APPROVALS"):
        monkeypatch.setenv(name, "false")
    monkeypatch.setenv("AGENT_SPEC_ID", spec_id)
    monkeypatch.delenv("AGENTCORE_PORT", raising=False)
    started: List[Dict[str, Any]] = []
    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: started.append(k))
    assert serve_server(target=Target.agentcore) == 8080
    assert (started[0]["host"], started[0]["port"]) == ("0.0.0.0", 8080)
    import os

    assert os.environ["AGENT_RUNTIMES_TARGET"] == "agentcore"
    assert os.environ["AGENT_RUNTIMES_PROTOCOL"] == "ag-ui"
    monkeypatch.setenv("AGENT_SPEC_ID", "no-such-agentspec")
    with pytest.raises(ServeError, match="the library does not have"):
        serve_server(target=Target.agentcore)
    monkeypatch.setenv("AGENT_SPEC_ID", spec_id)
    with pytest.raises(ServeError, match="not --agent-id"):
        serve_server(target=Target.agentcore, agent_id=spec_id)


def test_the_app_answers_the_contract_at_the_root_only_for_the_target(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.app import create_app

    # Not entered: no lifespan, so no agent configured, and the routes answer.
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "agentcore")
    target = TestClient(create_app())
    assert target.get("/ping").json() == {"status": "Healthy"}
    assert target.post("/invocations", json={"prompt": "Hi"}).status_code == 400
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "")
    plain = TestClient(create_app())
    assert plain.get("/ping").status_code == 404
    assert plain.post("/invocations", json={"prompt": "Hi"}).status_code in (404, 405)


def test_the_agent_is_configured_at_start_as_a_pool_pods_is(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from fastapi import HTTPException

    from agent_runtimes.routes import agents as agent_routes

    asked: List[Any] = []

    async def configure(request: Any, body: Any) -> Dict[str, Any]:
        asked.append(body)
        if body.agent_spec_id == "refused":
            raise HTTPException(
                status_code=404, detail="Agentspec 'refused' not found."
            )
        return {"success": True}

    monkeypatch.setattr(agent_routes, "configure_from_spec_endpoint", configure)
    monkeypatch.setenv("AGENT_SPEC_ID", "crawler")
    asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))
    assert (asked[0].agent_spec_id, asked[0].agent_id, asked[0].transport) == (
        "crawler",
        "default",
        "ag-ui",
    )
    monkeypatch.setenv("AGENT_SPEC_ID", "refused")
    with pytest.raises(RuntimeError) as refused:
        asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))
    assert str(refused.value) == (
        "The agentspec refused was not configured: Agentspec 'refused' not found."
    )


def test_a_run_holds_the_workload_token_agentcore_sent():
    """The `agentcore` identity provider finds the invocation's workload token while the run runs."""
    import asyncio

    from agent_runtimes.agentcore import identity
    from agent_runtimes.agentcore.contract import collected

    seen: list[str] = []

    async def agent_app(scope, receive, send):
        seen.append(identity._WORKLOAD_TOKEN.get())
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}"})

    scope = {
        "type": "http",
        "headers": [(b"workloadaccesstoken", b"wat-123"), (b"host", b"x")],
    }
    status, _, _ = asyncio.run(collected(agent_app, scope, {"messages": []}, []))
    assert status == 200
    assert seen == ["wat-123"]
    assert identity._WORKLOAD_TOKEN.get() == ""
