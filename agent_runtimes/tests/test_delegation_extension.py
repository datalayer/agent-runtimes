# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Datalayer orchestration extension, as a worker speaks it (ORCHESTRATOR.md, O2-05).

A delegation names its execution and the checkpoint it resumes from; a paused
worker answers with the checkpoint it paused at; and a steer delivered while a
run works reaches its model within the turn.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelRequest, ModelResponse, TextPart, ToolCallPart, UserPromptPart
from pydantic_ai.models import ModelRequestContext, ModelRequestParameters
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from agent_runtimes.context import delegation
from agent_runtimes.context.delegation import (
    SteerCapability,
    checkpoint_of,
    close_steering,
    deliver_steer,
    execution_of,
    forget_pause,
    open_steering,
    pause_requested,
    paused_at,
    paused_meta,
    request_pause,
    take_steers,
)


class TestWhatADelegationNames:
    def test_its_execution_and_the_checkpoint_it_resumes_from(self) -> None:
        meta = {"datalayer": {"execution": {"executionId": "exec_1", "rootExecutionId": "exec_1"}, "checkpoint": {"checkpointId": "ckpt_1"}}}
        assert (execution_of(meta), checkpoint_of(meta)) == ("exec_1", "ckpt_1")

    @pytest.mark.parametrize("meta", (None, {}, {"datalayer": {}}, {"datalayer": {"execution": "exec_1", "checkpoint": {"checkpointId": ""}}}))
    def test_nothing_when_it_names_nothing(self, meta: Any) -> None:
        assert (execution_of(meta), checkpoint_of(meta)) == (None, None)

    def test_a_paused_worker_answers_with_its_checkpoint(self) -> None:
        assert paused_at(paused_meta("ckpt_9")) == "ckpt_9"
        assert paused_at({"datalayer": {"budget": {}}}) is None


class TestAPause:
    def test_is_asked_of_a_run_and_forgotten_once_it_paused(self) -> None:
        assert not pause_requested("task-pause")
        request_pause("task-pause")
        assert pause_requested("task-pause")
        forget_pause("task-pause")
        assert not pause_requested("task-pause")


class TestASteer:
    def test_reaches_only_a_run_that_is_working(self) -> None:
        assert deliver_steer("task-idle", "Check the plots") is False
        open_steering("task-working")
        try:
            assert deliver_steer("task-working", "Check the plots") is True
            assert deliver_steer("task-working", "And the units") is True
            assert take_steers("task-working") == ["Check the plots", "And the units"]
            assert take_steers("task-working") == []
        finally:
            close_steering("task-working")
        assert deliver_steer("task-working", "Too late") is False

    @pytest.mark.asyncio
    async def test_joins_the_request_about_to_be_sent(self) -> None:
        open_steering("task-joins")
        try:
            request = ModelRequest(parts=[UserPromptPart(content="Profile the notebook")])
            context = ModelRequestContext(
                model=TestModel(), messages=[request], model_settings=None, model_request_parameters=ModelRequestParameters()
            )
            unchanged = await SteerCapability("task-joins").before_model_request(None, context)
            assert unchanged is context
            deliver_steer("task-joins", "Check the plots")
            steered = await SteerCapability("task-joins").before_model_request(None, context)
            [last] = steered.messages
            assert [type(part).__name__ for part in last.parts] == ["UserPromptPart", "UserPromptPart"]
            assert "Check the plots" in last.parts[-1].content
        finally:
            close_steering("task-joins")

    @pytest.mark.asyncio
    async def test_delivered_mid_run_reaches_the_model_within_the_turn(self) -> None:
        """The steer arrives while a tool runs; the model's next request carries it."""
        seen: list[list[Any]] = []

        def model(messages: list[Any], info: AgentInfo) -> ModelResponse:
            seen.append(list(messages))
            if len(seen) == 1:
                return ModelResponse(parts=[ToolCallPart(tool_name="read_cells", args={})])
            return ModelResponse(parts=[TextPart(content="Done")])

        agent = Agent(FunctionModel(model))

        @agent.tool_plain
        def read_cells() -> str:
            deliver_steer("task-mid-run", "Check the plots too")
            return "12 cells"

        open_steering("task-mid-run")
        try:
            result = await agent.run("Profile the notebook", capabilities=[SteerCapability("task-mid-run")])
        finally:
            close_steering("task-mid-run")
        assert result.output == "Done"
        second = seen[1]
        prompts = [part.content for message in second if isinstance(message, ModelRequest) for part in message.parts if isinstance(part, UserPromptPart)]
        assert any("Check the plots too" in str(prompt) for prompt in prompts)
        assert delegation.take_steers("task-mid-run") == []
