# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""GenAI spans of a harness's turn driven over ACP (AC-12).

pydantic-ai writes the GenAI spans of the runtime's own agents
(:mod:`agent_runtimes.otel.genai`). A harness — Claude Code, Codex — runs its
own loop behind agent-shield's ACP proxy, and its model calls are not seen
here; its turn and its tool calls are, as the session updates the runtime
turns into ``StreamEvent``\\ s. :func:`traced_turn` writes, from them and under
the same scope (:data:`~agent_runtimes.otel.genai.SCOPE`):

- one ``invoke_agent <agent>`` span per turn (``gen_ai.operation.name``
  ``invoke_agent``, the agent's id and name, the runtime session as
  ``gen_ai.conversation.id``, the harness as ``datalayer.harness``), ended
  with the turn, in error when the turn ended in one;
- one ``execute_tool <title>`` span per tool call, a child of the turn's,
  opened at the call's first ``tool_call`` event and ended at its
  ``tool_result`` (in error when it ``failed``), or with the turn.

The prompt and the answer (``gen_ai.input.messages``,
``gen_ai.output.messages``) and a tool's arguments and result
(``gen_ai.tool.call.arguments``, ``gen_ai.tool.call.result``) are written as
:func:`~agent_runtimes.otel.genai.content_setting` says, and never in a
visitor's turn. The harness's own model calls (``chat``) are not: ACP does not
say them.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any, Optional

from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode, TracerProvider

from agent_runtimes.adapters.base import StreamEvent
from agent_runtimes.otel.genai import (
    ScopedTracerProvider,
    _a_visitor_s,
    content_setting,
)

#: The tracer's name; the scope is :data:`~agent_runtimes.otel.genai.SCOPE` whatever it is.
TRACER_NAME = "agent_runtimes.harness"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


class HarnessTurnSpans:
    """The GenAI spans of one harness turn, written from its ``StreamEvent``\\ s.

    Parameters
    ----------
    agent_id : str
        The agent the harness serves.
    agent_name : str
        Its name.
    harness : str
        The harness's id (``claude-code``, ``codex``).
    session_id : str
        The runtime session, the GenAI conversation.
    tracer_provider : TracerProvider, optional
        Where the spans are made; the process's, under the scope, when not given.
    include_content : bool, optional
        Whether the prompt, the answer and the tools' arguments and results
        are written; as the environment says, and never for a visitor, when
        not given.
    """

    def __init__(
        self,
        *,
        agent_id: str,
        agent_name: str,
        harness: str,
        session_id: str,
        tracer_provider: Optional[TracerProvider] = None,
        include_content: Optional[bool] = None,
    ) -> None:
        provider = ScopedTracerProvider(tracer_provider)
        self._tracer = provider.get_tracer(TRACER_NAME)
        self.agent_id = agent_id
        self.agent_name = agent_name or agent_id
        self.harness = harness
        self.session_id = session_id
        self.include_content = (
            content_setting() and not _a_visitor_s()
            if include_content is None
            else include_content
        )
        self._turn: Optional[Span] = None
        self._tools: dict[str, Span] = {}
        self._said: list[str] = []

    def start(self, prompt: str) -> None:
        """Open the turn's ``invoke_agent`` span."""
        attributes: dict[str, Any] = {
            "gen_ai.operation.name": "invoke_agent",
            "gen_ai.agent.id": self.agent_id,
            "gen_ai.agent.name": self.agent_name,
            "gen_ai.conversation.id": self.session_id,
            "datalayer.harness": self.harness,
        }
        if self.include_content:
            attributes["gen_ai.input.messages"] = _json(
                [{"role": "user", "parts": [{"type": "text", "content": prompt}]}]
            )
        self._turn = self._tracer.start_span(
            f"invoke_agent {self.agent_name}",
            kind=trace.SpanKind.INTERNAL,
            attributes=attributes,
        )

    def see(self, event: StreamEvent) -> None:
        """Write what one event of the turn says."""
        data = event.data if isinstance(event.data, dict) else {}
        if event.type == "text":
            self._said.append(str(event.data))
        elif event.type == "tool_call":
            self._open_tool(data)
        elif event.type == "tool_result":
            call_id = str(data.get("id") or "")
            span = self._tools.pop(call_id, None) or self._open_tool(data, keep=False)
            if span is None:
                return
            if self.include_content and "result" in data:
                span.set_attribute("gen_ai.tool.call.result", _json(data["result"]))
            if data.get("status") == "failed":
                span.set_status(
                    Status(StatusCode.ERROR, str(data.get("error") or "failed"))
                )
            span.end()

    def _open_tool(self, data: dict[str, Any], keep: bool = True) -> Optional[Span]:
        """Open a tool call's ``execute_tool`` span the first time it is seen."""
        call_id = str(data.get("id") or "")
        if not call_id or self._turn is None:
            return None
        if call_id in self._tools:
            return self._tools[call_id]
        name = str(data.get("name") or call_id)
        attributes: dict[str, Any] = {
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": name,
            "gen_ai.tool.call.id": call_id,
            "gen_ai.tool.type": "function",
            "datalayer.harness": self.harness,
        }
        if data.get("kind"):
            attributes["datalayer.tool.kind"] = str(data["kind"])
        if self.include_content and data.get("arguments") is not None:
            attributes["gen_ai.tool.call.arguments"] = _json(data["arguments"])
        span = self._tracer.start_span(
            f"execute_tool {name}",
            context=trace.set_span_in_context(self._turn),
            kind=trace.SpanKind.INTERNAL,
            attributes=attributes,
        )
        if keep:
            self._tools[call_id] = span
        return span

    def end(self, error: str = "") -> None:
        """End the turn's span, and any tool call's left open, in error when ``error`` says one."""
        for span in self._tools.values():
            span.set_status(
                Status(StatusCode.ERROR, error or "The turn ended before the tool did.")
            )
            span.end()
        self._tools.clear()
        if self._turn is None:
            return
        if self.include_content and self._said:
            self._turn.set_attribute(
                "gen_ai.output.messages",
                _json(
                    [
                        {
                            "role": "assistant",
                            "parts": [{"type": "text", "content": "".join(self._said)}],
                        }
                    ]
                ),
            )
        if error:
            self._turn.set_status(Status(StatusCode.ERROR, error))
        self._turn.end()
        self._turn = None


async def traced_turn(
    events: AsyncIterator[StreamEvent], prompt: str, spans: HarnessTurnSpans
) -> AsyncIterator[StreamEvent]:
    """Yield a harness turn's events, writing its GenAI spans as they come.

    Parameters
    ----------
    events : AsyncIterator[StreamEvent]
        The turn's events, as the ACP adapter yields them.
    prompt : str
        What the person said.
    spans : HarnessTurnSpans
        Where the turn's spans are written.

    Yields
    ------
    StreamEvent
        Each event, unchanged.
    """
    spans.start(prompt)
    error = ""
    try:
        async for event in events:
            spans.see(event)
            if event.type == "error":
                error = str(event.data)
            elif event.type == "done" and isinstance(event.data, dict):
                error = str(event.data.get("sentence") or "")
            yield event
    except BaseException as failure:
        error = error or f"{type(failure).__name__}: {failure}"
        raise
    finally:
        spans.end(error)


__all__ = ["TRACER_NAME", "HarnessTurnSpans", "traced_turn"]
