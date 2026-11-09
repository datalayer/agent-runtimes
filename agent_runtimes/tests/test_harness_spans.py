# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""GenAI spans of a harness's turn driven over ACP (AC-12): one ``invoke_agent``
per turn, one ``execute_tool`` per tool call, under the runtime's scope.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import pytest
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from agent_runtimes.adapters.base import StreamEvent
from agent_runtimes.otel.genai import SCOPE
from agent_runtimes.otel.harness_spans import HarnessTurnSpans, traced_turn
from agent_runtimes.tests.test_acp_agent import Approvals, an_agent, turn


@pytest.fixture()
def exported() -> Iterator[tuple[SDKTracerProvider, InMemorySpanExporter]]:
    memory = InMemorySpanExporter()
    provider = SDKTracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory))
    yield provider, memory
    provider.shutdown()


def _spans(
    provider: SDKTracerProvider, include_content: bool = True
) -> HarnessTurnSpans:
    return HarnessTurnSpans(
        agent_id="coder",
        agent_name="Coder",
        harness="claude-code",
        session_id="session-1",
        tracer_provider=provider,
        include_content=include_content,
    )


async def _fake_acp_turn(*events: StreamEvent) -> AsyncIterator[StreamEvent]:
    for event in events:
        yield event


#: A turn as the ACP adapter yields it from the harness's session updates.
TURN = (
    StreamEvent(type="text", data="Reading the file. "),
    StreamEvent(
        type="tool_call",
        data={
            "id": "c1",
            "name": "Read README.md",
            "arguments": {"path": "README.md"},
            "kind": "read",
            "status": "pending",
        },
    ),
    StreamEvent(
        type="tool_call",
        data={"id": "c1", "name": "Read README.md", "status": "in_progress"},
    ),
    StreamEvent(
        type="tool_call",
        data={
            "id": "c2",
            "name": "Run make",
            "arguments": {"command": "make"},
            "kind": "execute",
            "status": "pending",
        },
    ),
    StreamEvent(
        type="tool_result",
        data={
            "id": "c1",
            "name": "Read README.md",
            "result": "# A readme",
            "status": "completed",
        },
    ),
    StreamEvent(
        type="tool_result",
        data={
            "id": "c2",
            "name": "Run make",
            "result": {"exit": 2},
            "status": "failed",
            "error": "make: no target",
        },
    ),
    StreamEvent(type="text", data="Done."),
    StreamEvent(type="done", data={"stop_reason": "end_turn", "session_id": "acp-1"}),
)


def _read(events: Any) -> list[StreamEvent]:
    async def all_of() -> list[StreamEvent]:
        return [event async for event in events]

    return asyncio.run(all_of())


def _by_operation(spans: tuple[ReadableSpan, ...]) -> dict[str, list[ReadableSpan]]:
    found: dict[str, list[ReadableSpan]] = {}
    for span in spans:
        found.setdefault(
            str((span.attributes or {})["gen_ai.operation.name"]), []
        ).append(span)
    return found


def test_a_turn_is_one_invoke_agent_span_and_one_execute_tool_span_per_call(
    exported,
) -> None:
    provider, memory = exported
    events = _read(traced_turn(_fake_acp_turn(*TURN), "Build it", _spans(provider)))

    assert events == list(TURN)
    spans = memory.get_finished_spans()
    assert {span.instrumentation_scope.name for span in spans} == {SCOPE}
    operations = _by_operation(spans)
    (invoke,) = operations["invoke_agent"]
    assert invoke.name == "invoke_agent Coder"
    assert dict(invoke.attributes or {}) == {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.id": "coder",
        "gen_ai.agent.name": "Coder",
        "gen_ai.conversation.id": "session-1",
        "datalayer.harness": "claude-code",
        "gen_ai.input.messages": json.dumps(
            [{"role": "user", "parts": [{"type": "text", "content": "Build it"}]}]
        ),
        "gen_ai.output.messages": json.dumps(
            [
                {
                    "role": "assistant",
                    "parts": [{"type": "text", "content": "Reading the file. Done."}],
                }
            ]
        ),
    }
    assert invoke.status.status_code is StatusCode.UNSET

    read, run = sorted(
        operations["execute_tool"],
        key=lambda s: str(s.attributes["gen_ai.tool.call.id"]),
    )
    assert read.name == "execute_tool Read README.md"
    assert read.parent is not None and read.parent.span_id == invoke.context.span_id
    assert read.attributes["gen_ai.tool.name"] == "Read README.md"
    assert json.loads(read.attributes["gen_ai.tool.call.arguments"]) == {
        "path": "README.md"
    }
    assert json.loads(read.attributes["gen_ai.tool.call.result"]) == "# A readme"
    assert read.attributes["datalayer.tool.kind"] == "read"
    assert read.status.status_code is StatusCode.UNSET
    assert run.status.status_code is StatusCode.ERROR
    assert run.status.description == "make: no target"


