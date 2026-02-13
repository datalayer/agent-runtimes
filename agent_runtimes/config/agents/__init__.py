# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
"""

from typing import Dict

from agent_runtimes.types import AgentSpec

from .code_ai import AGENT_SPECS as CODE_AI_AGENTS
from .codemode_paper import AGENT_SPECS as CODEMODE_PAPER_AGENTS
from .datalayer_ai import AGENT_SPECS as DATALAYER_AI_AGENTS

# Merge all agent specs from subfolders
AGENT_SPECS: Dict[str, AgentSpec] = {}
AGENT_SPECS.update(CODE_AI_AGENTS)
AGENT_SPECS.update(CODEMODE_PAPER_AGENTS)
AGENT_SPECS.update(DATALAYER_AI_AGENTS)


def get_agent_spec(agent_id: str) -> AgentSpec | None:
    """Get an agent specification by ID."""
    return AGENT_SPECS.get(agent_id)


def list_agent_specs() -> list[AgentSpec]:
    """List all available agent specifications."""
    return list(AGENT_SPECS.values())


__all__ = ["AGENT_SPECS", "get_agent_spec", "list_agent_specs"]
