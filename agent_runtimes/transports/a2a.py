# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2A (Agent-to-Agent) protocol adapter.

Implements the A2A protocol for agent-to-agent communication.
Supports identity context for OAuth token propagation across agent boundaries.
"""

import asyncio
import difflib
import hashlib
import logging
import re
import traceback
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable

from ..context.identities import IdentityContextManager
from ..guardrails.credentials import redact
from .base import BaseTransport

if TYPE_CHECKING:
    from ..adapters.base import BaseAgent
    from ..context.usage import TurnSpend
    from ..output.formats import RunOutputs

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
    canonical model they will speak lives in `datalayer_core.orchestration`.
    This docstring used to claim task delegation,
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
                logger.error(redact(f"A2A request error: {e}"))
                return {
                    "result": None,
                    "status": "error",
                    "error": redact(str(e)),
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
                logger.error(redact(f"A2A stream error: {e}"))
                yield {
                    "type": "error",
                    "data": redact(str(e)),
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
    _FastA2AWorker = object


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
        payload = {
            "id": data.get("id"),
            "name": data.get("name"),
            "arguments": data.get("arguments") or data.get("args") or {},
        }
    else:
        payload = {
            "id": getattr(data, "id", None),
            "name": getattr(data, "name", None),
            "arguments": getattr(data, "arguments", None) or {},
        }
    return _with_output_note(payload, ended=False)


def _tool_result_payload(data: Any) -> dict[str, Any]:
    if isinstance(data, dict):
        payload = {
            "id": data.get("tool_call_id") or data.get("id"),
            "name": data.get("name"),
            "result": _short(data.get("result")),
            "error": data.get("error"),
        }
    else:
        payload = {
            "id": getattr(data, "tool_call_id", None),
            "name": getattr(data, "name", None),
            "result": _short(getattr(data, "result", None)),
            "error": getattr(data, "error", None),
        }
    return _with_output_note(payload, ended=True)


def _with_output_note(payload: dict[str, Any], ended: bool) -> dict[str, Any]:
    """A tool that composes an output says what it does in words: `Writing a notebook…`.

    Its arguments are the output itself, which the caller receives as an
    artifact: they are not told twice.
    """
    from ..output.formats import OUTPUT_TOOL_NOTES

    notes = OUTPUT_TOOL_NOTES.get(str(payload.get("name") or ""))
    if notes is None:
        return payload
    if not ended:
        payload["arguments"] = {}
    else:
        payload["result"] = notes[1]
    return {**payload, "note": notes[1] if ended else notes[0]}


def _short(value: Any, limit: int = 2000) -> str:
    if value is None:
        return ""
    text = value if isinstance(value, str) else str(value)
    return text if len(text) <= limit else text[:limit] + "…"


# -- a harness served over A2A (SH-15) ---------------------------------------

#: The media type of a diff artifact, one per file the harness changed.
DIFF_MEDIA_TYPE = "text/x-diff"

#: What a caller answers an approval with, when it does not know the extension:
#: one word, whole, matched against the options' ids and names and these.
YES_WORDS = frozenset({"yes", "y", "allow", "approve", "ok", "approved"})
ALWAYS_WORDS = frozenset({"always", "allow_always"})
NO_WORDS = frozenset({"no", "n", "reject", "deny", "refuse", "rejected"})

#: How long an A2A caller has to answer an approval, when the approvals have
#: no timeout of their own.
APPROVAL_TIMEOUT = 300.0

#: How long a delegated task — a team seat's, any run the control plane
#: dispatched — waits on an approval: the control plane files it as a tool
#: approval under the execution, keeps the attempt's lease while it waits,
#: and answers at its own deadline (a day when the execution names none), so
#: the worker does not answer first with a timeout of its own.
DELEGATED_APPROVAL_TIMEOUT = 24 * 60 * 60.0


def unified_diff(path: str, old_text: str | None, new_text: str) -> str:
    """
    The change to one file as a unified diff: ``a/<path>`` to ``b/<path>``, ``/dev/null`` for a new file.

    Parameters
    ----------
    path : str
        The file, as the harness named it.
    old_text : str | None
        What it held; ``None`` for a file that did not exist.
    new_text : str
        What it holds now.

    Returns
    -------
    str
        The diff, ending with a newline.
    """
    before = old_text.splitlines(keepends=True) if old_text is not None else []
    after = new_text.splitlines(keepends=True)
    lines = list(
        difflib.unified_diff(
            before,
            after,
            fromfile="/dev/null" if old_text is None else f"a/{path}",
            tofile=f"b/{path}",
        )
    )
    text = "".join(line if line.endswith("\n") else line + "\n" for line in lines)
    return text or f"--- a/{path}\n+++ b/{path}\n"


def provenance_of(body: str, *sources: str) -> dict[str, Any]:
    """
    ``artifactProvenance`` of the orchestration extension: the body's hash, when, from what.

    Parameters
    ----------
    body : str
        The artifact's text.
    *sources : str
        What it was produced from (the file's path).

    Returns
    -------
    dict[str, Any]
        ``{"datalayer": {"artifactProvenance": {contentHash, producedAt, sourceReferences}}}``.
    """
    return {
        "datalayer": {
            "artifactProvenance": {
                "contentHash": f"sha256:{hashlib.sha256(body.encode('utf-8')).hexdigest()}",
                "producedAt": datetime.now(timezone.utc).isoformat(),
                "sourceReferences": list(sources),
            }
        }
    }


def diff_artifact(
    artifact_id: str, path: str, old_text: str | None, new_text: str
) -> "Artifact":
    """
    One ``diff`` artifact: named by its path, ``text/x-diff``, with its provenance.

    Parameters
    ----------
    artifact_id : str
        The artifact's id, the same for every change to the path in a task.
    path : str
        The file.
    old_text : str | None
        What it held.
    new_text : str
        What it holds now.

    Returns
    -------
    Artifact
        The artifact, its one part the unified diff.
    """
    body = unified_diff(path, old_text, new_text)
    return Artifact(
        artifact_id=artifact_id,
        name=path,
        description=f"The change to {path}, as a unified diff.",
        parts=[Part(text=body, media_type=DIFF_MEDIA_TYPE, filename=path)],
        metadata=provenance_of(body, path),
    )


def plan_artifact(artifact_id: str, steps: list[dict[str, Any]]) -> "Artifact":
    """
    The ``plan`` artifact, replaced as the harness's plan progresses.

    Parameters
    ----------
    artifact_id : str
        The artifact's id, the same for the whole task.
    steps : list[dict[str, Any]]
        The plan's entries: ``content``, ``priority``, ``status``.

    Returns
    -------
    Artifact
        A text part (the steps ticked) and a data part (the steps as given).
    """
    marks = {"completed": "x", "in_progress": "~"}
    lines = [
        f"- [{marks.get(str(step.get('status')), ' ')}] {step.get('content', '')}"
        + (f" ({step['priority']})" if step.get("priority") else "")
        for step in steps
    ]
    body = "\n".join(lines) + ("\n" if lines else "")
    return Artifact(
        artifact_id=artifact_id,
        name="plan",
        description="The harness's plan, its steps ticked as it progresses.",
        parts=[
            Part(text=body, media_type="text/markdown"),
            Part(data={"steps": steps}, media_type="application/json"),
        ],
        metadata=provenance_of(body),
    )


def harness_card_skills(harness: Any) -> list[dict[str, Any]]:
    """
    The agent card's skills for a harness, from its spec.

    Parameters
    ----------
    harness : HarnessSpec
        The catalogue's spec.

    Returns
    -------
    list[dict[str, Any]]
        One skill: the harness, what it answers in (words, diffs, the plan).
    """
    return [
        {
            "id": str(harness.id),
            "name": str(harness.name),
            "description": str(harness.description or harness.name),
            "tags": [*(harness.tags or []), "acp"],
            "input_modes": ["text/plain"],
            "output_modes": ["text/plain", DIFF_MEDIA_TYPE, "application/json"],
        }
    ]


def chosen_option(message: Any, options: list[dict[str, str]]) -> str | None:
    """
    Which option a caller's message chooses: the extension's ``approval.optionId``, else one whole word.

    Parameters
    ----------
    message : Message
        The caller's message on the waiting task.
    options : list[dict[str, str]]
        The options offered: ``option_id``, ``name``, ``kind``.

    Returns
    -------
    str | None
        The option's id, or ``None`` when the message chooses none.
    """
    meta = message.get("metadata") if isinstance(message, dict) else None
    ours = meta.get("datalayer") if isinstance(meta, dict) else None
    answer = ours.get("approval") if isinstance(ours, dict) else None
    if isinstance(answer, dict) and answer.get("optionId"):
        wanted = str(answer["optionId"])
        return next((o["option_id"] for o in options if o["option_id"] == wanted), None)
    words = a2a_message_text(message).strip().lower()
    if not re.fullmatch(r"[a-z_][a-z0-9_-]*", words):
        return None
    for option in options:
        if words in (option["option_id"].lower(), option["name"].lower()):
            return option["option_id"]
    kinds = (
        ("allow_always", "allow_once")
        if words in ALWAYS_WORDS
        else ("allow_once", "allow_always")
        if words in YES_WORDS
        else ("reject_once", "reject_always")
        if words in NO_WORDS
        else ()
    )
    for kind in kinds:
        for option in options:
            if option["kind"] == kind:
                return option["option_id"]
    return None


class A2AApprovals:
    """
    The runtime's approvals over A2A: ``input-required`` carrying ``approvalRequest``, answered on the same task.

    The harness's *ask me first* reaches an A2A caller as a
    status ``input-required`` whose message says the sentence and the options
    in words, and carries the orchestration extension's ``approvalRequest
    {toolCall, options, expiresAt}`` in its metadata. The
    caller answers with a message on the same task: ``datalayer.approval
    {optionId}`` when it knows the extension, else one whole word (*yes*,
    *no*, *always*, or an option's name — a2acode's convention, the fallback
    only). The task's stream ends at ``input-required`` as A2A says; the
    caller resubscribes for the rest.
    """

    def __init__(
        self,
        worker: "A2AWorker",
        task_id: str,
        context_id: str,
        timeout: float = APPROVAL_TIMEOUT,
    ) -> None:
        """Keep the task the approvals are raised on."""
        self.worker = worker
        self.task_id = task_id
        self.context_id = context_id
        self.timeout = timeout
        self.options: list[dict[str, str]] = []
        self.answer: asyncio.Future[str] | None = None

    async def request_and_wait(
        self, tool_name: str, tool_args: dict[str, Any], tool_call_id: str | None = None
    ) -> dict[str, Any]:
        """
        Raise the approval as ``input-required`` and wait for the caller's answer.

        Returns
        -------
        dict[str, Any]
            ``{"status": "approved", "option_id": …}`` for an allowing option.

        Raises
        ------
        ToolApprovalRejectedError
            The caller chose a rejecting option.
        ToolApprovalTimeoutError
            Nobody answered in time.
        """
        from ..guardrails.tool_approvals import (
            ToolApprovalRejectedError,
            ToolApprovalTimeoutError,
        )

        self.options = [
            {
                "option_id": str(o.get("option_id") or o.get("optionId") or ""),
                "name": str(o.get("name") or ""),
                "kind": str(o.get("kind") or ""),
            }
            for o in (tool_args.get("options") or [])
            if isinstance(o, dict)
        ] or [
            {"option_id": "allow", "name": "Allow", "kind": "allow_once"},
            {"option_id": "reject", "name": "Reject", "kind": "reject_once"},
        ]
        sentence = str(tool_args.get("sentence") or tool_name)
        expires = datetime.now(timezone.utc) + timedelta(seconds=self.timeout)
        asked = _agent_message(
            self.context_id,
            Part(
                text=(
                    f"{sentence} Answer on this task with one of: "
                    + ", ".join(f"{o['name']} ({o['option_id']})" for o in self.options)
                    + "."
                )
            ),
        )
        asked["metadata"] = {
            "datalayer": {
                "approvalRequest": {
                    "toolCall": {
                        "id": tool_call_id or "",
                        "title": tool_name,
                        "kind": str(tool_args.get("kind") or "other"),
                        "sentence": sentence,
                        **{
                            key: value
                            for key, value in tool_args.items()
                            if key not in ("options", "sentence", "kind")
                        },
                    },
                    "options": [
                        {
                            "optionId": o["option_id"],
                            "name": o["name"],
                            "kind": o["kind"],
                        }
                        for o in self.options
                    ],
                    "expiresAt": expires.isoformat(),
                }
            }
        }
        loop = asyncio.get_running_loop()
        self.answer = loop.create_future()
        self.worker.waiting[self.task_id] = self
        await self.worker.storage.update_task(self.task_id, state="input-required")
        await self.worker.publish_status(
            self.task_id, self.context_id, "input-required", asked
        )
        try:
            option_id = await asyncio.wait_for(self.answer, self.timeout)
        except asyncio.TimeoutError:
            raise ToolApprovalTimeoutError(
                f"{tool_name}: no answer on task {self.task_id} within {int(self.timeout)} s"
            ) from None
        finally:
            self.worker.waiting.pop(self.task_id, None)
            self.answer = None
        await self.worker.storage.update_task(self.task_id, state="working")
        await self.worker.publish_status(self.task_id, self.context_id, "working")
        option = next(o for o in self.options if o["option_id"] == option_id)
        if option["kind"].startswith("reject"):
            raise ToolApprovalRejectedError(
                tool_name, f"the caller chose {option['name']}"
            )
        return {"status": "approved", "id": None, "option_id": option_id}

    def answered(self, message: Any) -> bool:
        """
        Take the caller's message as the answer; ``False`` when it chooses no option.

        Parameters
        ----------
        message : Message
            The message sent on the waiting task.

        Returns
        -------
        bool
            Whether the waiting run was answered.
        """
        option_id = chosen_option(message, self.options)
        if option_id is None or self.answer is None or self.answer.done():
            return False
        self.answer.set_result(option_id)
        return True


@dataclass
class A2AWorker(_FastA2AWorker):
    """Runs a `BaseAgent` for the tasks a FastA2A app receives, streaming as it goes.

    The A2A server side of agent-runtimes. Where fasta2a's pydantic-ai bridge
    runs a bare ``pydantic_ai.Agent``, this worker runs the agent *adapter* — so
    MCP servers, skills, codemode, guardrails and approvals apply exactly as
    they do over the other transports — and publishes the run as it happens:
    each text delta as a chunk of the answer's artifact, each tool call and
    result as a ``working`` status carrying a data part, the whole answer as
    the last chunk. It then publishes the final state itself and ends the
    stream, the status carrying what the run spent (``datalayer.usage``); when
    the run raises, the reason rides on the ``failed`` status so the client
    learns it.

    The agent's ``AgentContext.metadata["a2a"]`` names the task, the context and
    the activated extensions, for tools that want to know.
    """

    agent: "BaseAgent" = None  # type: ignore[assignment]
    cancellation: TaskCancellation | None = None
    #: The id the agent is served under, which its usage and cost are counted
    #: under: what a task spent is on the status that ends it (O2-10).
    agent_id: str | None = None
    #: The media types its answers come in, as its card declares them: a
    #: caller that accepts one besides words gets it as an artifact.
    output_modes: tuple[str, ...] = ()
    #: The tasks waiting on a caller's answer to an approval (SH-15), by id.
    waiting: dict[str, A2AApprovals] = field(default_factory=dict)

    @asynccontextmanager
    async def run(self) -> AsyncIterator[None]:
        """Run the worker: every task it is given runs at once, beside the others.

        fasta2a's worker awaits each task before it takes the next, so a
        request sent while another task works waited for it — a minute for a
        report — before its stream said anything, and one its caller gave up
        on meanwhile stayed submitted for ever.
        """
        import anyio

        async with anyio.create_task_group() as tasks:

            async def loop() -> None:
                async for operation in self.broker.receive_task_operations():
                    tasks.start_soon(self._handle_task_operation, operation)

            tasks.start_soon(loop)
            yield
            tasks.cancel_scope.cancel()

    async def run_task(self, params: "TaskSendParams") -> None:
        task = await self.storage.load_task(params["id"])
        if task is None:
            raise ValueError(f"Task {params['id']} not found")
        task_id = task["id"]
        context_id = task["context_id"]
        # A message on a task waiting for an approval answers it (SH-15):
        # the run that asked goes on under the same task; nothing new starts.
        waiting = self.waiting.get(task_id)
        if waiting is not None:
            if not waiting.answered(params["message"]):
                await self.storage.update_task(task_id, state="input-required")
                told = _agent_message(
                    context_id,
                    Part(
                        text=(
                            "That chooses none of the options: answer with "
                            + ", ".join(
                                f"{o['name']} ({o['option_id']})"
                                for o in waiting.options
                            )
                            + "."
                        )
                    ),
                )
                await self.publish_status(task_id, context_id, "input-required", told)
            return
        from ..context.delegation import merged_meta, spent_meta
        from ..context.usage import TurnSpend

        turn = TurnSpend.begin(self.agent_id)
        try:
            await self._run(task_id, context_id, params, turn)
        except Exception as exc:
            # fasta2a marks the task failed and ends the stream, but says
            # nothing about why. Log it, and put the reason on the failed
            # status; closing here keeps the base's own failed status from
            # following it.
            # Said, and logged, with any credential withheld (R-19).
            logger.error(
                "A2A task %s for agent %s failed: %s",
                task_id,
                self.agent.name,
                redact("".join(traceback.format_exception(exc))),
            )
            from ..context.delegation import refusal_meta
            from ..guardrails.model_budget import ModelBudgetExceeded

            await self.storage.update_task(task_id, state="failed")
            message = _agent_message(
                context_id, Part(text=redact(f"{type(exc).__name__}: {exc}"))
            )
            # Which limit of the budget the delegation set stopped the run,
            # where the delegation put the budget (O1-07), and what it spent.
            ended = merged_meta(
                refusal_meta(exc.reached)
                if isinstance(exc, ModelBudgetExceeded)
                else None,
                spent_meta(turn.settle()),
            )
            if ended:
                message["metadata"] = ended
            await self.publish_status(task_id, context_id, "failed", message)
            await self.broker.event_bus.close(task_id)
            raise

    async def _run(
        self,
        task_id: str,
        context_id: str,
        params: "TaskSendParams",
        turn: "TurnSpend",
    ) -> None:
        from ..apps.visitors import (
            enter_visitor_run,
            leave_visitor_run,
            visitor_of_a2a,
        )
        from ..output.formats import (
            RunOutputs,
            accepted_formats,
            enter_run_outputs,
            leave_run_outputs,
        )

        cancel = self.cancellation.register(task_id) if self.cancellation else None
        # A visitor's run, as the application's gate marked it: it only reads,
        # whatever its rules say (R-30).
        visiting = enter_visitor_run(visitor_of_a2a(params["message"].get("metadata")))
        # A turn asked by a personal agent through the company service: its
        # declared operations are proposed, or performed once confirmed
        # (B-04).
        from ..apps.pap_company import enter_pap_turn, leave_pap_turn, pap_turn_of

        pap_turn = enter_pap_turn(pap_turn_of(params["message"].get("metadata")))
        # What it may give besides words: what its card declares and the
        # caller accepts. Its output tools are offered for those only.
        outputs = RunOutputs(
            accepted=accepted_formats(
                self.output_modes, params.get("accepted_output_modes")
            )
        )
        composing = enter_run_outputs(outputs)
        try:
            await self._stream_run(task_id, context_id, params, cancel, turn, outputs)
        finally:
            leave_run_outputs(composing)
            leave_pap_turn(pap_turn)
            leave_visitor_run(visiting)
            if self.cancellation:
                self.cancellation.unregister(task_id)

    async def _stream_run(
        self,
        task_id: str,
        context_id: str,
        params: "TaskSendParams",
        cancel: "asyncio.Event | None",
        turn: "TurnSpend",
        outputs: "RunOutputs",
    ) -> None:
        from ..output.formats import artifacts_of, outputs_instructions, refused_action

        await self.storage.update_task(task_id, state="working")
        await self.publish_status(task_id, context_id, "working")

        history: A2AContext = list(await self.storage.load_context(context_id) or [])
        incoming = params["message"]
        # The request, and what this run may give besides words: the agent
        # is told of a format only when its caller accepts it.
        prompt = a2a_message_text(incoming) + outputs_instructions(outputs)

        from ..adapters.base import AgentContext
        from ..checkpoints.protocol_state import ProtocolStateCheckpointStore
        from ..context.delegation import (
            DELEGATED_CREDENTIAL,
            CredentialLost,
            checkpoint_of,
            close_steering,
            delegated_budget,
            enter_execution,
            execution_of,
            forget_pause,
            merged_meta,
            open_steering,
            pause_requested,
            paused_meta,
            release,
            spent_meta,
            was_delegated,
        )
        from ..context.identities import set_request_user_jwt

        meta = incoming.get("metadata")
        # A message said and heard (its audio by `HearA2AAudio`, or by the
        # client itself): marked spoken for the run and the record (VO-27, VO-28).
        from ..voice import hear, spoken_of, voice_of_agent

        hear(spoken_of(meta.get("voice")) if isinstance(meta, dict) else None)
        # The voice of an agent whose answers may be heard, said at the start
        # in the status message's metadata, as AG-UI's `voice.settings` (VO-36).
        voice = voice_of_agent(self.agent)
        if voice:
            await self.publish_status(
                task_id,
                context_id,
                "working",
                voice_settings_message(context_id, voice),
            )
        # The model budget the delegation set on this run, when it set one:
        # the adapter applies it as the run's usage limits (O1-07).
        budget = delegated_budget(meta)
        # The execution's token, taken out of the message when the task was
        # submitted: the run's identity, which its approvals, its telemetry and
        # its Datalayer MCP toolset use instead of the process's (O1-17).
        credential = release(task_id)
        if credential is None and was_delegated(meta):
            # Owed by a process that has since restarted, and the credential
            # went with it. Run as the runtime instead and the worker reaches
            # whatever the runtime's key does; fail, and the execution retries
            # with a token of its own.
            raise CredentialLost(
                "The execution's credential did not survive a restart of this runtime, "
                "so the run is not started without it."
            )
        if credential:
            set_request_user_jwt(credential)
        from ..apps.pap_company import current_pap_turn, perform_prompt, redeem

        company_turn = current_pap_turn()
        if company_turn is not None and company_turn.ticket:
            # What the person confirmed, as the company service recorded it:
            # the run makes that call, with those terms, and nothing else.
            prompt = perform_prompt(await redeem(company_turn, credential or ""))
        from ..apps.pap_company import asked_for_said

        # Asked of its company or its PACT business: which personal agent asks,
        # for whom and with what the person granted, as ai-agents marked it
        # (PR-13, B-04).
        asked_for = asked_for_said(meta)
        if asked_for:
            prompt = f"{asked_for}\n\n{prompt}"
        # The execution this run is for, whose checkpoints it keeps, and the
        # checkpoint it resumes from when it was paused (O2-05).
        execution_id = execution_of(meta)
        # On the run, where its tools read it: an orchestrated run asks the
        # control plane for its children rather than taking them (O2-06).
        enter_execution(meta)
        conversation = self.build_message_history(history)
        resumed_from = checkpoint_of(meta)
        if resumed_from:
            checkpoint = (
                await ProtocolStateCheckpointStore(execution_id).get(resumed_from)
                if execution_id
                else None
            )
            if checkpoint is None:
                raise RuntimeError(
                    f"Checkpoint '{resumed_from}' of execution '{execution_id}' is not kept by "
                    "this runtime, so the run cannot resume from it."
                )
            conversation = [dict(message) for message in checkpoint.messages]
        # A team seat works inside an apps session (MH-38): the task is a
        # turn of the seat's session — opened at its first task, resumed at
        # the next from the uid the control plane hands it — and the
        # session's conversation is the run's history. The session's uid is
        # the adapter's session: a harness keeps its own session per (uid,
        # agent), loaded again on the next task (MH-04).
        from ..orchestration.seat_sessions import SeatRefused, seat_run

        try:
            seat = await seat_run(self.agent, self.agent_id, meta, credential, prompt)
        except SeatRefused as seat_refused:
            raise RuntimeError(str(seat_refused)) from None
        if seat is not None:
            conversation = seat.history()
        context = AgentContext(
            session_id=seat.uid if seat is not None else context_id,
            conversation_history=conversation,
            metadata={
                "a2a": {
                    "task_id": task_id,
                    "context_id": context_id,
                    "activated_extensions": activated_extensions_of(params),
                },
                **({"budget": budget} if budget else {}),
                **({"user_token": credential} if credential else {}),
                # Said apart, so a harness lends its MCP with it (SH-33).
                **({DELEGATED_CREDENTIAL: credential} if credential else {}),
                # What is steered into this task reaches its model within the turn.
                "steer_run": task_id,
                # An approval a harness asks for is raised on this task as
                # `input-required`, and answered on it (SH-15).
                "approvals": A2AApprovals(
                    self,
                    task_id,
                    context_id,
                    timeout=(
                        DELEGATED_APPROVAL_TIMEOUT
                        if was_delegated(meta)
                        else APPROVAL_TIMEOUT
                    ),
                ),
            },
        )

        artifact_id = str(uuid.uuid4())
        text = ""
        final_output: str | None = None
        canceled = False
        # A harness's plan, one artifact replaced as it progresses, and its
        # diffs, one artifact per file; reasoning is never an
        # artifact: a `thought` event is not published at all.
        plan_id = f"plan-{task_id}"
        plan: Artifact | None = None
        diffs: dict[str, Artifact] = {}
        # A button of an answer's surface that would do more than read, pressed
        # by a visitor, is refused in a sentence: no model runs (H-03).
        refused = refused_action(incoming)
        # `say_aloud`'s lines, by call: said once the call has answered (VO-36).
        say_lines: dict[str, str] = {}
        open_steering(task_id)
        try:
            async for event in (
                _said(refused) if refused else self.agent.stream(prompt, context)
            ):
                if cancel is not None and cancel.is_set():
                    # Leaving the loop closes the adapter's stream, which stops
                    # the run underneath it.
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
                            artifact_id=artifact_id,
                            name="result",
                            parts=[Part(text=delta)],
                        ),
                        append=True,
                        last_chunk=False,
                    )
                elif event.type == "tool_call":
                    called = _tool_call_payload(event.data)
                    if seat is not None:
                        seat.tool_called(called)
                    if called.get("name") == SAY_ALOUD_TOOL and isinstance(
                        called.get("arguments"), dict
                    ):
                        say_lines[str(called.get("id"))] = str(
                            called["arguments"].get("line") or ""
                        )
                    said = _agent_message(
                        context_id,
                        Part(data={"tool_call": called}),
                    )
                    # A harness's tool call says its kind, title and status in
                    # the status message's metadata.
                    titled = _harness_call_meta(event.data)
                    if titled:
                        said["metadata"] = titled
                    await self.publish_status(task_id, context_id, "working", said)
                elif event.type == "tool_result":
                    answered = _tool_result_payload(event.data)
                    if seat is not None:
                        seat.tool_answered(answered)
                    said = _agent_message(
                        context_id,
                        Part(data={"tool_result": answered}),
                    )
                    titled = _harness_call_meta(event.data)
                    if titled:
                        said["metadata"] = titled
                    await self.publish_status(task_id, context_id, "working", said)
                    line = say_lines.pop(str(answered.get("id")), "")
                    if line and voice and not answered.get("error"):
                        await self.publish_status(
                            task_id,
                            context_id,
                            "working",
                            voice_say_message(context_id, line, voice),
                        )
                    for shown in _displays_of(event.data):
                        if shown.get("display") != "diff":
                            continue
                        path = str(shown.get("path") or "")
                        kept = diffs.get(path)
                        changed = diff_artifact(
                            kept["artifact_id"] if kept else f"diff-{uuid.uuid4()}",
                            path,
                            shown.get("old_text"),
                            str(shown.get("new_text") or ""),
                        )
                        diffs[path] = changed
                        await self.publish_artifact(task_id, context_id, changed)
                elif event.type == "plan":
                    steps = (
                        list(event.data.get("steps") or [])
                        if isinstance(event.data, dict)
                        else []
                    )
                    plan = plan_artifact(plan_id, steps)
                    await self.publish_artifact(task_id, context_id, plan)
                elif event.type == "output":
                    final_output = str(event.data) if event.data is not None else None
                elif event.type == "done":
                    turn.reported(
                        event.data.get("usage")
                        if isinstance(event.data, dict)
                        else None
                    )
                elif event.type == "error":
                    from ..guardrails.model_budget import (
                        ModelBudgetExceeded,
                        ModelBudgetReached,
                    )

                    if isinstance(event.data, ModelBudgetReached):
                        raise ModelBudgetExceeded(event.data)
                    raise RuntimeError(str(event.data))
        except BaseException as stopped_by:
            if seat is not None:
                await seat.failed(redact(str(stopped_by) or type(stopped_by).__name__))
            raise
        finally:
            close_steering(task_id)

        if canceled and pause_requested(task_id):
            forget_pause(task_id)
            if execution_id:
                # Paused, not cancelled: the conversation so far is kept where a
                # resume finds it, in whichever process of this runtime (O2-05).
                messages = [*conversation, {"role": "user", "content": prompt}]
                if text:
                    messages.append({"role": "assistant", "content": text})
                checkpoint = await ProtocolStateCheckpointStore(
                    execution_id
                ).create_checkpoint(
                    "paused",
                    turn=len(messages),
                    messages=messages,
                    metadata={"task_id": task_id},
                )
                logger.info(
                    "A2A task %s for agent %s paused at %s",
                    task_id,
                    self.agent.name,
                    checkpoint.id,
                )
                await self.storage.update_task(task_id, state="canceled")
                stopped = _agent_message(context_id, Part(text="Paused."))
                kept = merged_meta(
                    paused_meta(checkpoint.id),
                    spent_meta(turn.settle()),
                    await seat.failed("Paused.") if seat is not None else None,
                )
                if kept:
                    stopped["metadata"] = kept
                await self.publish_status(task_id, context_id, "canceled", stopped)
                await self.broker.event_bus.close(task_id)
                return
            logger.warning(
                "A2A task %s was asked to pause and names no execution to keep a checkpoint "
                "under; it is stopped instead",
                task_id,
            )

        if canceled:
            logger.info("A2A task %s for agent %s stopped", task_id, self.agent.name)
            await self.storage.update_task(task_id, state="canceled")
            halted = _agent_message(context_id, Part(text=STOPPED))
            spent = merged_meta(
                spent_meta(turn.settle()),
                await seat.failed(STOPPED) if seat is not None else None,
            )
            if spent:
                halted["metadata"] = spent
            await self.publish_status(task_id, context_id, "canceled", halted)
            await self.broker.event_bus.close(task_id)
            return

        output = text or final_output or ""
        reply = _agent_message(context_id, Part(text=output))
        await self.storage.update_context(context_id, [*history, incoming, reply])
        artifact = Artifact(
            artifact_id=artifact_id, name="result", parts=[Part(text=output)]
        )
        # What it composed besides words, each an artifact of its media type.
        from ..apps.pap_company import pap_artifacts

        composed = [
            *artifacts_of(outputs),
            *pap_artifacts(current_pap_turn()),
            *([plan] if plan is not None else []),
            *diffs.values(),
        ]
        await self.storage.update_task(
            task_id,
            state="completed",
            new_artifacts=[artifact, *composed],
            new_messages=[reply],
        )
        # The whole result once more, as the last chunk: a client that does
        # not assemble chunks, or joined late, still gets the answer.
        await self.publish_artifact(task_id, context_id, artifact)
        for extra in composed:
            await self.publish_artifact(task_id, context_id, extra)
        # The `completed` status says what the run spent (O2-10), so it is sent
        # and the stream ended here rather than by the base, whose final status
        # carries no message.
        finished = _agent_message(context_id, Part(text=output))
        # The seat's session, answered to the control plane with what the
        # turn spent: kept on the run, handed to the seat's next task (MH-P05).
        spent = merged_meta(
            spent_meta(turn.settle()),
            await seat.answered(output) if seat is not None else None,
        )
        if spent:
            finished["metadata"] = spent
        await self.publish_status(task_id, context_id, "completed", finished)
        await self.broker.event_bus.close(task_id)

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


def _harness_call_meta(data: Any) -> dict[str, Any] | None:
    """A harness's ``{kind, title, status}`` for the status message's metadata; ``None`` for another agent's call."""
    fields = data if isinstance(data, dict) else {}
    if "kind" not in fields:
        return None
    return {
        "kind": str(fields.get("kind") or "other"),
        "title": str(fields.get("name") or fields.get("title") or ""),
        "status": str(fields.get("status") or ""),
    }


def _displays_of(data: Any) -> list[dict[str, Any]]:
    """The displays a harness's tool result carries (a diff, a terminal)."""
    shown = data.get("display") if isinstance(data, dict) else None
    return [item for item in (shown or []) if isinstance(item, dict)]


async def _said(text: str) -> AsyncIterator[Any]:
    """An answer given in words without a model: one text event.

    Yields
    ------
    Any
        The one text event.
    """
    from types import SimpleNamespace

    yield SimpleNamespace(type="text", data=text)


#: The tool an agent whose answers may be heard says a short line with (VO-35).
SAY_ALOUD_TOOL = "say_aloud"


def voice_settings_message(context_id: str, settings: dict[str, Any]) -> "Message":
    """
    The voice of an agent whose answers may be heard, as an A2A status message (VO-36).

    AG-UI says it as the ``voice.settings`` custom event; A2A in the message's
    ``metadata.voice.settings``, its one data part saying the same.

    Parameters
    ----------
    context_id : str
        The conversation.
    settings : dict[str, Any]
        The voice, resolved against the catalogue (``voice_of_agent``).

    Returns
    -------
    Message
        The agent's message.
    """
    said = {"settings": dict(settings)}
    message = _agent_message(context_id, Part(data={"voice": said}))
    message["metadata"] = {"voice": said}
    return message


def voice_say_message(
    context_id: str, line: str, settings: dict[str, Any]
) -> "Message":
    """
    A line the agent says aloud (``say_aloud``) as an A2A status message (VO-36).

    AG-UI says it as the ``voice.say`` custom event; A2A as the line in a
    text part, captioned, with ``metadata.voice.say`` naming the voice and
    language it is said in.

    Parameters
    ----------
    context_id : str
        The conversation.
    line : str
        The line, at most 200 characters.
    settings : dict[str, Any]
        The agent's voice.

    Returns
    -------
    Message
        The agent's message.
    """
    from ..voice import say_aloud_event

    said = dict(say_aloud_event(line, settings).value)
    message = _agent_message(context_id, Part(text=said["text"]))
    message["metadata"] = {"voice": {"say": said}}
    return message


def _agent_message(context_id: str, part: "Part") -> "Message":
    return Message(
        role="agent",
        parts=[part],
        message_id=str(uuid.uuid4()),
        context_id=context_id,
    )
