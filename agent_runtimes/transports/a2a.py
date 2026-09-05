# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2A (Agent-to-Agent) protocol adapter.

Implements the A2A protocol for agent-to-agent communication.
Supports identity context for OAuth token propagation across agent boundaries.
"""

import logging
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, AsyncIterator

from ..context.identities import IdentityContextManager
from .base import BaseTransport

if TYPE_CHECKING:
    from ..adapters.base import BaseAgent

logger = logging.getLogger(__name__)


class A2ATransport(BaseTransport):
    """
    A2A (Agent-to-Agent) protocol adapter.

    Implements the A2A protocol for inter-agent communication.
    This protocol enables agents to communicate and collaborate.

    Protocol Features:
    - Standardized message format for agent communication
    - Task delegation support
    - Result aggregation
    - Capability negotiation

    Example:
        ```python
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.transports import A2ATransport

        agent = PydanticAIAgent(...)
        adapter = A2ATransport(agent)

        # Handle a request from another agent
        response = await adapter.handle_request({
            "task": "analyze_data",
            "data": {"values": [1, 2, 3]},
            "sender_agent_id": "agent-456",
            "conversation_id": "conv-789"
        })
        ```
    """

    @property
    def protocol_name(self) -> str:
        """
        Get the protocol name.
        """
        return "a2a"

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """
        Handle an A2A request.

        Args:
            request: A2A request data with keys:
                - task: Task description
                - data: Task data/parameters
                - sender_agent_id: ID of the requesting agent
                - conversation_id: Conversation identifier
                - capabilities_required: Optional list of required capabilities
                - identities: Optional OAuth identities (list of `{provider, accessToken}`)

        Returns:
            A2A response data with keys:
                - result: Task result
                - status: Success/failure status
                - sender_agent_id: This agent's ID
                - receiver_agent_id: Original sender's ID
                - conversation_id: Conversation identifier
                - metadata: Additional response data
        """
        task = request.get("task", "")
        data = request.get("data", {})
        sender_agent_id = request.get("sender_agent_id", "")
        conversation_id = request.get("conversation_id", str(uuid.uuid4()))
        capabilities_required = request.get("capabilities_required", [])
        identities = request.get("identities")

        # Log identities if provided
        if identities:
            providers = [i.get("provider") for i in identities]
            logger.info(
                f"A2A: Received identities from request for providers: {providers}"
            )

        # Create agent context
        from ..adapters.base import AgentContext

        context = AgentContext(
            session_id=conversation_id,
            metadata={
                "sender_agent_id": sender_agent_id,
                "task": task,
                "data": data,
                "capabilities_required": capabilities_required,
            },
        )

        # Format prompt for the agent
        prompt = f"Task: {task}\n\nData: {data}"

        # Set the identity context for this request so that skill executors
        # and codemode tools can access OAuth tokens during tool execution
        async with IdentityContextManager(identities):
            try:
                # Run the agent
                response = await self.agent.run(prompt, context)

                # Format A2A response
                return {
                    "result": response.content,
                    "status": "success",
                    "sender_agent_id": self.agent.name,
                    "receiver_agent_id": sender_agent_id,
                    "conversation_id": conversation_id,
                    "metadata": {
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "name": tc.name,
                                "arguments": tc.arguments,
                            }
                            for tc in response.tool_calls
                        ],
                        "usage": response.usage,
                        **response.metadata,
                    },
                }

            except Exception as e:
                logger.error(f"A2A request error: {e}")
                return {
                    "result": None,
                    "status": "error",
                    "error": str(e),
                    "sender_agent_id": self.agent.name,
                    "receiver_agent_id": sender_agent_id,
                    "conversation_id": conversation_id,
                }

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Handle a streaming A2A request.

        Args:
            request: A2A request data with optional identities key for OAuth tokens.

        Yields:
            A2A stream events with keys:
                - type: Event type (progress, result, error)
                - data: Event data
                - conversation_id: Conversation identifier
                - sender_agent_id: This agent's ID
        """
        task = request.get("task", "")
        data = request.get("data", {})
        sender_agent_id = request.get("sender_agent_id", "")
        conversation_id = request.get("conversation_id", str(uuid.uuid4()))
        identities = request.get("identities")

        # Log identities if provided
        if identities:
            providers = [i.get("provider") for i in identities]
            logger.debug(f"A2A stream: Using identities for providers: {providers}")

        # Create agent context
        from ..adapters.base import AgentContext

        context = AgentContext(
            session_id=conversation_id,
            metadata={
                "sender_agent_id": sender_agent_id,
                "task": task,
                "data": data,
            },
        )

        # Format prompt for the agent
        prompt = f"Task: {task}\n\nData: {data}"

        # Set the identity context for this request so that skill executors
        # and codemode tools can access OAuth tokens during tool execution
        async with IdentityContextManager(identities):
            try:
                # Stream from agent
                async for event in self.agent.stream(prompt, context):
                    # Map agent event types to A2A event types
                    a2a_event = {
                        "type": "progress" if event.type == "text" else event.type,
                        "data": event.data,
                        "conversation_id": conversation_id,
                        "sender_agent_id": self.agent.name,
                        "receiver_agent_id": sender_agent_id,
                    }

                    # Format tool calls for A2A
                    if event.type == "tool_call" and hasattr(event.data, "name"):
                        a2a_event["type"] = "tool_call"
                        a2a_event["data"] = {
                            "id": event.data.id,
                            "name": event.data.name,
                            "arguments": event.data.arguments,
                        }

                    # Mark completion
                    if event.type == "done":
                        a2a_event["type"] = "complete"
                        a2a_event["status"] = "success"

                    yield a2a_event

            except Exception as e:
                logger.error(f"A2A stream error: {e}")
                yield {
                    "type": "error",
                    "data": str(e),
                    "conversation_id": conversation_id,
                    "sender_agent_id": self.agent.name,
                    "receiver_agent_id": sender_agent_id,
                    "status": "error",
                }


