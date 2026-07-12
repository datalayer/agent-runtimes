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

CREATE_PLAN_TOOL_SPEC_0_0_1 = ToolSpec(
    id="create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="list-unordered",
    emoji="📋",
)

CURRENT_TIME_TOOL_SPEC_0_0_1 = ToolSpec(
    id="current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="clock",
    emoji="🕒",
)

DISPLAY_RECIPE_TOOL_SPEC_0_0_1 = ToolSpec(
    id="display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="book",
    emoji="🍳",
)

EXAMPLE_CREATE_PLAN_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="list-unordered",
    emoji="📋",
)

EXAMPLE_CURRENT_TIME_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="clock",
    emoji="🕒",
)

EXAMPLE_DISPLAY_RECIPE_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="book",
    emoji="🍳",
)

EXAMPLE_GENERATE_HAIKU_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="pencil",
    emoji="🖋️",
)

EXAMPLE_GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="tasklist",
    emoji="🧑‍⚖️",
)

EXAMPLE_GET_WEATHER_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="sun",
    emoji="🌤️",
)

EXAMPLE_RENDER_A2UI_SURFACE_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-render-a2ui-surface",
    version="0.0.1",
    name="Render A2UI Surface",
    description="Turn a declarative field spec into a validated A2UI v0.9 surface rendered live by the frontend as an interactive form/card.",
    tags=["example", "ag-ui", "a2ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.a2ui",
        method="render_a2ui_surface",
    ),
    icon="browser",
    emoji="🎛️",
)

EXAMPLE_UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1 = ToolSpec(
    id="example-update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="checklist",
    emoji="✅",
)

GENERATE_HAIKU_TOOL_SPEC_0_0_1 = ToolSpec(
    id="generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="pencil",
    emoji="🖋️",
)

GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1 = ToolSpec(
    id="generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="tasklist",
    emoji="🧑‍⚖️",
)

GET_WEATHER_TOOL_SPEC_0_0_1 = ToolSpec(
    id="get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="sun",
    emoji="🌤️",
)

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
    timeout=None,
    requires_approval=True,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_sensitive_echo",
    ),
    icon="shield",
    emoji="🛡️",
)

UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1 = ToolSpec(
    id="update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=ToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="checklist",
    emoji="✅",
)

# ============================================================================
# Tool Catalog
# ============================================================================

TOOL_CATALOG: Dict[str, ToolSpec] = {
    "create-plan": CREATE_PLAN_TOOL_SPEC_0_0_1,
    "current-time": CURRENT_TIME_TOOL_SPEC_0_0_1,
    "display-recipe": DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
    "example-create-plan": EXAMPLE_CREATE_PLAN_TOOL_SPEC_0_0_1,
    "example-current-time": EXAMPLE_CURRENT_TIME_TOOL_SPEC_0_0_1,
    "example-display-recipe": EXAMPLE_DISPLAY_RECIPE_TOOL_SPEC_0_0_1,
    "example-generate-haiku": EXAMPLE_GENERATE_HAIKU_TOOL_SPEC_0_0_1,
    "example-generate-task-steps": EXAMPLE_GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1,
    "example-get-weather": EXAMPLE_GET_WEATHER_TOOL_SPEC_0_0_1,
    "example-render-a2ui-surface": EXAMPLE_RENDER_A2UI_SURFACE_TOOL_SPEC_0_0_1,
    "example-update-plan-step": EXAMPLE_UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1,
    "generate-haiku": GENERATE_HAIKU_TOOL_SPEC_0_0_1,
    "generate-task-steps": GENERATE_TASK_STEPS_TOOL_SPEC_0_0_1,
    "get-weather": GET_WEATHER_TOOL_SPEC_0_0_1,
    "runtime-echo": RUNTIME_ECHO_TOOL_SPEC_0_0_1,
    "runtime-send-mail": RUNTIME_SEND_MAIL_TOOL_SPEC_0_0_1,
    "runtime-sensitive-echo": RUNTIME_SENSITIVE_ECHO_TOOL_SPEC_0_0_1,
    "update-plan-step": UPDATE_PLAN_STEP_TOOL_SPEC_0_0_1,
}


def get_tool_spec(tool_id: str) -> ToolSpec | None:
    """Get a tool specification by ID (accepts both bare and versioned refs)."""
    spec = TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(":")
    if base and "." in ver:
        return TOOL_CATALOG.get(base)
    return None


def list_tool_specs() -> List[ToolSpec]:
    """List all tool specifications."""
    return list(TOOL_CATALOG.values())
