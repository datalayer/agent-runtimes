# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
# The session API's fixtures are imported under their own names, and named again
# as the tests' parameters.
# ruff: noqa: F811

"""A run's model is checked against the models its agent offers.

The models an agent offers are its ``model`` and its ``model_additionals``
(`offered.offered_model_ids`, what ``GET /configure/models`` lists). A run
that names one of them runs on it; a run that names none runs on the agent's
own; a run that names any other is refused with a 400 and a sentence, never
run on something else. When the agent's models cannot be told, only a run
that names none is answered. A visitor and the signed-in owner are held to
the same rule, at every entry point that takes a model: the application's
AG-UI route, an agent's AG-UI and Vercel AI transports, ACP, and the modes
and profiles an Appspec names, checked when it is loaded. A2A, the
session's settings and an operation's call take no model.
"""

from __future__ import annotations

from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.models import offered
from agent_runtimes.routes import agents as agent_routes
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    answer_of,
    as_,
    events_of,
    remote,  # noqa: F401  (the fixture, registered under its own name)
    runtime,  # noqa: F401  (the fixture, registered under its own name)
)
from agent_runtimes.tests.test_app_visitors import (  # noqa: F401
    AGUI,
    agui,
    as_visitor,
    make_example,
    visitors_runtime,
)

#: cog-crawler's model and its model_additionals, as the library has them.
SONNET = "bedrock:us.anthropic.claude-sonnet-4-6"
QWEN = "alibaba:qwen-max"
#: Another model of the catalogue: not one cog-crawler offers.
OPUS = "bedrock:us.anthropic.claude-opus-5"


def refusal(model: str, models: List[str] = [SONNET, QWEN]) -> str:
    return (
        f"{model} is not one of the models this agent offers "
        f"({', '.join(models)}): the run was refused."
    )


def unknown(model: str) -> str:
    return (
        "The models this agent offers are not known here, so a run names none: "
        f"{model} was refused."
    )


def made_from_the_library(agent_id: str) -> None:
    """Kept as the create route keeps an application's agent: its library spec named."""
    agent_routes._agentspecs[agent_id] = {
        **(agent_routes._agentspecs.get(agent_id) or {}),
        "agent_spec_id": "cog-crawler:0.0.1",
        "model": SONNET,
    }


@pytest.fixture()
def on_the_model_asked(monkeypatch: pytest.MonkeyPatch) -> List[str]:
    """A model the run names answers which it is, and is kept: no provider is called."""
    asked: List[str] = []

    def model_of_request(agent_id: Any, model: str) -> Any:
        asked.append(model)

        def answer(messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart(f"On {model}")])

        async def stream(messages: List[ModelMessage], info: AgentInfo) -> Any:
            yield f"On {model}"

        return FunctionModel(answer, stream_function=stream)

    from agent_runtimes.models import models

    monkeypatch.setattr(models, "model_of_request", model_of_request)
    return asked


# --- the one check ------------------------------------------------------------------


def test_the_check_takes_the_agents_models_and_refuses_any_other(
    runtime: Runtime,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    made_from_the_library("notes-assistant")
    assert offered.run_model_refusal("notes-assistant", SONNET) is None
    assert offered.run_model_refusal("notes-assistant", QWEN) is None
    assert offered.run_model_refusal("notes-assistant", None) is None
    assert offered.run_model_refusal("notes-assistant", "") is None
    assert offered.run_model_refusal("notes-assistant", OPUS) == refusal(OPUS)
    # An agent nobody made, or one whose models are not kept: only no model.
    assert offered.run_model_refusal("nobody", OPUS) == unknown(OPUS)
    assert offered.run_model_refusal("nobody", None) is None
    runtime.make("bare", ASSISTANT, {"app_uid": "app-2"})
    assert offered.run_model_refusal("bare", SONNET) == unknown(SONNET)


# --- the application's AG-UI route: a visitor ---------------------------------------


def test_a_visitors_run_on_the_agents_own_model_runs_on_it(
    runtime: Runtime, visitors_runtime: TestClient, on_the_model_asked: List[str]
) -> None:
    make_example(runtime)
    made_from_the_library("notes-assistant")
    events = events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json={**agui("thread-own"), "model": SONNET},
        )
    )
    assert answer_of(events) == f"On {SONNET}"
    assert on_the_model_asked == [SONNET]


