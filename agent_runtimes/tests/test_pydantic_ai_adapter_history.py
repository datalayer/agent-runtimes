# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a pydantic-ai agent is given of the conversation before its prompt.

``AgentContext.conversation_history`` is the previous messages, in the
transports' ``{"role", "content"}`` shape. The adapter hands pydantic-ai its
own messages, in order, then the prompt once. An A2A task's context and the
checkpoint a resumed run starts from (O2-05) reach the model this way; handed
over as they were, pydantic-ai refused them and the run failed.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.adapters.pydantic_ai_adapter import (
    PydanticAIAdapter,
    model_messages,
)

HISTORY = [
    {"role": "user", "content": "Profile the notebook"},
    {"role": "assistant", "content": "Reading the cells."},
]


def _said(messages: list[Any]) -> list[tuple[str, str]]:
    """Each message the model was given, as who said it and what."""
    said: list[tuple[str, str]] = []
    for message in messages:
        for part in message.parts:
            if isinstance(part, UserPromptPart):
                said.append(("user", str(part.content)))
            elif isinstance(part, TextPart):
                said.append(("assistant", part.content))
            elif isinstance(part, SystemPromptPart):
                said.append(("system", part.content))
    return said


def _adapter(seen: list[list[Any]]) -> PydanticAIAdapter:
    """An adapter whose model keeps what it was given, and answers."""

    def model(messages: list[Any], info: AgentInfo) -> ModelResponse:
        seen.append(list(messages))
        return ModelResponse(parts=[TextPart(content="Done")])

    async def stream_model(messages: list[Any], info: AgentInfo) -> Any:
        seen.append(list(messages))
        yield "Done"

    return PydanticAIAdapter(Agent(FunctionModel(model, stream_function=stream_model)))


class TestTheConversationAModelIsGiven:
    def test_each_message_becomes_pydantic_ais_own(self) -> None:
        messages = model_messages(
            [{"role": "system", "content": "Be brief"}, *HISTORY, {"role": "agent", "content": "Done reading"}]
        )
        assert [type(message) for message in messages] == [ModelRequest, ModelRequest, ModelResponse, ModelResponse]
        assert _said(messages) == [
            ("system", "Be brief"),
            ("user", "Profile the notebook"),
            ("assistant", "Reading the cells."),
            ("assistant", "Done reading"),
        ]

    def test_a_message_already_pydantic_ais_is_kept(self) -> None:
        request = ModelRequest(parts=[UserPromptPart(content="Hello")])
        assert model_messages([request]) == [request]

    @pytest.mark.parametrize(
        "message",
        (
            {"role": "tool", "content": "42"},
            {"role": "user", "content": ["not", "text"]},
            {"content": "Nobody said this"},
        ),
    )
    def test_a_message_it_cannot_read_is_refused(self, message: dict[str, Any]) -> None:
        with pytest.raises(ValueError):
            model_messages([message])

    @pytest.mark.asyncio
    async def test_a_streamed_run_is_given_the_conversation_then_its_prompt_once(self) -> None:
        seen: list[list[Any]] = []
        context = AgentContext(session_id="s", conversation_history=list(HISTORY))

        events = [event async for event in _adapter(seen).stream("Carry on", context)]

        assert [event.type for event in events if event.type == "error"] == []
        assert _said(seen[0]) == [
            ("user", "Profile the notebook"),
            ("assistant", "Reading the cells."),
            ("user", "Carry on"),
        ]

    @pytest.mark.asyncio
    async def test_a_run_is_given_the_conversation_then_its_prompt_once(self) -> None:
        seen: list[list[Any]] = []
        context = AgentContext(session_id="s", conversation_history=list(HISTORY))

        await _adapter(seen).run("Carry on", context)

        assert _said(seen[0]) == [
            ("user", "Profile the notebook"),
            ("assistant", "Reading the cells."),
            ("user", "Carry on"),
        ]