# ---------------------------------------------------------------------------
# FastA2A worker
# ---------------------------------------------------------------------------

try:
    from fasta2a.schema import (
        Artifact,
        Message,
        Part,
        StreamResponse,
        TaskArtifactUpdateEvent,
        TaskIdParams,
        TaskSendParams,
        TaskStatus,
        TaskStatusUpdateEvent,
    )
    from fasta2a.worker import Worker as _FastA2AWorker

    FASTA2A_AVAILABLE = True
except ImportError:  # pragma: no cover - fasta2a is optional
    FASTA2A_AVAILABLE = False
    _FastA2AWorker = object  # type: ignore[assignment,misc]


A2AContext = list[dict[str, Any]]
"""What the worker keeps per A2A context: the messages exchanged so far."""

TERMINAL_TASK_STATES = frozenset({"completed", "canceled", "failed", "rejected"})


def a2a_message_text(message: Any) -> str:
    """The text of an A2A message: its text parts joined, data parts as JSON."""
    import json

    chunks: list[str] = []
    for part in message.get("parts") or []:
        if not isinstance(part, dict):
            continue
        if part.get("text"):
            chunks.append(str(part["text"]))
        elif "data" in part:
            try:
                chunks.append(json.dumps(part["data"]))
            except (TypeError, ValueError):
                chunks.append(str(part["data"]))
    return "\n".join(chunks)


def activated_extensions_of(params: Any) -> list[str]:
    """The A2A extensions the client and the agent agreed on for a task."""
    try:
        from fasta2a.extensions import activated_extensions
    except ImportError:  # pragma: no cover - older fasta2a without extensions
        metadata = params.get("metadata") or {}
        value = metadata.get("a2a.activated_extensions")
        return [str(v) for v in value] if isinstance(value, list) else []
    return activated_extensions(params)


