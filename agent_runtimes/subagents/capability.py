# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Subagent delegation as a pydantic-ai capability.

The capability contributes a single ``delegate_task`` tool to the parent agent.
When the model calls it, the named subagent runs in an isolated child run and
its final output is returned to the parent. Usage (tokens/requests) is forwarded
to the parent run so budget limits stay accurate across delegation.

This is intentionally simpler than the ``pydantic-ai-harness`` subagents
capability: no disk-loaded agent folders, no model menus. It covers the common
orchestrator/specialist pattern used by the examples.

A subagent may also be a *separate* agent reached over A2A (``a2a`` on its
definition): the same tool, the same events on the parent's stream, but the
run happens in another process — launched beside this server or on a
Datalayer runtime — and the events say so with ``transport: "a2a"``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

from .a2a import (
    A2ARemoteAgent,
    A2ARemoteTarget,
    ensure_remote_agent,
    relay_a2a_task,
    spec_id_of,
)

if TYPE_CHECKING:
    from pydantic_ai.models import Model

logger = logging.getLogger(__name__)

_GENERAL_PURPOSE_INSTRUCTIONS = (
    "You are a capable general-purpose assistant. Complete the delegated task "
    "thoroughly and return a clear, self-contained result."
)


def _resolve_referenced_spec(ref: str) -> Any:
    """The agentspec a subagent refers to, or ``None``.

    Looked up lazily so importing this module does not pull the whole spec
    catalogue in, and tolerant of a missing one: a referenced specialist that is
    not installed is a warning about that subagent, not a dead parent agent.
    """
    try:
        from agent_runtimes.specs.agents.agents import get_agent_spec
    except Exception:  # noqa: BLE001  # pragma: no cover - catalogue absent
        return None
    try:
        return get_agent_spec(ref)
    except Exception:  # noqa: BLE001
        return None


def _remote_definition(sa: Any, a2a: Any) -> "SubagentDefinition | None":
    """The definition for a subagent reached over A2A, or ``None`` if unusable.

    It needs somewhere to reach: a ``url`` an agent already answers on, or a
    ``ref`` naming the agentspec to launch one from. The ref is not resolved
    here — the launching server resolves it, which for a cloud launch is not
    this one — only used for a description when the subagent gives none.
    """
    url = getattr(a2a, "url", None)
    ref = getattr(sa, "ref", None)
    spec_id = spec_id_of(str(ref)) if ref else None
    if not url and not spec_id:
        logger.warning(
            "A2A subagent %r names neither a url nor a ref to launch; skipping",
            sa.name,
        )
        return None
    description = getattr(sa, "description", "") or ""
    if not description and ref:
        referenced = _resolve_referenced_spec(str(ref))
        if referenced is not None:
            description = getattr(referenced, "description", "") or ""
    return SubagentDefinition(
        name=sa.name,
        description=description,
        a2a=A2ARemoteTarget(
            url=url,
            spec_id=spec_id,
            launch=getattr(a2a, "launch", None) or "auto",
            environment=getattr(a2a, "environment", None),
        ),
    )


def _build_subagent_capabilities(
    model: str | Model,
    *,
    parent: "SubagentsCapability | None" = None,
    subagent_name: str = "",
) -> list[Any]:
    """Build the capabilities attached to a subagent's inner Agent.

    Adds history compaction budgeted from the subagent model's ``tokens_limit``
    so a delegated run's history stays under the model's limit independently of
    the parent. Skips it when the model is an instance (no spec id to resolve).

    Also decides whether this subagent may delegate further. It may, if the
    spec allows the depth *and* the specialists it would be offered are not
    already on the stack above it — an agent that can delegate to itself is a
    loop with a token budget attached.
    """
    capabilities: list[Any] = []

    if isinstance(model, str):
        from ..compaction import build_compaction_capability

        compaction = build_compaction_capability(model)
        if compaction is not None:
            capabilities.append(compaction)

    if parent is not None and parent.depth + 1 < parent.max_nesting_depth:
        stack = (*parent.chain, subagent_name)
        # The cycle guard: a specialist already on the stack is not offered
        # again, so the loop cannot form rather than being caught mid-run.
        onward = [
            definition
            for definition in parent.subagents
            if definition.name not in stack
        ]
        if onward:
            capabilities.append(
                SubagentsCapability(
                    subagents=onward,
                    default_model=parent.default_model,
                    include_general_purpose=False,
                    agent_id=parent.agent_id,
                    max_nesting_depth=parent.max_nesting_depth,
                    depth=parent.depth + 1,
                    chain=stack,
                )
            )

    return capabilities