def test_a_visitors_run_on_one_of_its_additional_models_runs_on_it(
    runtime: Runtime, visitors_runtime: TestClient, on_the_model_asked: List[str]
) -> None:
    make_example(runtime)
    made_from_the_library("notes-assistant")
    events = events_of(
        visitors_runtime.post(
            AGUI,
            headers=as_visitor("tab-ada-0001"),
            json={**agui("thread-additional"), "model": QWEN},
        )
    )
    assert answer_of(events) == f"On {QWEN}"
    assert on_the_model_asked == [QWEN]


def test_a_visitors_run_on_another_model_is_refused_in_a_sentence(
    runtime: Runtime, visitors_runtime: TestClient, on_the_model_asked: List[str]
) -> None:
    make_example(runtime)
    made_from_the_library("notes-assistant")
    refused = visitors_runtime.post(
        AGUI,
        headers=as_visitor("tab-ada-0001"),
        json={**agui("thread-other"), "model": OPUS},
    )
    assert refused.status_code == 400, refused.text
    assert refused.json()["detail"] == refusal(OPUS)
    assert on_the_model_asked == []


def test_a_visitors_run_naming_no_model_runs_on_the_agents_own(
    runtime: Runtime, visitors_runtime: TestClient, on_the_model_asked: List[str]
) -> None:
    make_example(runtime)
    made_from_the_library("notes-assistant")
    for thread, run in (
        ("thread-none", agui("thread-none")),
        ("thread-empty", {**agui("thread-empty"), "model": ""}),
    ):
        events = events_of(
            visitors_runtime.post(AGUI, headers=as_visitor("tab-ada-0001"), json=run)
        )
        assert answer_of(events).startswith("Heard 1: Hello"), thread
    assert on_the_model_asked == []


def test_a_visitors_run_on_an_agent_whose_models_are_not_known_names_none(
    runtime: Runtime, visitors_runtime: TestClient, on_the_model_asked: List[str]
) -> None:
    make_example(runtime)
    refused = visitors_runtime.post(
        AGUI,
        headers=as_visitor("tab-ada-0001"),
        json={**agui("thread-unknown"), "model": SONNET},
    )
    assert refused.status_code == 400, refused.text
    assert refused.json()["detail"] == unknown(SONNET)
    answered = visitors_runtime.post(
        AGUI, headers=as_visitor("tab-ada-0001"), json=agui("thread-unknown-2")
    )
    assert answer_of(events_of(answered)).startswith("Heard 1: Hello")
    assert on_the_model_asked == []


# --- the application's AG-UI route: the signed-in owner ------------------------------


