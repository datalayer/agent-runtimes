# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Tool Catalog.

Predefined runtime tools that can be attached to agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import ToolRuntimeSpec, ToolSpec


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
    timeout=None,
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
    timeout=None,
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
    timeout="5h0m0s",
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