@dataclass(frozen=True)
class SubagentDefinition:
    """A single delegatable subagent.

    Parameters
    ----------
    name : str
        Unique identifier the parent uses to route a task.
    description : str
        Short capability summary shown to the parent model.
    instructions : str
        System instructions for the subagent. Empty for one reached over A2A,
        whose instructions are its own.
    model : str | Model | None
        Optional model override; falls back to the capability default model.
    a2a : A2ARemoteTarget | None
        Set when the subagent is a separate agent reached over A2A: where it
        is, or how to launch it. Nothing is built for it here; it is resolved
        on the first delegation.
    """

    name: str
    description: str
    instructions: str = ""
    model: str | Model | None = None
    a2a: A2ARemoteTarget | None = None


@dataclass
class SubagentsCapability(AbstractCapability[Any]):
    """Delegate scoped tasks to specialist subagents.

    Parameters
    ----------
    subagents : list[SubagentDefinition]
        The specialist subagents available for delegation.
    default_model : str | Model | None
        Model used for subagents that do not define their own.
    include_general_purpose : bool
        When True, add a ``general-purpose`` fallback subagent for tasks that do
        not match a specialist.
    tool_name : str
        Name of the delegation tool exposed to the parent model.
    tool_retries : int
        Retry budget for the delegation tool.
    max_nesting_depth : int
        How far delegation may go. ``0`` — the default — means a subagent
        cannot delegate further, which is the safe default: an agent calling an
        agent calling an agent spends a budget nobody watched being spent.
    depth : int
        How deep this capability already is. Set by the reactor of capabilities
        rather than by a spec.
    chain : tuple[str, ...]
        The delegation stack above this capability, newest last. It is the cycle
        guard — a specialist already on the stack is not offered again — and it
        is what makes a nested delegation legible in the transcript.
    """

    subagents: list[SubagentDefinition] = field(default_factory=list)
    default_model: str | Model | None = None
    include_general_purpose: bool = True
    tool_name: str = "delegate_task"
    tool_retries: int = 1
    agent_id: str | None = None
    max_nesting_depth: int = 0
    depth: int = 0
    chain: tuple[str, ...] = ()
    _agents: dict[str, Agent[Any, str]] = field(
        default_factory=dict, init=False, repr=False
    )
    _descriptions: dict[str, str] = field(default_factory=dict, init=False, repr=False)
    # The subagents reached over A2A, the agents they resolved to once
    # delegated to, and the A2A context each conversation with one runs in.
    _remotes: dict[str, SubagentDefinition] = field(
        default_factory=dict, init=False, repr=False
    )
    _remote_agents: dict[str, A2ARemoteAgent] = field(
        default_factory=dict, init=False, repr=False
    )
    _a2a_contexts: dict[str, str] = field(default_factory=dict, init=False, repr=False)

    def __post_init__(self) -> None:
        definitions = list(self.subagents)
        if self.include_general_purpose and not any(
            d.name == "general-purpose" for d in definitions
        ):
            definitions.append(
                SubagentDefinition(
                    name="general-purpose",
                    description=(
                        "Fallback agent for tasks with no dedicated specialist."
                    ),
                    instructions=_GENERAL_PURPOSE_INSTRUCTIONS,
                )
            )

        for definition in definitions:
            if definition.name in self._agents or definition.name in self._remotes:
                raise ValueError(f"Duplicate subagent name: {definition.name!r}")
            if definition.a2a is not None:
                # A separate agent, spoken to over A2A: nothing to build here.
                self._remotes[definition.name] = definition
                self._descriptions[definition.name] = definition.description
                continue
            model = definition.model or self.default_model
            if model is None:
                logger.warning(
                    "Subagent %r has no model and no default_model; skipping",
                    definition.name,
                )
                continue
            self._agents[definition.name] = Agent(
                model,
                name=definition.name,
                instructions=definition.instructions,
                capabilities=_build_subagent_capabilities(
                    model, parent=self, subagent_name=definition.name
                ),
            )
            self._descriptions[definition.name] = definition.description

    def get_instructions(self) -> str | None:
        if not self._agents and not self._remotes:
            return None
        lines = [
            "You can delegate scoped tasks to specialist subagents with the "
            f"`{self.tool_name}` tool. Available subagents:",
        ]
        for name in sorted(self._descriptions):
            line = f"- {name}: {self._descriptions.get(name, '')}".rstrip()
            if name in self._remotes:
                line += " (a separate agent, reached over A2A)"
            lines.append(line)
        lines.append(
            "Delegate a single, well-specified task at a time, then synthesize "
            "the subagent results into your own final answer."
        )
        return "\n".join(lines)

    def get_toolset(self) -> AgentToolset[Any] | None:
        if not self._agents and not self._remotes:
            return None

        toolset: FunctionToolset[Any] = FunctionToolset()
        available = ", ".join(sorted(self._descriptions))

        async def delegate_task(
            ctx: RunContext[Any], subagent_name: str, task: str
        ) -> str:
            """Delegate a task to a named subagent and return its final answer.

            Parameters
            ----------
            subagent_name : str
                One of the available subagent names.
            task : str
                The self-contained task description for the subagent.
            """
            agent = self._agents.get(subagent_name)
            remote = self._remotes.get(subagent_name)
            if agent is None and remote is None:
                return (
                    f"Unknown subagent '{subagent_name}'. "
                    f"Available subagents: {available}."
                )
            tool_call_id = getattr(ctx, "tool_call_id", None)
            transport = self._transport_payload(subagent_name)
            self._emit_subagent_event(
                subagent_name, tool_call_id, "start", task=task, **transport
            )
            try:
                if remote is not None:
                    output = await self._run_remote_streaming(
                        remote, subagent_name, tool_call_id, task
                    )
                else:
                    output = await self._run_subagent_streaming(
                        agent, subagent_name, tool_call_id, task, ctx.usage
                    )
            except Exception as exc:  # noqa: BLE001 - surface to the model
                logger.exception("Subagent %r failed", subagent_name)
                self._emit_subagent_event(
                    subagent_name,
                    tool_call_id,
                    "error",
                    error=str(exc),
                    **self._transport_payload(subagent_name),
                )
                return f"Subagent '{subagent_name}' failed: {exc}"
            self._emit_subagent_event(
                subagent_name,
                tool_call_id,
                "end",
                output=output,
                **self._transport_payload(subagent_name),
            )
            return output

        toolset.add_function(
            delegate_task,
            name=self.tool_name,
            retries=self.tool_retries,
        )
        return toolset

    def _transport_payload(self, subagent_name: str) -> dict[str, Any]:
        """How the subagent is reached, said on every event about it."""
        definition = self._remotes.get(subagent_name)
        if definition is None or definition.a2a is None:
            return {}
        remote = self._remote_agents.get(subagent_name)
        if remote is not None:
            return remote.describe()
        return {"transport": "a2a", "launch": definition.a2a.launch}

    async def _run_remote_streaming(
        self,
        definition: SubagentDefinition,
        subagent_name: str,
        tool_call_id: str | None,
        task: str,
    ) -> str:
        """Run a delegation on a separate agent over A2A, republishing its stream.

        The agent is resolved — or launched — on the first delegation and kept
        for the next ones, and every delegation to it from this parent shares
        one A2A context, so the remote agent keeps the thread.
        """
        target = definition.a2a
        assert target is not None
        remote = self._remote_agents.get(subagent_name)
        if remote is None:
            self._emit_subagent_event(
                subagent_name,
                tool_call_id,
                "status",
                transport="a2a",
                launch=target.launch,
                state="launching",
            )
            remote = await ensure_remote_agent(
                subagent_name, definition.description, target
            )
            self._remote_agents[subagent_name] = remote
        self._emit_subagent_event(
            subagent_name, tool_call_id, "status", state="ready", **remote.describe()
        )
        context_id = self._a2a_contexts.setdefault(subagent_name, str(uuid.uuid4()))

        def emit(phase: str, **payload: Any) -> None:
            self._emit_subagent_event(
                subagent_name,
                tool_call_id,
                phase,
                transport="a2a",
                url=remote.url,
                **payload,
            )

        return await relay_a2a_task(remote, task, context_id=context_id, emit=emit)

    async def _run_subagent_streaming(
        self,
        agent: Agent[Any, str],
        subagent_name: str,
        tool_call_id: str | None,
        task: str,
        usage: Any,
    ) -> str:
        """Run a subagent while streaming its inner interactions as events.

        Iterates the subagent run node-by-node and republishes text, thinking,
        tool-call and tool-result activity on the parent agent's monitoring
        stream so the UI can display the subagent working in real time. Usage is
        forwarded to the parent run so budget limits stay accurate.
        """
        from pydantic_ai import Agent as _Agent
        from pydantic_ai.messages import (
            FunctionToolCallEvent,
            FunctionToolResultEvent,
            PartDeltaEvent,
            PartStartEvent,
            TextPart,
            TextPartDelta,
            ThinkingPart,
            ThinkingPartDelta,
        )

        async with agent.iter(task, usage=usage) as run:
            async for node in run:
                if _Agent.is_model_request_node(node):
                    async with node.stream(run.ctx) as request_stream:
                        async for event in request_stream:
                            if isinstance(event, PartStartEvent):
                                part = event.part
                                if isinstance(part, TextPart) and part.content:
                                    self._emit_subagent_event(
                                        subagent_name,
                                        tool_call_id,
                                        "text",
                                        text=part.content,
                                    )
                                elif isinstance(part, ThinkingPart) and part.content:
                                    self._emit_subagent_event(
                                        subagent_name,
                                        tool_call_id,
                                        "thinking",
                                        text=part.content,
                                    )
                            elif isinstance(event, PartDeltaEvent):
                                delta = event.delta
                                if (
                                    isinstance(delta, TextPartDelta)
                                    and delta.content_delta
                                ):
                                    self._emit_subagent_event(
                                        subagent_name,
                                        tool_call_id,
                                        "text",
                                        text=delta.content_delta,
                                    )
                                elif isinstance(delta, ThinkingPartDelta) and getattr(
                                    delta, "content_delta", None
                                ):
                                    self._emit_subagent_event(
                                        subagent_name,
                                        tool_call_id,
                                        "thinking",
                                        text=delta.content_delta,
                                    )
                elif _Agent.is_call_tools_node(node):
                    async with node.stream(run.ctx) as handle_stream:
                        async for event in handle_stream:
                            if isinstance(event, FunctionToolCallEvent):
                                part = event.part
                                self._emit_subagent_event(
                                    subagent_name,
                                    tool_call_id,
                                    "tool_call",
                                    toolName=getattr(part, "tool_name", ""),
                                    toolArgs=_stringify_tool_args(
                                        getattr(part, "args", None)
                                    ),
                                )
                            elif isinstance(event, FunctionToolResultEvent):
                                result = event.result
                                self._emit_subagent_event(
                                    subagent_name,
                                    tool_call_id,
                                    "tool_result",
                                    toolName=getattr(result, "tool_name", ""),
                                    result=_stringify_tool_result(
                                        getattr(result, "content", None)
                                    ),
                                )
        result = run.result
        return str(result.output) if result is not None else ""

    def _emit_subagent_event(
        self,
        subagent_name: str,
        tool_call_id: str | None,
        phase: str,
        **payload: Any,
    ) -> None:
        """Publish a subagent activity event on the parent monitoring stream.

        Failures are swallowed: streaming telemetry must never break the
        delegated run.
        """
        parent_agent_id = self.agent_id
        if not parent_agent_id:
            return
        try:
            from ..streams import AgentStreamMessage, enqueue_stream_message

            message = AgentStreamMessage.create(
                type="agent.subagent",
                payload={
                    "subagentName": subagent_name,
                    "toolCallId": tool_call_id,
                    "phase": phase,
                    # Who asked, and how deep. A nested delegation that looks
                    # like a top-level one leaves a reader unable to tell what
                    # spent their tokens.
                    "depth": self.depth,
                    "chain": [*self.chain, subagent_name],
                    **payload,
                },
                agent_id=parent_agent_id,
            )
            enqueue_stream_message(parent_agent_id, message)
        except Exception:  # noqa: BLE001 - telemetry must not break delegation
            logger.debug("Failed to emit subagent event", exc_info=True)


