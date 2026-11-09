# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The skill a tool call loads, on its ``execute_tool`` span (AC-15).

AgentCore's skill evaluators (``Builtin.SkillSelectionAccuracy``,
``Builtin.SkillInstructionFollowing``) judge a skill invocation from three
attributes of the span of the tool that loaded it:

- ``invoked_skill`` — the skill's name;
- ``skill_content`` — what was loaded: its ``SKILL.md`` and what goes with it;
- ``available_skills`` — the skills the agent could have chosen, as JSON
  ``[{"name", "description"}]``.

An agent loads a skill with agent-skills' ``load_skill`` tool (the
``AgentSkillsToolset``, datalayer-skills and agent-skills alike).
:class:`SkillSpanCapability` runs inside pydantic-ai's tool span (the
instrumentation is the outermost capability) and writes them there. The
content follows the run's content capture: a visitor's turn carries the
skill's name and the choice, never its content.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterator, Optional

from opentelemetry import trace
from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

#: The tool that loads a skill.
LOAD_SKILL_TOOL = "load_skill"

#: The attributes AgentCore's skill evaluators read.
INVOKED_SKILL = "invoked_skill"
SKILL_CONTENT = "skill_content"
AVAILABLE_SKILLS = "available_skills"


def _toolsets_under(toolset: Any, seen: Optional[set[int]] = None) -> Iterator[Any]:
    """Walk a toolset and everything it wraps or combines."""
    seen = set() if seen is None else seen
    if toolset is None or id(toolset) in seen:
        return
    seen.add(id(toolset))
    yield toolset
    yield from _toolsets_under(getattr(toolset, "wrapped", None), seen)
    for inner in getattr(toolset, "toolsets", None) or ():
        yield from _toolsets_under(inner, seen)


def skills_of(ctx: RunContext[Any]) -> dict[str, Any]:
    """Return the skills the run's skills toolset discovered, by name.

    Parameters
    ----------
    ctx : RunContext
        The run's context.

    Returns
    -------
    dict
        The ``AgentSkill`` objects by name; empty when the run has no
        skills toolset.
    """
    manager = getattr(ctx, "tool_manager", None)
    if manager is None:
        return {}
    tool = (getattr(manager, "tools", None) or {}).get(LOAD_SKILL_TOOL)
    roots = [getattr(tool, "toolset", None), getattr(manager, "toolset", None)]
    for root in roots:
        for toolset in _toolsets_under(root):
            discovered = getattr(toolset, "_discovered_skills", None)
            if isinstance(discovered, dict):
                return dict(discovered)
    return {}


def skill_attributes(
    skill_name: str,
    result: Any,
    skills: dict[str, Any],
    *,
    include_content: bool,
) -> dict[str, Any]:
    """Make the span attributes of one skill load.

    Parameters
    ----------
    skill_name : str
        The name the tool was called with.
    result : Any
        What the tool answered: the skill's full content when it was found.
    skills : dict
        The skills the agent could choose, by name.
    include_content : bool
        Whether the span may carry the skill's content.

    Returns
    -------
    dict
        ``invoked_skill``, ``available_skills`` and, when the skill was
        found and content is captured, ``skill_content``.
    """
    attributes: dict[str, Any] = {
        INVOKED_SKILL: skill_name,
        AVAILABLE_SKILLS: json.dumps(
            [
                {
                    "name": name,
                    "description": str(getattr(skill, "description", "") or ""),
                }
                for name, skill in sorted(skills.items())
            ]
        ),
    }
    if include_content and skill_name in skills and isinstance(result, str):
        attributes[SKILL_CONTENT] = result
    return attributes


@dataclass
class SkillSpanCapability(AbstractCapability[Any]):
    """Write the skill a ``load_skill`` call loaded on its tool span."""

    async def wrap_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: Any,
        handler: Any,
    ) -> Any:
        """Run the tool; for ``load_skill``, set the skill's attributes on its span."""
        result = await handler(args)
        if tool_def.name != LOAD_SKILL_TOOL:
            return result
        span = trace.get_current_span()
        if not span.is_recording():
            return result
        named = args.get("skill_name") if isinstance(args, dict) else None
        span.set_attributes(
            skill_attributes(
                str(named or "").strip(),
                result,
                skills_of(ctx),
                include_content=bool(getattr(ctx, "trace_include_content", False)),
            )
        )
        return result


__all__ = [
    "AVAILABLE_SKILLS",
    "INVOKED_SKILL",
    "LOAD_SKILL_TOOL",
    "SKILL_CONTENT",
    "SkillSpanCapability",
    "skill_attributes",
    "skills_of",
]
