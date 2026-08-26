# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Subagent delegation as a pydantic-ai capability.

The capability contributes a single ``delegate_task`` tool to the parent agent.
When the model calls it, the named subagent runs in an isolated child run and
its final output is returned to the parent. Usage (tokens/requests) is forwarded
to the parent run so budget limits stay accurate across delegation.

This is intentionally simpler than the ``pydantic-ai-harness`` subagents
capability: no disk-loaded agent folders, no model menus, no nested delegation.
It covers the common orchestrator/specialist pattern used by the examples.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

if TYPE_CHECKING:
    from pydantic_ai.models import Model

logger = logging.getLogger(__name__)

_GENERAL_PURPOSE_INSTRUCTIONS = (
    "You are a capable general-purpose assistant. Complete the delegated task "
    "thoroughly and return a clear, self-contained result."
)


def _build_subagent_capabilities(model: str | Model) -> list[Any]:
    """Build the capabilities attached to a subagent's inner Agent.

    Adds history compaction budgeted from the subagent model's ``tokens_limit``
    so a delegated run's history stays under the model's limit independently of
    the parent. Skips it when the model is an instance (no spec id to resolve).
    """
    if not isinstance(model, str):
        return []
    from ..compaction import build_compaction_capability

    capability = build_compaction_capability(model)
    return [capability] if capability is not None else []


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
        System instructions for the subagent.
    model : str | Model | None
        Optional model override; falls back to the capability default model.
    """

    name: str
    description: str
    instructions: str
    model: str | Model | None = None


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
    """

    subagents: list[SubagentDefinition] = field(default_factory=list)
    default_model: str | Model | None = None
    include_general_purpose: bool = True
    tool_name: str = "delegate_task"
    tool_retries: int = 1
    agent_id: str | None = None
    _agents: dict[str, Agent[Any, str]] = field(
        default_factory=dict, init=False, repr=False
    )
    _descriptions: dict[str, str] = field(default_factory=dict, init=False, repr=False)

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
            if definition.name in self._agents:
                raise ValueError(f"Duplicate subagent name: {definition.name!r}")
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
                capabilities=_build_subagent_capabilities(model),
            )
            self._descriptions[definition.name] = definition.description

    def get_instructions(self) -> str | None:
        if not self._agents:
            return None
        lines = [
            "You can delegate scoped tasks to specialist subagents with the "
            f"`{self.tool_name}` tool. Available subagents:",
        ]
        for name in sorted(self._agents):
            lines.append(f"- {name}: {self._descriptions.get(name, '')}".rstrip())
        lines.append(
            "Delegate a single, well-specified task at a time, then synthesize "
            "the subagent results into your own final answer."
        )
        return "\n".join(lines)

    def get_toolset(self) -> AgentToolset[Any] | None:
        if not self._agents:
            return None

        toolset: FunctionToolset[Any] = FunctionToolset()
        available = ", ".join(sorted(self._agents))

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
            if agent is None:
                return (
                    f"Unknown subagent '{subagent_name}'. "
                    f"Available subagents: {available}."
                )
            tool_call_id = getattr(ctx, "tool_call_id", None)
            self._emit_subagent_event(subagent_name, tool_call_id, "start", task=task)
            try:
                output = await self._run_subagent_streaming(
                    agent, subagent_name, tool_call_id, task, ctx.usage
                )
            except Exception as exc:  # noqa: BLE001 - surface to the model
                logger.exception("Subagent %r failed", subagent_name)
                self._emit_subagent_event(
                    subagent_name, tool_call_id, "error", error=str(exc)
                )
                return f"Subagent '{subagent_name}' failed: {exc}"
            self._emit_subagent_event(subagent_name, tool_call_id, "end", output=output)
            return output

        toolset.add_function(
            delegate_task,
            name=self.tool_name,
            retries=self.tool_retries,
        )
        return toolset

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
        definitions.append(
            SubagentDefinition(
                name=sa.name,
                description=sa.description,
                instructions=sa.instructions,
                model=getattr(sa, "model", None),
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
    )
