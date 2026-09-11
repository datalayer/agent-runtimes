# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2A (Agent-to-Agent) protocol adapter.

Implements the A2A protocol for agent-to-agent communication.
Supports identity context for OAuth token propagation across agent boundaries.
"""

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable

from ..context.identities import IdentityContextManager
from .base import BaseTransport

if TYPE_CHECKING:
    from ..adapters.base import BaseAgent

logger = logging.getLogger(__name__)


class A2ATransport(BaseTransport):
    """
    Serve one agent over A2A: the worker side of the protocol.

    This runs a task an A2A client sent, streams what the agent produces
    back as A2A events, cancels a running task, and turns a result into A2A
    artifacts — `run_task`, `cancel_task`, `build_message_history` and
    `build_artifacts` are the whole of it. OAuth identity is propagated
    across the agent boundary through the identity context.

    It is deliberately not an orchestrator. It does not choose a worker,
    delegate to one, aggregate results across several, or negotiate
    capabilities: those are the orchestration control plane's, and the
    canonical model they will speak lives in `datalayer_core.orchestration`
    (PLAN_ORCHESTRATOR.md). This docstring used to claim task delegation,
    result aggregation and capability negotiation, none of which the class
    has ever done, and a docstring that describes a design rather than a
    class is how somebody comes to depend on a feature that is not there.

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
    from fasta2a.schema import Artifact, Message, Part, TaskIdParams, TaskSendParams
    from fasta2a.worker import Worker as _FastA2AWorker

    FASTA2A_AVAILABLE = True
except ImportError:  # pragma: no cover - fasta2a is optional
    FASTA2A_AVAILABLE = False
    _FastA2AWorker = object  # type: ignore[assignment,misc]


A2AContext = list[dict[str, Any]]
"""What the worker keeps per A2A context: the messages exchanged so far."""

STOPPED = "Stopped."


