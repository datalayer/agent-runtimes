# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Conversation checkpoints: taken as the agent runs, reachable from outside."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.checkpoints import (
    CheckpointsCapability,
    build_checkpoints_capability,
    get_checkpoints,
    unregister_checkpoints,
)
from agent_runtimes.context.usage import get_usage_tracker
from agent_runtimes.routes import checkpoints_router


@pytest.fixture
def agent_id() -> Any:
    name = "cp-agent"
    yield name
    unregister_checkpoints(name)


def test_build_returns_none_unless_enabled() -> None:
    assert build_checkpoints_capability(None) is None
    assert build_checkpoints_capability({"enabled": False}) is None
    assert isinstance(
        build_checkpoints_capability({"enabled": True}), CheckpointsCapability
    )


def test_factory_reads_the_spec_section(agent_id: str) -> None:
    class Spec:
        guardrails = None
        capabilities = None
        advanced = None
        subagents = None
        memory = None
        memory_config = None
        model = "test"
        checkpoints = {"enabled": True, "frequency": "manual_only"}

    caps = build_capabilities_from_agent_spec(Spec(), agent_id=agent_id)
    found = [cap for cap in caps if isinstance(cap, CheckpointsCapability)]
    assert len(found) == 1
    assert get_checkpoints(agent_id) is found[0]
    assert found[0].middleware.config.frequency == "manual_only"


@pytest.mark.asyncio
async def test_every_turn_checkpoints_the_conversation_after_each_answer(
    agent_id: str,
) -> None:
    cap = build_checkpoints_capability(
        {"enabled": True, "frequency": "every_turn", "max_checkpoints": 3},
        agent_id=agent_id,
    )
    assert cap is not None
    agent = Agent(TestModel(call_tools=[], custom_output_text="ok"), capabilities=[cap])

    first = await agent.run("one")
    await agent.run("two", message_history=first.all_messages())

    checkpoints = await cap.middleware.list_checkpoints()
    assert [c.label for c in checkpoints] == ["turn-2", "turn-1"]
    assert all(c.metadata.get("auto") for c in checkpoints)
    # Each snapshot is the conversation as that turn left it.
    assert checkpoints[1].message_count == len(first.all_messages())
    assert checkpoints[0].message_count > checkpoints[1].message_count
    assert cap.middleware.turn == 2


@pytest.mark.asyncio
async def test_the_model_saves_and_lists_through_its_tools(agent_id: str) -> None:
    cap = build_checkpoints_capability(
        {"enabled": True, "frequency": "manual_only"}, agent_id=agent_id
    )
    assert cap is not None
    seen: list[str] = []

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        seen.extend(t.name for t in info.function_tools)
        last = messages[-1]
        if any(p.part_kind == "user-prompt" for p in last.parts):
            return ModelResponse(
                parts=[
                    ToolCallPart(tool_name="save_checkpoint", args={"label": "base"})
                ]
            )
        if any(
            p.part_kind == "tool-return" and p.tool_name == "save_checkpoint"
            for p in last.parts
        ):
            return ModelResponse(
                parts=[ToolCallPart(tool_name="list_checkpoints", args={})]
            )
        returned = next(p for p in last.parts if p.part_kind == "tool-return")
        return ModelResponse(parts=[TextPart(content=str(returned.content))])

    agent = Agent(FunctionModel(model), capabilities=[cap])
    result = await agent.run("save then list")

    assert {"save_checkpoint", "list_checkpoints", "rewind_to"} <= set(seen)
    assert "'base'" in result.output
    checkpoints = await cap.middleware.list_checkpoints()
    assert [c.label for c in checkpoints] == ["base"]
    assert checkpoints[0].metadata.get("auto") is False


@pytest.mark.asyncio
async def test_a_rewind_asked_by_the_model_lands_once_the_turn_is_over(
    agent_id: str,
) -> None:
    cap = build_checkpoints_capability(
        {"enabled": True, "frequency": "every_turn"}, agent_id=agent_id
    )
    assert cap is not None
    stats = get_usage_tracker().register_agent(agent_id)

    def model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        last = messages[-1]
        prompt = next((p for p in last.parts if p.part_kind == "user-prompt"), None)
        if prompt is not None and prompt.content == "go back":
            return ModelResponse(
                parts=[
                    ToolCallPart(tool_name="rewind_to", args={"checkpoint_id": target})
                ]
            )
        if any(p.part_kind == "tool-return" for p in last.parts):
            return ModelResponse(parts=[TextPart(content="going back")])
        return ModelResponse(parts=[TextPart(content="noted")])

    agent = Agent(FunctionModel(model), capabilities=[cap])
    first = await agent.run("first")
    target = (await cap.middleware.list_checkpoints())[0].id
    second = await agent.run("second", message_history=first.all_messages())
    assert cap.middleware.turn == 2

    result = await agent.run("go back", message_history=second.all_messages())

    assert result.output == "going back"
    # The tracker's record is the checkpoint again, not the three-turn run.
    assert len(stats.message_history) == len(first.all_messages())
    # The turn that rewound did not checkpoint itself.
    assert [c.label for c in await cap.middleware.list_checkpoints()] == [
        "turn-2",
        "turn-1",
    ]


@pytest.mark.asyncio
async def test_routes_list_save_rewind_and_delete(agent_id: str) -> None:
    cap = build_checkpoints_capability(
        {"enabled": True, "frequency": "every_turn", "max_checkpoints": 4},
        agent_id=agent_id,
    )
    assert cap is not None
    agent = Agent(TestModel(call_tools=[], custom_output_text="ok"), capabilities=[cap])
    first = await agent.run("hello")
    stats = get_usage_tracker().register_agent(agent_id)

    app = FastAPI()
    app.include_router(checkpoints_router, prefix="/api/v1")
    client = TestClient(app)

    listing = client.get(f"/api/v1/agents/{agent_id}/checkpoints").json()
    assert listing["enabled"] is True
    assert listing["frequency"] == "every_turn"
    assert listing["turn"] == 1
    assert [c["label"] for c in listing["checkpoints"]] == ["turn-1"]

    saved = client.post(
        f"/api/v1/agents/{agent_id}/checkpoints", json={"label": "by hand"}
    )
    assert saved.status_code == 201
    assert saved.json()["auto"] is False
    assert saved.json()["message_count"] == len(first.all_messages())

    stats.message_history = []
    rewound = client.post(
        f"/api/v1/agents/{agent_id}/checkpoints/{saved.json()['id']}/rewind"
    ).json()
    assert rewound["message_count"] == len(first.all_messages())
    assert len(stats.message_history) == len(first.all_messages())

    one = client.get(f"/api/v1/agents/{agent_id}/checkpoints/{saved.json()['id']}")
    assert one.status_code == 200
    assert len(one.json()["messages"]) == len(first.all_messages())

    gone = client.delete(f"/api/v1/agents/{agent_id}/checkpoints/{saved.json()['id']}")
    assert gone.json()["deleted"] == saved.json()["id"]
    assert (
        client.get(
            f"/api/v1/agents/{agent_id}/checkpoints/{saved.json()['id']}"
        ).status_code
        == 404
    )

    # An agent that never asked for checkpoints answers, and says so.
    quiet = client.get("/api/v1/agents/nobody/checkpoints").json()
    assert quiet == {
        "agent_id": "nobody",
        "enabled": False,
        "turn": 0,
        "checkpoints": [],
    }
    assert (
        client.post(
            "/api/v1/agents/nobody/checkpoints", json={"label": "x"}
        ).status_code
        == 404
    )
