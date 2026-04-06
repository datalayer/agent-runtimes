# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Regression tests for deferred approval continuation in adapter run/stream."""

from collections.abc import AsyncIterator
from typing import Any

import pytest
from pydantic_ai import DeferredToolRequests
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.adapters.pydantic_ai_adapter import (
    _DEFERRED_CONTINUATION_PROMPT,
    PydanticAIAdapter,
)


class _FakeUsage:
    input_tokens = 1
    output_tokens = 1
    total_tokens = 2
    cache_read_tokens = 0
    cache_write_tokens = 0
    requests = 1
    tool_calls = 0


class _FakeResult:
    def __init__(
        self,
        output: str | DeferredToolRequests,
        all_messages: list[dict[str, str]] | None = None,
    ) -> None:
        self.output = output
        self._all_messages = all_messages or []

    def all_messages(self) -> list[dict[str, str]]:
        return self._all_messages

    def usage(self) -> _FakeUsage:
        return _FakeUsage()


class _FakeAgent:
    def __init__(self) -> None:
        self.model = "test:model"
        self._tools: dict[str, Any] = {}
        self.calls: list[dict[str, Any]] = []

    async def run(self, prompt: str, **kwargs: Any) -> _FakeResult:
        self.calls.append({"prompt": prompt, "kwargs": kwargs})

        # First run returns a deferred approval request.
        if len(self.calls) == 1:
            deferred = DeferredToolRequests(
                approvals=[
                    ToolCallPart(
                        tool_name="runtime_sensitive_echo",
                        args={"text": "hello", "reason": "audit"},
                        tool_call_id="tool-1",
                    )
                ],
                metadata={"tool-1": {"origin": "test"}},
            )
            return _FakeResult(output=deferred, all_messages=[{"role": "assistant"}])

        # Continuation should provide deferred results and use a non-empty prompt.
        deferred_results = kwargs.get("deferred_tool_results")
        assert deferred_results is not None
        assert deferred_results.approvals == {"tool-1": True}
        assert kwargs.get("message_history") == [{"role": "assistant"}]

        return _FakeResult(output="approved and executed")


class _FakeStreamResult(_FakeResult):
    def __init__(
        self,
        output: str | DeferredToolRequests,
        text_steps: list[str],
        all_messages: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(output=output, all_messages=all_messages)
        self._text_steps = text_steps

    async def stream_text(self) -> AsyncIterator[str]:
        for text in self._text_steps:
            yield text


class _FakeStreamContext:
    def __init__(self, result: _FakeStreamResult) -> None:
        self._result = result

    async def __aenter__(self) -> _FakeStreamResult:
        return self._result

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False


class _FakeStreamingAgent:
    def __init__(self) -> None:
        self.model = "test:model"
        self._tools: dict[str, Any] = {}
        self.calls: list[dict[str, Any]] = []

    def run_stream(self, prompt: str, **kwargs: Any) -> _FakeStreamContext:
        self.calls.append({"prompt": prompt, "kwargs": kwargs})

        if len(self.calls) == 1:
            deferred = DeferredToolRequests(
                approvals=[
                    ToolCallPart(
                        tool_name="runtime_sensitive_echo",
                        args={"text": "hello", "reason": "audit"},
                        tool_call_id="tool-1",
                    )
                ],
                metadata={"tool-1": {"origin": "test"}},
            )
            return _FakeStreamContext(
                _FakeStreamResult(
                    output=deferred,
                    text_steps=[
                        "I'll help you with that.",
                    ],
                    all_messages=[{"role": "assistant", "content": "preamble"}],
                )
            )

        deferred_results = kwargs.get("deferred_tool_results")
        assert deferred_results is not None
        assert deferred_results.approvals == {"tool-1": True}
        assert kwargs.get("message_history") == [
            {"role": "assistant", "content": "preamble"}
        ]

        return _FakeStreamContext(
            _FakeStreamResult(
                output="approved and executed",
                text_steps=[
                    "approved",
                    "approved and executed",
                ],
                all_messages=[{"role": "assistant", "content": "approved and executed"}],
            )
        )


@pytest.mark.asyncio
async def test_run_continues_deferred_approval_with_non_empty_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_agent = _FakeAgent()
    adapter = PydanticAIAdapter(fake_agent, name="test-adapter", agent_id="agent-1")

    requests_seen = []

    class _FakeApprovalManager:
        def __init__(self, _config: Any) -> None:
            pass

        async def request_and_wait(
            self, tool_name: str, tool_args: dict[str, str]
        ) -> dict[str, str]:
            requests_seen.append((tool_name, tool_args))
            return {"status": "approved"}

        async def close(self) -> None:
            return None

    monkeypatch.setattr(
        "agent_runtimes.adapters.pydantic_ai_adapter.ToolApprovalManager",
        _FakeApprovalManager,
    )

    response = await adapter.run(
        "run once",
        AgentContext(session_id="s1", metadata={"user_token": "token-123"}),
    )

    assert response.content == "approved and executed"
    assert len(fake_agent.calls) == 2
    assert fake_agent.calls[0]["prompt"] == "run once"
    assert fake_agent.calls[1]["prompt"] == _DEFERRED_CONTINUATION_PROMPT
    assert requests_seen == [
        ("runtime_sensitive_echo", {"text": "hello", "reason": "audit"})
    ]


@pytest.mark.asyncio
async def test_stream_continues_deferred_approval_with_non_empty_prompt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_agent = _FakeStreamingAgent()
    adapter = PydanticAIAdapter(fake_agent, name="test-adapter", agent_id="agent-1")

    requests_seen = []

    class _FakeApprovalManager:
        def __init__(self, _config: Any) -> None:
            pass

        async def request_and_wait(
            self, tool_name: str, tool_args: dict[str, str]
        ) -> dict[str, str]:
            requests_seen.append((tool_name, tool_args))
            return {"status": "approved"}

        async def close(self) -> None:
            return None

    monkeypatch.setattr(
        "agent_runtimes.adapters.pydantic_ai_adapter.ToolApprovalManager",
        _FakeApprovalManager,
    )

    events = [
        event
        async for event in adapter.stream(
            "run once",
            AgentContext(session_id="s1", metadata={"user_token": "token-123"}),
        )
    ]

    text_chunks = [event.data for event in events if event.type == "text"]
    assert "approved and executed" in "".join(text_chunks)
    assert events[-1].type == "done"
    assert len(fake_agent.calls) == 2
    assert fake_agent.calls[0]["prompt"] == "run once"
    assert fake_agent.calls[1]["prompt"] == _DEFERRED_CONTINUATION_PROMPT
    assert requests_seen == [
        ("runtime_sensitive_echo", {"text": "hello", "reason": "audit"})
    ]