def test_the_owners_run_is_held_to_the_same_rule(
    runtime: Runtime, remote: TestClient, on_the_model_asked: List[str]
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    made_from_the_library("notes-assistant")
    url = "/api/v1/apps/agents/notes-assistant/ag-ui/"
    own = events_of(
        remote.post(
            url, headers=as_("ada"), json={**agui("thread-own-1"), "model": SONNET}
        )
    )
    assert answer_of(own) == f"On {SONNET}"
    additional = events_of(
        remote.post(
            url, headers=as_("ada"), json={**agui("thread-add-1"), "model": QWEN}
        )
    )
    assert answer_of(additional) == f"On {QWEN}"
    refused = remote.post(
        url, headers=as_("ada"), json={**agui("thread-other-1"), "model": OPUS}
    )
    assert refused.status_code == 400 and refused.json()["detail"] == refusal(OPUS)
    # Not even in a conversation already open.
    again = remote.post(
        url, headers=as_("ada"), json={**agui("thread-own-1"), "model": OPUS}
    )
    assert again.status_code == 400 and again.json()["detail"] == refusal(OPUS)
    none = events_of(remote.post(url, headers=as_("ada"), json=agui("thread-none-1")))
    assert answer_of(none).startswith("Heard 1: Hello")
    assert on_the_model_asked == [SONNET, QWEN]


def test_the_session_settings_take_no_model(
    runtime: Runtime, remote: TestClient
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    made_from_the_library("notes-assistant")
    url = "/api/v1/apps/agents/notes-assistant/ag-ui/"
    events_of(remote.post(url, headers=as_("ada"), json=agui("thread-settings-1")))
    changed = remote.put(
        "/api/v1/apps/sessions/thread-settings-1/settings",
        headers=as_("ada"),
        json={"values": {"model": OPUS}},
    )
    assert changed.status_code == 422
    assert changed.json()["detail"] == "There is no field model."
    run = remote.post(
        url,
        headers=as_("ada"),
        json={
            **agui("thread-settings-1"),
            "forwardedProps": {"loop": {"settings": {"model": OPUS}}},
        },
    )
    assert run.status_code == 422


# --- an agent's own AG-UI transport ----------------------------------------------------


def _agui_transport(agent_id: str) -> Any:
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    from agent_runtimes.transports.agui import AGUITransport

    class Adapter:
        _agent = Agent(TestModel())
        _agent_id = agent_id

    return AGUITransport(Adapter(), agent_id=agent_id)  # type: ignore[arg-type]


@pytest.fixture()
def kept_agent(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    monkeypatch.setitem(
        agent_routes._agentspecs,
        "desk",
        {
            "model": SONNET,
            "agent_spec_id": None,
            "agent_spec": {"model": SONNET, "model_additionals": [QWEN]},
        },
    )
    yield "desk"


def _agui_post(agent_id: str, model: Any, monkeypatch: pytest.MonkeyPatch) -> Any:
    from starlette.responses import PlainTextResponse
    from starlette.testclient import TestClient as StarletteClient

    from agent_runtimes.models import models
    from agent_runtimes.transports import agui as agui_transport

    called: List[Any] = []

    async def dispatch(request: Any, **kwargs: Any) -> Any:
        called.append(kwargs.get("model"))
        return PlainTextResponse("ran")

    monkeypatch.setattr(agui_transport.AGUIAdapter, "dispatch_request", dispatch)
    monkeypatch.setattr(models, "model_of_request", lambda agent, asked: asked)
    run: Dict[str, Any] = {
        "threadId": "t",
        "runId": "r",
        "messages": [{"id": "m", "role": "user", "content": "Hello"}],
        "tools": [],
        "context": [],
        "state": None,
        "forwardedProps": None,
    }
    if model is not None:
        run["model"] = model
    response = StarletteClient(_agui_transport(agent_id).get_app()).post("/", json=run)
    return response, called


def test_an_agui_run_on_the_agents_models_runs_and_on_another_is_refused(
    kept_agent: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    for model in (SONNET, QWEN):
        response, called = _agui_post(kept_agent, model, monkeypatch)
        assert response.status_code == 200 and called == [model]
    response, called = _agui_post(kept_agent, OPUS, monkeypatch)
    assert response.status_code == 400 and called == []
    assert response.json()["detail"] == refusal(OPUS)
    response, called = _agui_post(kept_agent, None, monkeypatch)
    assert response.status_code == 200 and called == [None]


def test_an_agui_run_of_an_agent_whose_models_are_not_known_names_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response, called = _agui_post("unkept", OPUS, monkeypatch)
    assert response.status_code == 400 and called == []
    assert response.json()["detail"] == unknown(OPUS)
    response, called = _agui_post("unkept", None, monkeypatch)
    assert response.status_code == 200 and called == [None]


# --- an agent's Vercel AI transport ----------------------------------------------------


def _vercel_post(agent_id: str, model: Any, monkeypatch: pytest.MonkeyPatch) -> Any:
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel
    from starlette.applications import Starlette
    from starlette.responses import PlainTextResponse
    from starlette.routing import Route
    from starlette.testclient import TestClient as StarletteClient

    from agent_runtimes.transports import vercel_ai
    from agent_runtimes.transports.vercel_ai import VercelAITransport

    called: List[Any] = []

    async def dispatch(*args: Any, **kwargs: Any) -> Any:
        called.append(kwargs.get("model"))
        return PlainTextResponse("ran")

    monkeypatch.setattr(vercel_ai.VercelAIAdapter, "dispatch_request", dispatch)
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "local")

    class Adapter:
        _agent = Agent(TestModel())
        _agent_id = agent_id

    transport = VercelAITransport(Adapter(), agent_id=agent_id)  # type: ignore[arg-type]

    async def chat(request: Any) -> Any:
        return await transport.handle_vercel_request(request)

    run: Dict[str, Any] = {
        "trigger": "submit-message",
        "id": "chat-1",
        "messages": [
            {"id": "m", "role": "user", "parts": [{"type": "text", "text": "Hello"}]}
        ],
    }
    if model is not None:
        run["model"] = model
    app = Starlette(routes=[Route("/", chat, methods=["POST"])])
    return StarletteClient(app).post("/", json=run), called


def test_a_vercel_ai_run_on_another_model_is_refused_in_the_same_sentence(
    kept_agent: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    response, called = _vercel_post(kept_agent, OPUS, monkeypatch)
    assert response.status_code == 400 and called == []
    assert response.json()["detail"] == refusal(OPUS)
    response, called = _vercel_post(kept_agent, QWEN, monkeypatch)
    assert response.status_code == 200 and called == [QWEN]


def test_a_vercel_ai_run_of_an_agent_whose_models_are_not_known_names_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response, called = _vercel_post("unkept", OPUS, monkeypatch)
    assert response.status_code == 400 and called == []
    assert response.json()["detail"] == unknown(OPUS)


# --- ACP ------------------------------------------------------------------------------


class _Told:
    """An ACP agent that keeps the model each turn was given."""

    def __init__(self) -> None:
        self.models: List[Any] = []

    def agent(self) -> Any:
        from agent_runtimes.adapters.base import BaseAgent, StreamEvent

        told = self

        class Agent(BaseAgent):
            async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
                raise NotImplementedError

            async def stream(self, prompt: str, context: Any) -> Any:
                told.models.append((context.metadata or {}).get("model"))
                yield StreamEvent(type="text", data="Done.")
                yield StreamEvent(type="done", data=None)

            def get_tools(self) -> List[Any]:
                return []

            @property
            def name(self) -> str:
                return "desk"

            @property
            def description(self) -> str:
                return "desk"

            @property
            def version(self) -> str:
                return "1.0.0"

        return Agent()


@pytest.fixture()
def acp(tmp_path: Any, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    from fastapi import FastAPI

    from agent_runtimes.protocol_state import store as state_store
    from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
    from agent_runtimes.routes.acp import router as acp_router

    monkeypatch.setattr(
        state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite")
    )
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    with TestClient(app) as client:
        yield client


def _acp_turn(client: TestClient, agent_id: str, told: _Told, model: Any) -> Any:
    from agent_runtimes.routes.acp import AgentInfo, register_agent

    register_agent(told.agent(), AgentInfo(id=agent_id, name=agent_id))
    with client.websocket_connect(f"/api/v1/acp/ws/{agent_id}") as websocket:

        def request(identifier: int, method: str, params: Dict[str, Any]) -> Any:
            websocket.send_json(
                {"jsonrpc": "2.0", "id": identifier, "method": method, "params": params}
            )
            while True:
                message = websocket.receive_json()
                if message.get("id") == identifier:
                    return message

        request(1, "initialize", {"protocolVersion": 1})
        created = request(2, "session/new", {"cwd": "/work", "mcpServers": []})
        session = created["result"]["sessionId"]
        return request(
            3,
            "session/prompt",
            {
                "sessionId": session,
                "prompt": [{"type": "text", "text": "Hello"}],
                **({"metadata": {"model": model}} if model is not None else {}),
            },
        )


def test_an_acp_prompt_on_another_model_is_refused_and_on_the_agents_runs(
    acp: TestClient, kept_agent: str
) -> None:
    told = _Told()
    answered = _acp_turn(acp, kept_agent, told, OPUS)
    assert answered["error"]["message"] == refusal(OPUS)
    assert told.models == []
    answered = _acp_turn(acp, kept_agent, told, QWEN)
    assert "error" not in answered, answered
    answered = _acp_turn(acp, kept_agent, told, None)
    assert "error" not in answered, answered
    assert told.models == [QWEN, None]


def test_a_legacy_acp_run_on_another_model_is_refused(
    acp: TestClient, kept_agent: str
) -> None:
    from agent_runtimes.routes.acp import AgentInfo, register_agent

    told = _Told()
    register_agent(told.agent(), AgentInfo(id=kept_agent, name=kept_agent))
    with acp.websocket_connect(f"/api/v1/acp/ws/{kept_agent}") as websocket:

        def request(identifier: int, method: str, params: Dict[str, Any]) -> Any:
            websocket.send_json(
                {"jsonrpc": "2.0", "id": identifier, "method": method, "params": params}
            )
            while True:
                message = websocket.receive_json()
                if message.get("id") == identifier:
                    return message

        request(1, "initialize", {"protocolVersion": 1})
        request(2, "acp.session.new", {"cwd": "/work", "mcpServers": []})
        refused = request(
            3,
            "acp.session.run",
            {"input": ["Hello"], "stream": False, "metadata": {"model": OPUS}},
        )
    assert refused["error"]["message"] == refusal(OPUS)
    assert told.models == []


def test_an_acp_prompt_of_an_agent_whose_models_are_not_known_names_none(
    acp: TestClient,
) -> None:
    told = _Told()
    answered = _acp_turn(acp, "unkept-acp", told, OPUS)
    assert answered["error"]["message"] == unknown(OPUS)
    assert told.models == []


# --- modes and profiles: the Maker's models, checked when the Appspec is loaded --------


def test_a_mode_or_a_profile_naming_a_model_its_agent_does_not_offer_is_not_loaded() -> (
    None
):
    from agent_runtimes.apps.loading import AppNotRunnable, load_app

    def moded(model: str) -> Dict[str, Any]:
        return {
            **ASSISTANT,
            "interface": {
                **ASSISTANT["interface"],
                "modes": [
                    {
                        "id": "depth",
                        "label": "Depth",
                        "options": [
                            {"id": "quick", "label": "Quick"},
                            {"id": "deep", "label": "Deep", "model": model},
                        ],
                    }
                ],
            },
        }

    def profiled(model: str) -> Dict[str, Any]:
        return {
            **ASSISTANT,
            "interface": {
                **ASSISTANT["interface"],
                "profiles": [
                    {"id": "support", "label": "Support"},
                    {"id": "sales", "label": "Sales", "model": model},
                ],
            },
        }

    assert load_app(moded(QWEN)).interface.modes[0].options[1].model == QWEN
    assert load_app(profiled(SONNET)).interface.profiles[1].model == SONNET
    with pytest.raises(AppNotRunnable) as refused:
        load_app(moded(OPUS))
    assert refused.value.problems == [
        f"The option Deep of the mode Depth runs on {OPUS}, which is not one of "
        f"the models its agent offers ({SONNET}, {QWEN})."
    ]
    with pytest.raises(AppNotRunnable) as refused:
        load_app(profiled(OPUS))
    assert refused.value.problems == [
        f"The profile Sales runs on {OPUS}, which is not one of the models its "
        f"agent offers ({SONNET}, {QWEN})."
    ]
    # The application's own model is one its agent offers too.
    assert load_app({**moded(OPUS), "model": OPUS}).model == OPUS


# --- what takes no model ------------------------------------------------------------


def test_an_a2a_message_naming_a_model_runs_on_the_agents_own(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    import asyncio

    from agent_runtimes.protocol_state import store as state_store
    from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
    from agent_runtimes.tests.test_apps_a2a import _client, _stream_request, served

    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    monkeypatch.delenv("DATALAYER_RUNTIME_ID", raising=False)

    async def asked() -> Any:
        request = _stream_request("Open invoices?")
        request["params"]["message"]["metadata"] = {"model": OPUS}
        request["params"]["metadata"] = {"model": OPUS}
        async with served(store) as (app, agent), _client(app) as client:
            response = await client.post("/", json=request)
        return response, agent

    response, agent = asyncio.run(asked())
    assert response.status_code == 200
    assert "model" not in agent.contexts[0].metadata


def test_an_operations_call_runs_on_the_agents_own_model() -> None:
    """Its inputs are the operation's, checked against its schema: none is a model."""
    import asyncio

    from agent_runtimes.addresses.operations import OperationAgent, call_operation

    runs: List[Dict[str, Any]] = []

    class Agent:
        async def run(self, prompt: str, **kwargs: Any) -> Any:
            runs.append(kwargs)

            class Result:
                output = {"ok": True}
                usage = None

            return Result()

    class Operation:
        operation_id = "check"
        instruction = "Check it."
        input_schema = {"type": "object", "properties": {"model": {"type": "string"}}}
        output_schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}}

    answer = asyncio.run(
        call_operation(
            OperationAgent(agent=Agent()),
            Operation(),
            {"model": OPUS},
        )
    )
    assert answer == {"ok": True}
    assert all("model" not in run for run in runs)
