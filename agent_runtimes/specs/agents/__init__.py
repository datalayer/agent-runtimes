# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
"""

from typing import Dict

from agent_runtimes.types import Agentspec

from .agents import AGENTSPECS as ROOT_AGENTS

# Merge all agent specs from subfolders
AGENTSPECS: Dict[str, Agentspec] = {}
AGENTSPECS.update(ROOT_AGENTS)


def get_agent_spec(agent_id: str) -> Agentspec | None:
    """Get an agent specification by ID."""
    spec = AGENTSPECS.get(agent_id)
    if spec is not None:
        return spec
    base, _, ver = agent_id.rpartition(":")
    if base and "." in ver:
        return AGENTSPECS.get(base)
    return None


def list_agentspecs(prefix: str | None = None) -> list[Agentspec]:
    """List all available agent specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    """
    specs = list(AGENTSPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs


__all__ = ["AGENTSPECS", "get_agent_spec", "list_agentspecs"]
