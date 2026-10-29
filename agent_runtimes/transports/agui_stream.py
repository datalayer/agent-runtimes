# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Any ``BaseAgent`` served over AG-UI, from its ``stream`` (SH-10, SH-19).

The AG-UI transport runs a pydantic-ai agent through pydantic-ai's own
adapter; an agent that is not one — a harness driven over ACP — has only
``BaseAgent.stream``. This module turns that stream into the AG-UI events the
web chat, the terminal (``loop``) and the embed read:

- ``text`` → ``TEXT_MESSAGE_START`` / ``CONTENT`` / ``END``, one message per
  run of text;
- ``thought`` → the thinking events, folded on the page;
- ``tool_call`` → ``TOOL_CALL_START`` / ``ARGS`` / ``END`` the first time a
  call is seen, and ``datalayer.harness.tool_call`` (a custom event, with
  ``status``, ``awaiting``, ``display``) for every update of it;
- ``tool_result`` → ``TOOL_CALL_RESULT``, its displays (a diff, a terminal)
  in the content;
- ``plan``, ``commands``, ``mode``, ``session_info`` → custom events named
  ``datalayer.harness.<type>``;
- ``done`` → ``RUN_FINISHED``; ``error`` → ``RUN_ERROR``.

Nothing is guessed into an event the protocol does not have.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator

