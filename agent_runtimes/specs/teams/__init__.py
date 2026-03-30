# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Team Library - Subfolder Organization.

THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
"""

from typing import Dict

from agent_runtimes.types import TeamSpec

from .teams import TEAM_SPECS as ROOT_TEAMS

# Merge all team specs from subfolders
TEAM_SPECS: Dict[str, TeamSpec] = {}
TEAM_SPECS.update(ROOT_TEAMS)


def get_team_spec(team_id: str) -> TeamSpec | None:
    """Get a team specification by ID."""
    spec = TEAM_SPECS.get(team_id)
    if spec is not None:
        return spec
    base, _, ver = team_id.rpartition(':')
    if base and '.' in ver:
        return TEAM_SPECS.get(base)
    return None


def list_team_specs(prefix: str | None = None) -> list[TeamSpec]:
    """List all available team specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    """
    specs = list(TEAM_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs

__all__ = ["TEAM_SPECS", "get_team_spec", "list_team_specs"]
