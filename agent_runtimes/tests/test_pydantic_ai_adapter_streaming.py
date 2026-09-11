# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a pydantic-ai agent's stream says: all of it, from every model request of the run.

pydantic-ai starts a text part with its first chunk and adds the rest as
deltas, so a stream that read only the deltas lost the first chunk of every
part — a paused run's checkpoint kept nothing of what the agent had said. And
a run that calls a tool and then answers makes a model request for each: the
stream ended with the first, so what the agent said after a tool call reached
nobody but the final output.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel

from agent_runtimes.adapters.base import AgentContext, StreamEvent
from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter


async def _events(agent: Agent) -> list[StreamEvent]:
    adapter = PydanticAIAdapter(agent)
    return [event async for event in adapter.stream("Profile the notebook", AgentContext(session_id="s"))]


def _text(events: list[StreamEvent]) -> str:
    return "".join(str(event.data) for event in events if event.type == "text")


@pytest.mark.asyncio
async def test_the_first_chunk_of_a_text_part_is_streamed() -> None:
    async def model(messages: list[Any], info: AgentInfo) -> Any:
        yield "Reading"
        yield " the cells."

    events = await _events(Agent(FunctionModel(stream_function=model)))

    assert _text(events) == "Reading the cells."
    assert [event.type for event in events][-2:] == ["output", "done"]


@pytest.mark.asyncio
async def test_what_it_says_after_a_tool_call_is_streamed_too() -> None:
    requests: list[Any] = []

    async def model(messages: list[Any], info: AgentInfo) -> Any:
        requests.append(messages)
        if len(requests) == 1:
            yield "Reading the cells. "
            yield {0: DeltaToolCall(name="read_cells", json_args="{}")}
        else:
            yield "It profiles cleanly."

    agent = Agent(FunctionModel(stream_function=model))

    @agent.tool_plain
    def read_cells() -> str:
        return "12 cells"

    events = await _events(agent)

    assert len(requests) == 2
    assert _text(events) == "Reading the cells. It profiles cleanly."


@pytest.mark.asyncio
async def test_a_run_that_fails_still_ends_its_stream() -> None:
    async def model(messages: list[Any], info: AgentInfo) -> Any:
        if messages:
            raise RuntimeError("The model went away")
        yield "never"

    events = await _events(Agent(FunctionModel(stream_function=model)))

    assert events[-1].type == "error" and "The model went away" in str(events[-1].data)
