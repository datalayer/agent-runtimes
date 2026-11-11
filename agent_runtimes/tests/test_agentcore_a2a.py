# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A team seat on AgentCore Runtime: A2A at ``/`` of port 9000 (AC-05).

The agent configured from the spec (a pydantic-ai agent on a function model,
served over AG-UI as ``configure_at_start`` leaves it) is registered with the
runtime's own A2A transport; :class:`SeatApp` serves that FastA2A
application at the root. A delegated task is sent as the control plane
sends one (``message/send``, then ``tasks/get``) and its answer read back;
the card is the spec's; a refused token exchange answers 401.
"""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator, Iterator

import httpx
import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.agentcore import a2a as seat
from agent_runtimes.agentcore import exchange
from agent_runtimes.agentcore.settings import AGENT_ID
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.routes import agents
from agent_runtimes.routes.agui import register_agui_agent, unregister_agui_agent
from agent_runtimes.tests.test_a2a_harness_worker import (  # noqa: F401 - fixtures
    _text,
    state,
)
from agent_runtimes.tests.test_agentcore_exchange import IAM, RUNTIME, FakeIAM

URL = (
    "https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/"
    "arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A123456789012%3Aruntime%2Fseat/"
    "invocations/"
)


def answer(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
    """Answer the seat's task."""
    return ModelResponse(parts=[TextPart("The seat did the task.")])


async def streamed(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[str]:
    """Stream the seat's answer, as the A2A worker asks it."""
    yield "The seat "
    yield "did the task."


@pytest.fixture()
def configured(state: Any, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:  # noqa: F811
    """The agent of the spec, as configure-from-spec leaves it on the runtime."""
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.transports import AGUITransport

    monkeypatch.setattr(a2a_routes, "_app", None)
    agents._agentspecs[AGENT_ID] = {
        "name": "Crawler",
        "description": "Crawls the web for the team.",
        "skills": ["github", "web-search"],
    }
    agent = Agent(FunctionModel(answer, stream_function=streamed))
    register_agui_agent(
        AGENT_ID,
        AGUITransport(PydanticAIAdapter(agent, agent_id=AGENT_ID), agent_id=AGENT_ID),
    )
    yield
    a2a_routes.unregister_a2a_agent(AGENT_ID)
    unregister_agui_agent(AGENT_ID)
    agents._agentspecs.pop(AGENT_ID, None)
    exchange.forget_exchange()


def _message(text: str) -> dict[str, Any]:
    return {
        "role": "user",
        "kind": "message",
        "messageId": "m-seat-1",
        "contextId": "ctx-seat",
        "parts": [{"kind": "text", "text": text}],
    }


async def _served(client: httpx.AsyncClient, text: str) -> dict[str, Any]:
    """Send a task as the control plane does, and wait for it to end."""
    sent = await client.post(
        "/",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "message/send",
            "params": {"message": _message(text)},
        },
    )
    assert sent.status_code == 200, sent.text
    task_id = sent.json()["result"]["task"]["id"]
    for attempt in range(200):
        got = await client.post(
            "/",
            json={
                "jsonrpc": "2.0",
                "id": 2 + attempt,
                "method": "tasks/get",
                "params": {"id": task_id},
            },
        )
        task = got.json()["result"]
        if "completed" in str(task["status"]["state"]).lower():
            return task
        assert "fail" not in str(task["status"]["state"]).lower(), task
        await asyncio.sleep(0.02)
    raise AssertionError("the seat's task never completed")


@pytest.mark.asyncio
async def test_a_delegated_task_runs_on_the_seat_at_the_root(configured: None) -> None:
    exchange.use_exchange(None)
    seat.register_seat({"AGENTCORE_RUNTIME_URL": URL})
    served = a2a_routes._a2a_agents[AGENT_ID].app
    async with (
        served.router.lifespan_context(served),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=seat.SeatApp()), base_url="http://seat"
        ) as client,
    ):
        card = (await client.get("/.well-known/agent-card.json")).json()
        assert card["name"] == "Crawler"
        assert card["description"] == "Crawls the web for the team."
        assert [i["url"] for i in card["supportedInterfaces"]] == [URL]
        assert [s["id"] for s in card["skills"]] == ["github", "web-search"]

        assert (await client.get("/ping")).json()["status"] == "Healthy"

        task = await _served(client, "Find the release notes.")
    said = [m for m in task.get("history") or [] if m.get("role") == "agent"]
    assert said and _text(said[-1]) == "The seat did the task."


@pytest.mark.asyncio
async def test_a_refused_exchange_answers_401_before_the_seat_sees_it(
    configured: None,
) -> None:
    exchange.use_exchange(
        exchange.TokenExchange(
            IAM,
            RUNTIME,
            client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(FakeIAM())),
        )
    )
    seat.register_seat({})
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=seat.SeatApp()), base_url="http://seat"
    ) as client:
        refused = await client.post(
            "/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "message/send",
                "params": {"message": _message("hi")},
            },
            headers={"Authorization": "Bearer rs256-for-another"},
        )
    assert refused.status_code == 401
    assert refused.json()["detail"] == (
        "IAM refused the token AgentCore validated: "
        f"The subject token was not issued for {RUNTIME}."
    )


def test_the_card_needs_the_configured_agent() -> None:
    agents._agentspecs.pop(AGENT_ID, None)
    with pytest.raises(RuntimeError, match="no team seat to serve"):
        seat.seat_card({})