def test_without_content_no_prompt_answer_argument_or_result_is_written(
    exported,
) -> None:
    provider, memory = exported
    _read(
        traced_turn(
            _fake_acp_turn(*TURN), "Build it", _spans(provider, include_content=False)
        )
    )

    for span in memory.get_finished_spans():
        attributes = span.attributes or {}
        assert not {
            "gen_ai.input.messages",
            "gen_ai.output.messages",
            "gen_ai.tool.call.arguments",
            "gen_ai.tool.call.result",
        } & set(attributes)


def test_a_visitor_s_turn_writes_no_content(exported, monkeypatch) -> None:
    from agent_runtimes.apps import visitors

    provider, memory = exported
    monkeypatch.setattr(visitors, "in_visitor_turn", lambda: True)
    spans = HarnessTurnSpans(
        agent_id="coder",
        agent_name="Coder",
        harness="codex",
        session_id="s",
        tracer_provider=provider,
    )
    _read(traced_turn(_fake_acp_turn(*TURN), "Build it", spans))
    assert all(
        "gen_ai.input.messages" not in (span.attributes or {})
        for span in memory.get_finished_spans()
    )


def test_a_turn_that_errs_ends_its_open_tool_calls_and_itself_in_error(
    exported,
) -> None:
    provider, memory = exported
    _read(
        traced_turn(
            _fake_acp_turn(
                StreamEvent(
                    type="tool_call",
                    data={"id": "c1", "name": "Fetch", "status": "pending"},
                ),
                StreamEvent(
                    type="error", data="Fake agent refused the turn: overloaded"
                ),
            ),
            "Fetch it",
            _spans(provider),
        )
    )
    operations = _by_operation(memory.get_finished_spans())
    (invoke,) = operations["invoke_agent"]
    (tool,) = operations["execute_tool"]
    assert invoke.status.status_code is StatusCode.ERROR
    assert invoke.status.description == "Fake agent refused the turn: overloaded"
    assert tool.status.status_code is StatusCode.ERROR


def test_a_turn_that_raises_still_ends_its_span(exported) -> None:
    provider, memory = exported

    async def broken() -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type="text", data="starting")
        raise RuntimeError("the harness died")

    with pytest.raises(RuntimeError, match="the harness died"):
        _read(traced_turn(broken(), "Go", _spans(provider)))
    (invoke,) = memory.get_finished_spans()
    assert invoke.status.status_code is StatusCode.ERROR
    assert "the harness died" in str(invoke.status.description)


@pytest.mark.asyncio
async def test_an_acp_turn_of_the_fake_harness_writes_its_spans(
    exported, tmp_path: Path
) -> None:
    provider, memory = exported
    (tmp_path / "README.md").write_text("# A readme\nread me\n", encoding="utf-8")
    agent = an_agent(tmp_path, approvals=Approvals())
    agent.genai_tracer_provider = provider
    try:
        events = await turn(agent, "edit")
    finally:
        await agent.cleanup()

    calls = {e.data["id"] for e in events if e.type in ("tool_call", "tool_result")}
    operations = _by_operation(memory.get_finished_spans())
    (invoke,) = operations["invoke_agent"]
    assert invoke.attributes["gen_ai.agent.id"] == "fake"
    assert invoke.attributes["datalayer.harness"] == "fake"
    assert invoke.attributes["gen_ai.conversation.id"] == "s1"
    assert {
        span.attributes["gen_ai.tool.call.id"] for span in operations["execute_tool"]
    } == calls
    assert all(
        span.parent.span_id == invoke.context.span_id
        for span in operations["execute_tool"]
    )
