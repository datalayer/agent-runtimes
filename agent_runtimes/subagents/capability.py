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


@dataclass(frozen=True)
class SubagentDefinition:
    """A single delegatable subagent.

    Parameters
    ----------
    name:
        Unique identifier the parent uses to route a task.
    description:
        Short capability summary shown to the parent model.
    instructions:
        System instructions for the subagent.
    model:
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
    subagents:
        The specialist subagents available for delegation.
    default_model:
        Model used for subagents that do not define their own.
    include_general_purpose:
        When True, add a ``general-purpose`` fallback subagent for tasks that do
        not match a specialist.
    tool_name:
        Name of the delegation tool exposed to the parent model.
    tool_retries:
        Retry budget for the delegation tool.
    """

    subagents: list[SubagentDefinition] = field(default_factory=list)
    default_model: str | Model | None = None
    include_general_purpose: bool = True
    tool_name: str = "delegate_task"
    tool_retries: int = 1
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
            subagent_name:
                One of the available subagent names.
            task:
                The self-contained task description for the subagent.
            """
            agent = self._agents.get(subagent_name)
            if agent is None:
                return (
                    f"Unknown subagent '{subagent_name}'. "
                    f"Available subagents: {available}."
                )
            try:
                result = await agent.run(task, usage=ctx.usage)
            except Exception as exc:  # noqa: BLE001 - surface to the model
                logger.exception("Subagent %r failed", subagent_name)
                return f"Subagent '{subagent_name}' failed: {exc}"
            return str(result.output)

        toolset.add_function(
            delegate_task,
            name=self.tool_name,
            retries=self.tool_retries,
        )
        return toolset


def build_subagents_capability(
    subagents_config: Any, default_model: str | None
) -> SubagentsCapability | None:
    """Build a ``SubagentsCapability`` from an Agentspec ``subagents`` config.

    Returns ``None`` when no subagents are defined so the caller can skip adding
    an empty capability.
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
    )