@dataclass(frozen=True)
class TaskCancellation:
    """How a running task can be told to stop from outside the worker.

    fasta2a's worker takes operations one at a time, so a ``tasks/cancel``
    queued behind a running task is only seen once that task is over. The
    server's terminate endpoint sets an event instead; the worker registers
    each task's event here and checks it as it streams.
    """

    register: Callable[[str], asyncio.Event]
    unregister: Callable[[str], None]
    cancel: Callable[[str], bool]


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
    from fasta2a.extensions import activated_extensions

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

    The A2A server side of agent-runtimes. Where fasta2a's pydantic-ai bridge
    runs a bare ``pydantic_ai.Agent``, this worker runs the agent *adapter* — so
    MCP servers, skills, codemode, guardrails and approvals apply exactly as
    they do over the other transports — and publishes the run as it happens:
    each text delta as a chunk of the answer's artifact, each tool call and
    result as a ``working`` status carrying a data part, the whole answer as
    the last chunk. fasta2a's `Worker` then publishes the final state from
    storage and ends the stream; when the run raises, the reason rides on the
    ``failed`` status so the client learns it.

    The agent's ``AgentContext.metadata["a2a"]`` names the task, the context and
    the activated extensions, for tools that want to know.
    """

    agent: "BaseAgent" = None  # type: ignore[assignment]
    cancellation: TaskCancellation | None = None

    async def run_task(self, params: "TaskSendParams") -> None:
        task = await self.storage.load_task(params["id"])
        if task is None:
            raise ValueError(f"Task {params['id']} not found")
        task_id = task["id"]
        context_id = task["context_id"]
        try:
            await self._run(task_id, context_id, params)
        except Exception as exc:
            # fasta2a marks the task failed and ends the stream, but says
            # nothing about why. Log it, and put the reason on the failed
            # status; closing here keeps the base's own failed status from
            # following it.
            logger.exception(
                "A2A task %s for agent %s failed", task_id, self.agent.name
            )
            from ..guardrails.model_budget import ModelBudgetExceeded, refusal_meta

            await self.storage.update_task(task_id, state="failed")
            message = _agent_message(
                context_id, Part(text=f"{type(exc).__name__}: {exc}")
            )
            if isinstance(exc, ModelBudgetExceeded):
                # Which limit of the budget the delegation set stopped the run,
                # where the delegation put the budget (O1-07).
                message["metadata"] = refusal_meta(exc.reached)
            await self.publish_status(task_id, context_id, "failed", message)
            await self.broker.event_bus.close(task_id)
            raise

    async def _run(
        self, task_id: str, context_id: str, params: "TaskSendParams"
    ) -> None:
        cancel = self.cancellation.register(task_id) if self.cancellation else None
        try:
            await self._stream_run(task_id, context_id, params, cancel)
        finally:
            if self.cancellation:
                self.cancellation.unregister(task_id)

    async def _stream_run(
        self,
        task_id: str,
        context_id: str,
        params: "TaskSendParams",
        cancel: "asyncio.Event | None",
    ) -> None:
        await self.storage.update_task(task_id, state="working")
        await self.publish_status(task_id, context_id, "working")

        history: A2AContext = list(await self.storage.load_context(context_id) or [])
        incoming = params["message"]
        prompt = a2a_message_text(incoming)

        from ..adapters.base import AgentContext
        from ..guardrails.model_budget import delegated_budget

        # The model budget the delegation set on this run, when it set one:
        # the adapter applies it as the run's usage limits (O1-07).
        budget = delegated_budget(incoming.get("metadata"))
        context = AgentContext(
            session_id=context_id,
            conversation_history=self.build_message_history(history),
            metadata={
                "a2a": {
                    "task_id": task_id,
                    "context_id": context_id,
                    "activated_extensions": activated_extensions_of(params),
                },
                **({"budget": budget} if budget else {}),
            },
        )

        artifact_id = str(uuid.uuid4())
        text = ""
        final_output: str | None = None
        canceled = False
        async for event in self.agent.stream(prompt, context):
            if cancel is not None and cancel.is_set():
                # Leaving the loop closes the adapter's stream, which stops the
                # run underneath it.
                canceled = True
                break
            if event.type == "text":
                delta = str(event.data or "")
                if not delta:
                    continue
                text += delta
                await self.publish_artifact(
                    task_id,
                    context_id,
                    Artifact(
                        artifact_id=artifact_id, name="result", parts=[Part(text=delta)]
                    ),
                    append=True,
                    last_chunk=False,
                )
            elif event.type == "tool_call":
                await self.publish_status(
                    task_id,
                    context_id,
                    "working",
                    _agent_message(
                        context_id,
                        Part(data={"tool_call": _tool_call_payload(event.data)}),
                    ),
                )
            elif event.type == "tool_result":
                await self.publish_status(
                    task_id,
                    context_id,
                    "working",
                    _agent_message(
                        context_id,
                        Part(data={"tool_result": _tool_result_payload(event.data)}),
                    ),
                )
            elif event.type == "output":
                final_output = str(event.data) if event.data is not None else None
            elif event.type == "error":
                from ..guardrails.model_budget import (
                    ModelBudgetExceeded,
                    ModelBudgetReached,
                )

                if isinstance(event.data, ModelBudgetReached):
                    raise ModelBudgetExceeded(event.data)
                raise RuntimeError(str(event.data))

        if canceled:
            logger.info("A2A task %s for agent %s stopped", task_id, self.agent.name)
            await self.storage.update_task(task_id, state="canceled")
            await self.publish_status(
                task_id,
                context_id,
                "canceled",
                _agent_message(context_id, Part(text=STOPPED)),
            )
            await self.broker.event_bus.close(task_id)
            return

        output = text or final_output or ""
        reply = _agent_message(context_id, Part(text=output))
        await self.storage.update_context(context_id, [*history, incoming, reply])
        artifact = Artifact(
            artifact_id=artifact_id, name="result", parts=[Part(text=output)]
        )
        await self.storage.update_task(
            task_id,
            state="completed",
            new_artifacts=[artifact],
            new_messages=[reply],
        )
        # The whole result once more, as the last chunk: a client that does
        # not assemble chunks, or joined late, still gets the answer. The
        # `completed` status and the end of the stream come from the base.
        await self.publish_artifact(task_id, context_id, artifact)

    async def cancel_task(self, params: "TaskIdParams") -> None:
        logger.info("A2A cancel requested for task %s", params.get("id"))
        if self.cancellation:
            self.cancellation.cancel(params["id"])

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


def _agent_message(context_id: str, part: "Part") -> "Message":
    return Message(
        role="agent",
        parts=[part],
        message_id=str(uuid.uuid4()),
        context_id=context_id,
    )
