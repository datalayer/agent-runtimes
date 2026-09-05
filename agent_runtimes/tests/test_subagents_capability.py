# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the in-repo subagents capability."""

from __future__ import annotations

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel
from pydantic_ai.toolsets import FunctionToolset

from agent_runtimes.subagents import (
    SubagentDefinition,
    SubagentsCapability,
    build_subagents_capability,
)
from agent_runtimes.types import SubAgentsConfig, SubAgentspecConfig


def test_build_returns_none_when_empty_and_no_general_purpose() -> None:
    cfg = SubAgentsConfig(subagents=[], include_general_purpose=False)
    assert build_subagents_capability(cfg, default_model="openai:gpt-4.1") is None


def test_build_includes_general_purpose_fallback() -> None:
    cfg = SubAgentsConfig(subagents=[], include_general_purpose=True)
    cap = build_subagents_capability(cfg, default_model="openai:gpt-4.1")
    assert cap is not None
    instructions = cap.get_instructions()
    assert instructions is not None
    assert "general-purpose" in instructions


def test_build_from_config_lists_subagents() -> None:
    cfg = SubAgentsConfig(
        subagents=[
            SubAgentspecConfig(
                name="researcher",
                description="Gathers facts",
                instructions="Research well",
            ),
            SubAgentspecConfig(
                name="writer",
                description="Writes prose",
                instructions="Write clearly",
            ),
        ],
        include_general_purpose=False,
    )
    cap = build_subagents_capability(cfg, default_model="openai:gpt-4.1")
    assert cap is not None
    instructions = cap.get_instructions()
    assert instructions is not None
    assert "researcher" in instructions
    assert "writer" in instructions
    assert isinstance(cap.get_toolset(), FunctionToolset)


def test_default_model_resolves_from_config_over_parent() -> None:
    cfg = SubAgentsConfig(
        subagents=[
            SubAgentspecConfig(
                name="researcher",
                description="Gathers facts",
                instructions="Research well",
            ),
        ],
        default_model="openai:gpt-4.1",
        include_general_purpose=False,
    )
    cap = build_subagents_capability(cfg, default_model="anthropic:claude-3-5-haiku")
    assert cap is not None
    assert cap.default_model == "openai:gpt-4.1"


def test_duplicate_subagent_names_raise() -> None:
    with pytest.raises(ValueError, match="Duplicate subagent name"):
        SubagentsCapability(
            subagents=[
                SubagentDefinition("a", "d", "i"),
                SubagentDefinition("a", "d", "i"),
            ],
            default_model="openai:gpt-4.1",
            include_general_purpose=False,
        )


def test_no_toolset_or_instructions_without_agents() -> None:
    cap = SubagentsCapability(
        subagents=[], default_model=None, include_general_purpose=False
    )
    assert cap.get_toolset() is None
    assert cap.get_instructions() is None


@pytest.mark.asyncio
async def test_delegation_runs_child_agent() -> None:
    child_model = TestModel(custom_output_text="child answer")
    cap = SubagentsCapability(
        subagents=[
            SubagentDefinition(
                name="researcher",
                description="Gathers facts",
                instructions="Research well",
            ),
        ],
        default_model=child_model,
        include_general_purpose=False,
    )

    call_count = {"n": 0}

    def parent_model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="delegate_task",
                        args={
                            "subagent_name": "researcher",
                            "task": "find facts",
                        },
                    )
                ]
            )
        return ModelResponse(parts=[TextPart(content="done")])

    agent = Agent(FunctionModel(parent_model), capabilities=[cap])
    result = await agent.run("do research")
    assert result.output == "done"
    tool_returns = [
        part
        for message in result.all_messages()
        for part in getattr(message, "parts", [])
        if getattr(part, "part_kind", None) == "tool-return"
    ]
    assert any("child answer" in str(part.content) for part in tool_returns)


@pytest.mark.asyncio
async def test_delegation_unknown_subagent_returns_error() -> None:
    cap = SubagentsCapability(
        subagents=[
            SubagentDefinition(
                name="researcher",
                description="Gathers facts",
                instructions="Research well",
            ),
        ],
        default_model=TestModel(),
        include_general_purpose=False,
    )

    call_count = {"n": 0}

    def parent_model(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        call_count["n"] += 1
        if call_count["n"] == 1:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="delegate_task",
                        args={"subagent_name": "missing", "task": "x"},
                    )
                ]
            )
        return ModelResponse(parts=[TextPart(content="done")])

    agent = Agent(FunctionModel(parent_model), capabilities=[cap])
    result = await agent.run("do research")
    tool_returns = [
        part
        for message in result.all_messages()
        for part in getattr(message, "parts", [])
        if getattr(part, "part_kind", None) == "tool-return"
    ]
    assert any("Unknown subagent" in str(part.content) for part in tool_returns)
