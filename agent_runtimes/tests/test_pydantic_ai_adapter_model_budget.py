# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The model budget a delegation sets, held on the run (PLAN_ORCHESTRATOR.md, O1-07).

A delegation's budget reaches the adapter in the run's context; the adapter
hands it to pydantic-ai as the run's own ``UsageLimits``, and a run those
limits stop is said as such on the stream, naming the limit, for the transport
to carry back to whoever delegated.
"""

from typing import Any

import pytest
from pydantic_ai.exceptions import UsageLimitExceeded

from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
from agent_runtimes.guardrails.model_budget import ModelBudgetReached


class _FakeUsage:
    input_tokens = 1
    output_tokens = 1
    total_tokens = 2
    cache_read_tokens = 0
    cache_write_tokens = 0
    requests = 1
    tool_calls = 0


class _FakeResult:
    def __init__(self, output: str) -> None:
        self.output = output

    def all_messages(self) -> list[dict[str, str]]:
        return []

    def usage(self) -> _FakeUsage:
        return _FakeUsage()


class _Agent:
    """A pydantic-ai agent's `run`, recording what it was given."""

    def __init__(self, raises: Exception | None = None) -> None:
        self.model = "test:model"
        self._tools: dict[str, Any] = {}
        self.calls: list[dict[str, Any]] = []
        self.raises = raises

    async def run(self, prompt: str, **kwargs: Any) -> _FakeResult:
        kwargs.pop("event_stream_handler", None)
        self.calls.append(kwargs)
        if self.raises is not None:
            raise self.raises
        return _FakeResult("done")


def _budgeted() -> AgentContext:
    return AgentContext(
        session_id="s1",
        metadata={"budget": {"outputTokens": 100, "cost": 0.5, "currency": "USD"}},
    )


@pytest.mark.asyncio
async def test_the_run_is_held_to_the_delegated_budget() -> None:
    agent = _Agent()
    adapter = PydanticAIAdapter(agent, name="test-adapter", agent_id="agent-1")

    await adapter.run("go", _budgeted())

    limits = agent.calls[0]["usage_limits"]
    assert limits.output_tokens_limit == 100
    assert str(limits.cost_limit) == "0.5"
    assert limits.input_tokens_limit is None


@pytest.mark.asyncio
async def test_a_run_no_delegation_bounded_keeps_pydantic_ais_own_default() -> None:
    agent = _Agent()
    adapter = PydanticAIAdapter(agent, name="test-adapter", agent_id="agent-1")

    await adapter.run("go", AgentContext(session_id="s1"))

    assert "usage_limits" not in agent.calls[0]


@pytest.mark.asyncio
async def test_a_stream_its_budget_stopped_says_which_limit() -> None:
    agent = _Agent(
        raises=UsageLimitExceeded(
            "Exceeded the output_tokens_limit of 100 (output_tokens=150)"
        )
    )
    adapter = PydanticAIAdapter(agent, name="test-adapter", agent_id="agent-1")

    events = [event async for event in adapter.stream("go", _budgeted())]

    assert "usage_limits" in agent.calls[0]
    [error] = [event for event in events if event.type == "error"]
    assert isinstance(error.data, ModelBudgetReached)
    assert error.data.limit == "output_tokens"


@pytest.mark.asyncio
async def test_any_other_failure_stays_a_plain_error() -> None:
    agent = _Agent(raises=RuntimeError("model went away"))
    adapter = PydanticAIAdapter(agent, name="test-adapter", agent_id="agent-1")

    events = [event async for event in adapter.stream("go", _budgeted())]

    [error] = [event for event in events if event.type == "error"]
    assert not isinstance(error.data, ModelBudgetReached)
    assert "model went away" in error.data