def _stringify_tool_args(args: Any) -> dict[str, Any]:
    """Coerce a tool-call arguments payload into a JSON-friendly dict."""
    if args is None:
        return {}
    if isinstance(args, dict):
        return args
    if isinstance(args, str):
        import json

        try:
            parsed = json.loads(args)
        except (ValueError, TypeError):
            return {"value": args}
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    return {"value": str(args)}


def _stringify_tool_result(content: Any) -> str:
    """Coerce a tool result payload into a short display string."""
    if content is None:
        return ""
    text = content if isinstance(content, str) else str(content)
    return text if len(text) <= 2000 else text[:2000] + "…"


def build_subagents_capability(
    subagents_config: Any, default_model: str | None, agent_id: str | None = None
) -> SubagentsCapability | None:
    """Build a ``SubagentsCapability`` from an Agentspec ``subagents`` config.

    Returns ``None`` when no subagents are defined so the caller can skip adding
    an empty capability. ``agent_id`` links streamed subagent activity to the
    parent agent's monitoring stream.
    """
    raw_subagents = list(getattr(subagents_config, "subagents", None) or [])
    definitions: list[SubagentDefinition] = []
    for sa in raw_subagents:
        instructions = sa.instructions
        model = getattr(sa, "model", None)

        # A subagent reached over A2A is a separate agent: it brings its own
        # instructions and model, so none are needed — or used — here.
        a2a = getattr(sa, "a2a", None)
        if a2a is not None:
            remote = _remote_definition(sa, a2a)
            if remote is not None:
                definitions.append(remote)
            continue

        # A subagent may *be* another agentspec rather than repeat it: the
        # specialist is defined once and referenced by every parent that wants
        # it, instead of having its instructions copy-pasted into each — which
        # is how they drift apart.
        ref = getattr(sa, "ref", None)
        if ref:
            referenced = _resolve_referenced_spec(str(ref))
            if referenced is None:
                logger.warning(
                    "Subagent %r references unknown agentspec %r; skipping",
                    sa.name,
                    ref,
                )
                continue
            instructions = instructions or getattr(referenced, "system_prompt", "") or ""
            model = model or getattr(referenced, "model", None)

        if not instructions:
            logger.warning(
                "Subagent %r has no instructions and no usable ref; skipping",
                sa.name,
            )
            continue

        definitions.append(
            SubagentDefinition(
                name=sa.name,
                description=sa.description,
                instructions=instructions,
                model=model,
            )
        )

    include_general_purpose = bool(
        getattr(subagents_config, "include_general_purpose", True)
    )
    if not definitions and not include_general_purpose:
        return None

    resolved_default = getattr(subagents_config, "default_model", None) or default_model
    return SubagentsCapability(
        subagents=definitions,
        default_model=resolved_default,
        include_general_purpose=include_general_purpose,
        agent_id=agent_id,
        # `0` unless a spec says otherwise: an agent calling an agent calling an
        # agent spends a budget nobody watched being spent.
        max_nesting_depth=int(getattr(subagents_config, "max_nesting_depth", 0) or 0),
    )
