# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
"""

from typing import Dict

from agent_runtimes.types import AgentSpec

from .codeai import AGENT_SPECS as CODEAI_AGENTS
from .codemode_paper import AGENT_SPECS as CODEMODE_PAPER_AGENTS
from .datalayer_ai import AGENT_SPECS as DATALAYER_AI_AGENTS

# Merge all agent specs from subfolders
AGENT_SPECS: Dict[str, AgentSpec] = {}
AGENT_SPECS.update(CODEAI_AGENTS)
AGENT_SPECS.update(CODEMODE_PAPER_AGENTS)
AGENT_SPECS.update(DATALAYER_AI_AGENTS)


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    """Get an agent specification by ID."""
    return AGENT_SPECS.get(agent_id)


def list_agent_specs(prefix: str | None = None) -> list[AgentSpec]:
    """
    List all available agent specifications.

    Parameters
    ----------
    prefix : str or None
        If provided, only return specs whose ID starts with this prefix.
    """
    specs = list(AGENT_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs


__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