@pytest.mark.asyncio
async def test_before_the_seat_is_registered_it_says_so() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=seat.SeatApp()), base_url="http://seat"
    ) as client:
        early = await client.post("/", json={})
    assert early.status_code == 503
    assert "No agent is served over A2A" in early.json()["detail"]


# --- a seat as AgentCore routes a team run's task to it -----------------------------------

#: The team run's root execution: the seat's A2A context and AgentCore session.
RUN = "exec_01K9SEATRUN0000000000000"


def _called(method: str, params: dict[str, Any], number: int) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": number, "method": method, "params": params}


@pytest.mark.asyncio
async def test_a_seat_answers_a_task_routed_by_agentcore_on_the_runs_session(
    configured: None,
) -> None:
    from agent_runtimes.agentcore.contract import SESSION_HEADER
    from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore

    iam = FakeIAM()
    exchange.use_exchange(
        exchange.TokenExchange(
            IAM,
            RUNTIME,
            client=lambda: httpx.AsyncClient(transport=httpx.MockTransport(iam)),
        )
    )
    seat.register_seat({"AGENTCORE_RUNTIME_URL": URL})
    served = a2a_routes._a2a_agents[AGENT_ID].app
    # As AgentCore calls the container: the bearer its authorizer validated,
    # the session the relay named (the run, behind its padding).
    routed = {
        "Authorization": "Bearer rs256-for-marketer",
        SESSION_HEADER: session_uid_to_agentcore(RUN),
    }
    async with (
        served.router.lifespan_context(served),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=seat.SeatApp()),
            base_url="http://seat",
            headers=routed,
        ) as client,
    ):
        message = {**_message("Find the release notes."), "contextId": RUN}
        sent = await client.post(
            "/", json=_called("message/send", {"message": message}, 1)
        )
        assert sent.status_code == 200, sent.text
        task_id = sent.json()["result"]["task"]["id"]
        for attempt in range(200):
            got = await client.post(
                "/", json=_called("tasks/get", {"id": task_id}, 2 + attempt)
            )
            task = got.json()["result"]
            if "completed" in str(task["status"]["state"]).lower():
                break
            await asyncio.sleep(0.02)
        else:  # pragma: no cover - a hang is the failure
            raise AssertionError("the seat's task never completed")

        # A message of another context than the session AgentCore routed is refused.
        other = {
            **_message("And this."),
            "contextId": "exec_01K9ANOTHERRUN000000000000",
        }
        refused = await client.post(
            "/", json=_called("message/send", {"message": other}, 999)
        )
    said = [m for m in task.get("history") or [] if m.get("role") == "agent"]
    assert said and _text(said[-1]) == "The seat did the task."
    assert task["contextId"] == RUN
    # The validated bearer exchanged at IAM, for this runtime.
    assert {form["resource"] for form in iam.asked} == {RUNTIME}
    assert {form["subject_token"] for form in iam.asked} == {"rs256-for-marketer"}
    assert refused.status_code == 400
    assert "a seat's A2A context is its session" in refused.json()["detail"]


def test_a_call_naming_no_datalayer_session_is_refused() -> None:
    from agent_runtimes.agentcore.contract import SESSION_HEADER, ContractRefused

    with pytest.raises(ContractRefused) as refused:
        seat.session_of_call({SESSION_HEADER.lower(): "0" * 40}, b"{}")
    assert refused.value.status == 400
    assert "is not a Datalayer session" in refused.value.sentence
    # Called on the listener itself (no AgentCore session): nothing is checked.
    assert (
        seat.session_of_call({}, b'{"params": {"message": {"contextId": "x"}}}') == ""
    )


def test_a_deployments_runtime_created_as_a_seat_configures_its_agentspec_at_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Not deferred to a first invocation it never gets: AgentCore calls a seat over A2A only."""
    from fastapi import FastAPI

    from agent_runtimes.agentcore import contract

    asked: list[Any] = []

    async def configure(request: Any, body: Any) -> dict[str, Any]:
        asked.append(body)
        return {"success": True}

    monkeypatch.setattr(agents, "configure_from_spec_endpoint", configure)
    monkeypatch.setenv("AGENT_SPEC_ID", "crawler")
    monkeypatch.setenv("AGENTCORE_DEPLOYMENT_UID", "01K9DEPLOYMENT00000000000000")
    monkeypatch.setenv("AGENT_RUNTIMES_SESSION_STORE", "record")
    monkeypatch.setenv("AGENTCORE_RUNTIME_ARN", "")
    monkeypatch.setenv("AGENTCORE_PROTOCOL", "A2A")
    exchange.forget_exchange()
    asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))
    assert [(b.agent_spec_id, b.agent_id) for b in asked] == [("crawler", AGENT_ID)]

    # Without it, a deployment's agent waits for its first invocation.
    monkeypatch.setenv("AGENTCORE_PROTOCOL", "")
    asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))
    assert len(asked) == 1

    # A seat keeps its turns in the record too: a microVM's files go with it.
    monkeypatch.setenv("AGENTCORE_PROTOCOL", "A2A")
    monkeypatch.setenv("AGENT_RUNTIMES_SESSION_STORE", "file")
    with pytest.raises(RuntimeError, match="DATALAYER_AI_AGENTS_URL"):
        asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))

    monkeypatch.setenv("AGENTCORE_PROTOCOL", "MCP")
    with pytest.raises(ValueError, match="AGENTCORE_PROTOCOL is A2A"):
        seat_settings_serves()


def seat_settings_serves() -> bool:
    from agent_runtimes.agentcore.settings import serves_seat

    return serves_seat()
