# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the in-repo history compaction capability."""

from __future__ import annotations

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.test import TestModel

from agent_runtimes.compaction import (
    CompactionCapability,
    build_compaction_capability,
    estimate_token_count,
    find_token_cutoff,
)


def _history(turns: int, words: int = 200) -> list[ModelMessage]:
    text = "word " * words
    messages: list[ModelMessage] = [
        ModelRequest(parts=[SystemPromptPart(content="You are helpful.")])
    ]
    for i in range(turns):
        messages.append(
            ModelRequest(parts=[UserPromptPart(content=f"{text} turn {i}")])
        )
        messages.append(ModelResponse(parts=[TextPart(content=f"{text} reply {i}")]))
    return messages


def test_estimate_token_count_scales_with_content() -> None:
    small = _history(1, words=10)
    large = _history(1, words=1000)
    assert estimate_token_count(large) > estimate_token_count(small) > 0


def test_find_token_cutoff_returns_zero_when_within_budget() -> None:
    messages = _history(2, words=5)
    assert find_token_cutoff(messages, target_tokens=1_000_000) == 0


def test_find_token_cutoff_preserves_tool_pairs() -> None:
    call = ToolCallPart(tool_name="search", args={"q": "x"}, tool_call_id="c1")
    ret = ToolReturnPart(tool_name="search", content="result", tool_call_id="c1")
    messages: list[ModelMessage] = [
        ModelRequest(parts=[UserPromptPart(content="word " * 400)]),
        ModelResponse(parts=[call]),
        ModelRequest(parts=[ret]),
        ModelResponse(parts=[TextPart(content="done")]),
    ]
    cutoff = find_token_cutoff(messages, target_tokens=1, tokenizer=None)
    # The cut must not fall between the tool call (idx 1) and its return (idx 2).
    assert cutoff != 2


class TestValidation:
    def test_rejects_bad_trigger_fraction(self) -> None:
        with pytest.raises(ValueError):
            CompactionCapability(max_tokens=100, trigger_fraction=1.5)

    def test_rejects_keep_ge_trigger(self) -> None:
        with pytest.raises(ValueError):
            CompactionCapability(
                max_tokens=100, trigger_fraction=0.5, keep_fraction=0.5
            )

    def test_rejects_negative_keep_messages(self) -> None:
        with pytest.raises(ValueError):
            CompactionCapability(max_tokens=100, keep_messages=-1)

    def test_rejects_non_positive_max_tokens(self) -> None:
        with pytest.raises(ValueError):
            CompactionCapability(max_tokens=0)


class TestBuildCompactionCapability:
    def test_resolves_tokens_limit_from_spec(self) -> None:
        cap = build_compaction_capability("bedrock:us.anthropic.claude-sonnet-4-6")
        assert cap is not None
        assert cap.max_tokens == 64000

    def test_returns_none_for_unknown_model(self) -> None:
        assert build_compaction_capability("unknown:model") is None

    def test_returns_none_for_empty_model(self) -> None:
        assert build_compaction_capability(None) is None


class TestCompactionBehavior:
    @pytest.mark.asyncio
    async def test_no_op_when_under_threshold(self) -> None:
        cap = CompactionCapability(max_tokens=1_000_000, model=TestModel())
        agent = Agent(TestModel(), capabilities=[cap])
        await agent.run("hi", message_history=_history(2, words=5))
        assert cap.compaction_count == 0

    @pytest.mark.asyncio
    async def test_no_op_when_budget_unresolved(self) -> None:
        # max_tokens=None and no resolvable model_id -> capability is inert.
        cap = CompactionCapability(model=TestModel())
        agent = Agent(TestModel(), capabilities=[cap])
        await agent.run("hi", message_history=_history(30))
        assert cap.compaction_count == 0

    @pytest.mark.asyncio
    async def test_compacts_oversized_history(self) -> None:
        cap = CompactionCapability(
            max_tokens=2000,
            trigger_fraction=0.85,
            keep_fraction=0.5,
            keep_messages=6,
            model=TestModel(),
        )
        agent = Agent(TestModel(), capabilities=[cap])
        history = _history(30)
        result = await agent.run("continue", message_history=history)
        assert cap.compaction_count == 1
        # Persisted history is far smaller than the 61-message input.
        assert len(result.all_messages()) < len(history)

    @pytest.mark.asyncio
    async def test_preserves_system_prompt_and_summary(self) -> None:
        cap = CompactionCapability(
            max_tokens=2000,
            trigger_fraction=0.85,
            keep_fraction=0.5,
            keep_messages=4,
            model=TestModel(),
        )
        agent = Agent(TestModel(), capabilities=[cap])
        history = _history(30)
        result = await agent.run("continue", message_history=history)
        first = result.all_messages()[0]
        assert isinstance(first, ModelRequest)
        assert any(
            isinstance(p, SystemPromptPart)
            and p.content.startswith("Summary of previous conversation:")
            for p in first.parts
        )