from ag_ui.core import (
    BaseEvent,
    CustomEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ThinkingEndEvent,
    ThinkingStartEvent,
    ThinkingTextMessageContentEvent,
    ThinkingTextMessageEndEvent,
    ThinkingTextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder

from ..adapters.base import AgentContext, BaseAgent, StreamEvent

logger = logging.getLogger(__name__)

#: The name a custom event carries for what AG-UI has no event for.
CUSTOM_PREFIX = "datalayer.harness."


def _text_of(content: Any) -> str:
    """The text of a message's content, a string or text blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(block.get("text", ""))
            for block in content
            if isinstance(block, dict) and block.get("type") == "text"
        )
    return str(content or "")


def conversation_of(body: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """The prompt (the last user message) and the messages before it, as the adapter takes them."""
    messages = [m for m in body.get("messages") or [] if isinstance(m, dict)]
    last = max(
        (i for i, m in enumerate(messages) if m.get("role") == "user"), default=None
    )
    if last is None:
        prompt = str(body.get("prompt") or "")
        return prompt, [
            {"role": str(m.get("role") or ""), "content": _text_of(m.get("content"))}
            for m in messages
        ]
    prompt = _text_of(messages[last].get("content"))
    history = [
        {"role": str(m.get("role") or ""), "content": _text_of(m.get("content"))}
        for m in messages[:last]
    ]
    return prompt, history


async def agui_events(
    agent: BaseAgent, body: dict[str, Any], *, user_token: str | None = None
) -> AsyncIterator[BaseEvent]:
    """The AG-UI events of one run of ``agent`` on ``body`` (a ``RunAgentInput``).

    Yields
    ------
    BaseEvent
        The run's events, ``RUN_STARTED`` first and ``RUN_FINISHED`` or
        ``RUN_ERROR`` last.
    """
    thread_id = str(body.get("threadId") or body.get("thread_id") or uuid.uuid4())
    run_id = str(body.get("runId") or body.get("run_id") or uuid.uuid4())
    prompt, history = conversation_of(body)
    context = AgentContext(
        session_id=thread_id,
        conversation_history=history,
        metadata={
            "run_id": run_id,
            **({"user_token": user_token} if user_token else {}),
        },
    )
    yield RunStartedEvent(thread_id=thread_id, run_id=run_id)
    message_id: str | None = None
    thinking = False
    started_calls: set[str] = set()
    finished = False

    def close_text() -> list[BaseEvent]:
        """End the open text message, if any."""
        nonlocal message_id
        if message_id is None:
            return []
        closing = [TextMessageEndEvent(message_id=message_id)]
        message_id = None
        return closing

    def close_thinking() -> list[BaseEvent]:
        """End the open thought, if any."""
        nonlocal thinking
        if not thinking:
            return []
        thinking = False
        return [ThinkingTextMessageEndEvent(), ThinkingEndEvent()]

    try:
        async for event in agent.stream(prompt, context):
            for item in _events_of(event, close_text, close_thinking):
                yield item
            if event.type == "text":
                if message_id is None:
                    message_id = str(uuid.uuid4())
                    yield TextMessageStartEvent(message_id=message_id, role="assistant")
                yield TextMessageContentEvent(
                    message_id=message_id, delta=str(event.data)
                )
            elif event.type == "thought":
                if not thinking:
                    thinking = True
                    yield ThinkingStartEvent()
                    yield ThinkingTextMessageStartEvent()
                yield ThinkingTextMessageContentEvent(delta=str(event.data))
            elif event.type == "tool_call":
                data = dict(event.data or {})
                call_id = str(data.get("id") or uuid.uuid4())
                if call_id not in started_calls:
                    started_calls.add(call_id)
                    yield ToolCallStartEvent(
                        tool_call_id=call_id,
                        tool_call_name=str(data.get("name") or call_id),
                    )
                    yield ToolCallArgsEvent(
                        tool_call_id=call_id,
                        delta=json.dumps(data.get("arguments") or {}),
                    )
                    yield ToolCallEndEvent(tool_call_id=call_id)
                yield CustomEvent(name=f"{CUSTOM_PREFIX}tool_call", value=data)
            elif event.type == "tool_result":
                data = dict(event.data or {})
                call_id = str(data.get("id") or "")
                yield ToolCallResultEvent(
                    message_id=str(uuid.uuid4()),
                    tool_call_id=call_id,
                    # `_meta["reactor.ui/display"]` beside the result, as the
                    # page reads every protocol display (SH-16).
                    content=json.dumps(
                        {
                            key: data[key]
                            for key in ("result", "status", "display", "error", "_meta")
                            if key in data
                        },
                        default=str,
                    ),
                    role="tool",
                )
            elif event.type in ("plan", "commands", "mode", "session_info"):
                yield CustomEvent(name=f"{CUSTOM_PREFIX}{event.type}", value=event.data)
            elif event.type == "done":
                finished = True
                for item in close_text():
                    yield item
                yield RunFinishedEvent(
                    thread_id=thread_id, run_id=run_id, result=event.data
                )
            elif event.type == "error":
                finished = True
                for item in close_text():
                    yield item
                yield RunErrorEvent(message=str(event.data))
            else:
                logger.debug("no AG-UI event for the stream event %r", event.type)
    except Exception as error:  # noqa: BLE001 - said to the client, never swallowed
        if not finished:
            finished = True
            for item in close_text():
                yield item
            yield RunErrorEvent(message=f"The agent failed: {error}")
        else:
            raise
    if not finished:
        for item in close_text():
            yield item
        yield RunFinishedEvent(thread_id=thread_id, run_id=run_id)


def _events_of(
    event: StreamEvent, close_text: Any, close_thinking: Any
) -> list[BaseEvent]:
    """What a change of kind closes: the open text message, the open thought."""
    closing: list[BaseEvent] = []
    if event.type != "text":
        closing.extend(close_text())
    if event.type != "thought":
        closing.extend(close_thinking())
    return closing


def agui_app_of(agent: BaseAgent, agent_id: str) -> Any:
    """A Starlette application serving ``agent`` over AG-UI at its root."""
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import StreamingResponse
    from starlette.routing import Route

    from ..context.identities import set_request_user_jwt
    from ..otel.prompt_turn_metrics import extract_jwt_token

    async def run(request: Request) -> StreamingResponse:
        """Run the agent on the request's ``RunAgentInput`` and stream the events."""
        body = await request.json()
        token = extract_jwt_token(
            request.headers.get("authorization"),
            request.headers.get("x-external-token"),
        )
        set_request_user_jwt(token)
        encoder = EventEncoder(accept=request.headers.get("accept"))

        async def body_iterator() -> AsyncIterator[str]:
            """Encode each event as the client accepts it."""
            async for event in agui_events(agent, body, user_token=token):
                yield encoder.encode(event)

        return StreamingResponse(body_iterator(), media_type=encoder.get_content_type())

    return Starlette(routes=[Route("/", run, methods=["POST"])])


__all__ = ["CUSTOM_PREFIX", "agui_app_of", "agui_events", "conversation_of"]
