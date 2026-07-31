# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""In-repo subagent delegation capability for agent-runtimes.

Provides a self-contained pydantic-ai ``AbstractCapability`` that lets a parent
agent delegate scoped tasks to specialist subagents. Replaces the external
``subagents-pydantic-ai`` dependency with a smaller, focused implementation.
"""

from .capability import (
    SubagentDefinition,
    SubagentsCapability,
    build_subagents_capability,
)

__all__ = [
    "SubagentDefinition",
    "SubagentsCapability",
    "build_subagents_capability",
]