def _tool_call_payload(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        return {
            "id": data.get("id"),
            "name": data.get("name"),
            "arguments": data.get("arguments") or data.get("args") or {},
        }
    return {
        "id": getattr(data, "id", None),
        "name": getattr(data, "name", None),
        "arguments": getattr(data, "arguments", None) or {},
    }


def _tool_result_payload(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        return {
            "id": data.get("tool_call_id") or data.get("id"),
            "name": data.get("name"),
            "result": _short(data.get("result")),
            "error": data.get("error"),
        }
    return {
        "id": getattr(data, "tool_call_id", None),
        "name": getattr(data, "name", None),
        "result": _short(getattr(data, "result", None)),
        "error": getattr(data, "error", None),
    }


def _short(value: Any, limit: int = 2000) -> str:
    if value is None:
        return ""
    text = value if isinstance(value, str) else str(value)
    return text if len(text) <= limit else text[:limit] + "…"


@dataclass
class A2AWorker(_FastA2AWorker):  # type: ignore[misc]
    """Runs a `BaseAgent` for the tasks a FastA2A app receives, streaming as it goes.

    The A2A server side of agent-runtimes. Where the pydantic-ai bridge in
    fasta2a runs a bare ``pydantic_ai.Agent`` and reports only when it is done,
    this worker runs the agent *adapter* — so MCP servers, skills, codemode,
    guardrails and approvals apply exactly as they do over the other transports
    — and republishes the run while it happens: each text delta as an artifact
    chunk (``append=True``), each tool call and result as a ``working`` status
    carrying a data part, the whole answer once more as the last chunk, then
    the final status.

    The parent's ``AgentContext.metadata["a2a"]`` names the task, the context
    and the activated extensions, for tools that want to know.
    """

    agent: "BaseAgent" = None  # type: ignore[assignment]

    async def run_task(self, params: "TaskSendParams") -> None:
        task = await self.storage.load_task(params["id"])
        if task is None:
            raise ValueError(f"Task {params['id']} not found")
        task_id = task["id"]
        context_id = task["context_id"]

        await self.storage.update_task(task_id, state="working")
        await self._emit_status(task_id, context_id, "working")

        history: A2AContext = list(await self.storage.load_context(context_id) or [])
        incoming = params["message"]
        prompt = a2a_message_text(incoming)

        from ..adapters.base import AgentContext

        context = AgentContext(
            session_id=context_id,
            conversation_history=self.build_message_history(history),
            metadata={
                "a2a": {
                    "task_id": task_id,
                    "context_id": context_id,
                    "activated_extensions": activated_extensions_of(params),
                }
            },
        )

        artifact_id = str(uuid.uuid4())
        text = ""
        final_output: str | None = None
        async for event in self.agent.stream(prompt, context):
            if event.type == "text":
                delta = str(event.data or "")
                if not delta:
                    continue
                text += delta
                await self._emit(
                    task_id,
                    StreamResponse(
                        artifact_update=TaskArtifactUpdateEvent(
                            task_id=task_id,
                            context_id=context_id,
                            artifact=Artifact(
                                artifact_id=artifact_id,
                                name="result",
                                parts=[Part(text=delta)],
                            ),
                            append=True,
                            last_chunk=False,
                        )
                    ),
                )
            elif event.type == "tool_call":
                await self._emit_working_message(
                    task_id,
                    context_id,
                    Part(data={"tool_call": _tool_call_payload(event.data)}),
                )
            elif event.type == "tool_result":
                await self._emit_working_message(
                    task_id,
                    context_id,
                    Part(data={"tool_result": _tool_result_payload(event.data)}),
                )
            elif event.type == "output":
                final_output = str(event.data) if event.data is not None else None
            elif event.type == "error":
                raise RuntimeError(str(event.data))

        output = text or final_output or ""
        reply = Message(
            role="agent",
            parts=[Part(text=output)],
            message_id=str(uuid.uuid4()),
            context_id=context_id,
        )
        await self.storage.update_context(context_id, [*history, incoming, reply])
        artifact = Artifact(artifact_id=artifact_id, name="result", parts=[Part(text=output)])
        await self.storage.update_task(
            task_id,
            state="completed",
            new_artifacts=[artifact],
            new_messages=[reply],
        )
        # The whole result once more, as the last chunk: a client that does
        # not assemble chunks, or joined late, still gets the answer.
        await self._emit(
            task_id,
            StreamResponse(
                artifact_update=TaskArtifactUpdateEvent(
                    task_id=task_id,
                    context_id=context_id,
                    artifact=artifact,
                    append=False,
                    last_chunk=True,
                )
            ),
        )
        await self._emit_status(task_id, context_id, "completed")
        await self.broker.event_bus.close(task_id)

    async def cancel_task(self, params: "TaskIdParams") -> None:
        logger.info("A2A cancel requested for task %s", params.get("id"))

    def build_message_history(self, history: list[Any]) -> list[dict[str, Any]]:
        return [
            {
                "role": "user" if message.get("role") == "user" else "assistant",
                "content": a2a_message_text(message),
            }
            for message in history
            if isinstance(message, dict)
        ]

    def build_artifacts(self, result: Any) -> list["Artifact"]:
        return [
            Artifact(
                artifact_id=str(uuid.uuid4()),
                name="result",
                parts=[Part(text=str(result))],
            )
        ]

    async def _emit(self, task_id: str, event: "StreamResponse") -> None:
        await self.broker.event_bus.emit(task_id, event)

    async def _emit_status(
        self,
        task_id: str,
        context_id: str,
        state: str,
        message: "Message | None" = None,
    ) -> None:
        status = TaskStatus(state=state)  # type: ignore[typeddict-item]
        if message is not None:
            status["message"] = message
        await self._emit(
            task_id,
            StreamResponse(
                status_update=TaskStatusUpdateEvent(
                    task_id=task_id, context_id=context_id, status=status
                )
            ),
        )

    async def _emit_working_message(
        self, task_id: str, context_id: str, part: "Part"
    ) -> None:
        await self._emit_status(
            task_id,
            context_id,
            "working",
            Message(
                role="agent",
                parts=[part],
                message_id=str(uuid.uuid4()),
                context_id=context_id,
            ),
        )
