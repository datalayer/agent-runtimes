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


class ToolRuntimeSpec(BaseModel):
    """Runtime binding for a tool implementation."""

    language: Literal['python', 'typescript'] = Field(..., description='Implementation language')
    package: str = Field(..., description="Module/package containing the implementation")
    method: str = Field(..., description="Callable/function name in the package")


class ToolSpec(BaseModel):
    """Tool specification."""

    id: str = Field(..., description="Tool identifier")
    version: str = Field(default="0.0.1", description="Tool version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Tool description")
    tags: List[str] = Field(default_factory=list, description="Search/discovery tags")
    enabled: bool = Field(default=True, description="Whether tool is enabled")
    approval: Literal['auto', 'manual'] = Field(default='auto', description='Approval policy')
    requires_approval: bool = Field(default=False, description="Whether tool requires human approval before execution")
    runtime: ToolRuntimeSpec = Field(..., description="Runtime binding metadata")
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")


# ============================================================================
# Tool Definitions
# ============================================================================

RUNTIME_ECHO_TOOL_SPEC_0_0_1 = ToolSpec(
    id="runtime-echo",
    version="0.0.1",
    name="Runtime Echo",
    description="Echo text back to the caller for quick runtime verification.",
    tags=["runtime", "utility"],
    enabled=True,
    approval="auto",
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_echo",
    ),
    icon="comment",
    emoji="💬",
)

RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1 = ToolSpec(
    id="runtime-send-mail",
    version="0.0.1",
    name="Runtime Send Mail (Fake)",
    description="Fake mail sender for tool approval demos; returns a simulated send receipt.",
    tags=["runtime", "approval", "mail"],
    enabled=True,
    approval="manual",
    requires_approval=True,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_send_mail",
    ),
    icon="mail",
    emoji="📧",
)

RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1 = ToolSpec(
    id="runtime-sensitive-echo",
    version="0.0.1",
    name="Runtime Sensitive Echo",
    description="Echo text with a manual approval checkpoint before execution.",
    tags=["runtime", "approval"],
    enabled=True,
    approval="manual",
    requires_approval=True,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_sensitive_echo",
    ),
    icon="shield",
    emoji="🛡️",
)

# ============================================================================
# Tool Catalog
# ============================================================================

TOOL_CATALOG: Dict[str, ToolSpec] = {
    "runtime-echo": RUNTIME_ECHO_TOOL_SPEC_0_0_1,
    "runtime-send-mail": RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1,
    "runtime-sensitive-echo": RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1,
}


def get_tool_spec(tool_id: str) -> ToolSpec | None:
    """Get a tool specification by ID (accepts both bare and versioned refs)."""
    spec = TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(':')
    if base and '.' in ver:
        return TOOL_CATALOG.get(base)
    return None


def list_tool_specs() -> List[ToolSpec]:
    """List all tool specifications."""
    return list(TOOL_CATALOG.values())
