# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
"""

from typing import Dict

from agent_runtimes.types import AgentSpec

from .agents import AGENT_SPECS as ROOT_AGENTS

# Merge all agent specs from subfolders
AGENT_SPECS: Dict[str, AgentSpec] = {}
AGENT_SPECS.update(ROOT_AGENTS)


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    """Get an agent specification by ID."""
    spec = AGENT_SPECS.get(agent_id)
    if spec is not None:
        return spec
    base, _, ver = agent_id.rpartition(':')
    if base and '.' in ver:
        return AGENT_SPECS.get(base)
    return None


def list_agent_specs(prefix: str | None = None) -> list[AgentSpec]:
    """List all available agent specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    """
    specs = list(AGENT_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs

__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
