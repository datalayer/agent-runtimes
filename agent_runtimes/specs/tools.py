# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Tool Catalog.

Predefined runtime tools that can be attached to agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ToolSpec(BaseModel):
    """Tool specification."""

    id: str = Field(..., description="Tool identifier")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Tool description")
    tags: List[str] = Field(default_factory=list, description="Search/discovery tags")
    enabled: bool = Field(default=True, description="Whether tool is enabled")
    approval: Literal['auto', 'manual'] = Field(default='auto', description='Approval policy')
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")


# ============================================================================
# Tool Definitions
# ============================================================================

RUNTIME_ECHO_TOOL_SPEC = ToolSpec(
    id="runtime-echo",
    name="Runtime Echo",
    description="Echo text back to the caller for quick runtime verification.",
    tags=["runtime", "utility"],
    enabled=True,
    approval="auto",
    icon="comment",
    emoji="💬",
)

RUNTIME_SENSITIVE_ECHO_TOOL_SPEC = ToolSpec(
    id="runtime-sensitive-echo",
    name="Runtime Sensitive Echo",
    description="Echo text with a manual approval checkpoint before execution.",
    tags=["runtime", "approval"],
    enabled=True,
    approval="manual",
    icon="shield",
    emoji="🛡️",
)

# ============================================================================
# Tool Catalog
# ============================================================================

TOOL_CATALOG: Dict[str, ToolSpec] = {
    "runtime-echo": RUNTIME_ECHO_TOOL_SPEC,
    "runtime-sensitive-echo": RUNTIME_SENSITIVE_ECHO_TOOL_SPEC,
}


def get_tool_spec(tool_id: str) -> ToolSpec | None:
    """Get a tool specification by ID."""
    return TOOL_CATALOG.get(tool_id)


def list_tool_specs() -> List[ToolSpec]:
    """List all tool specifications."""
    return list(TOOL_CATALOG.values())
