# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Backend Tool Catalog.

Predefined runtime tools that can be attached to agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import BackendToolRuntimeSpec, BackendToolSpec

# ============================================================================
# Backend Tool Definitions
# ============================================================================

CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="@primer/octicons-react:list-unordered",
    emoji="📋",
)

CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="@primer/octicons-react:clock",
    emoji="🕒",
)

DECIDE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="decide",
    version="0.0.1",
    name="Decide",
    description="Ask Jev typed questions about a text — noul (does a statement hold, with its probability), choice (one of named options) or score (a step on a rubric) — and get the typed answers back, through datalayer-ai-inference.",
    tags=["runtime", "decisions", "jev"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.decisions",
        method="decide",
    ),
    icon="@primer/octicons-react:law",
    emoji="⚖️",
)

DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="@primer/octicons-react:book",
    emoji="🍳",
)

EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="@primer/octicons-react:list-unordered",
    emoji="📋",
)

EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="@primer/octicons-react:clock",
    emoji="🕒",
)

EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="@primer/octicons-react:book",
    emoji="🍳",
)

EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="@primer/octicons-react:pencil",
    emoji="🖋️",
)

EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="@primer/octicons-react:tasklist",
    emoji="🙋",
)

EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="@primer/octicons-react:sun",
    emoji="🌤️",
)

EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-render-a2ui-surface",
    version="0.0.1",
    name="Render A2UI Surface",
    description="Turn a declarative field spec into a validated A2UI v0.9 surface rendered live by the frontend as an interactive form/card.",
    tags=["example", "ag-ui", "a2ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.a2ui",
        method="render_a2ui_surface",
    ),
    icon="@primer/octicons-react:browser",
    emoji="🎛️",
)

EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="@primer/octicons-react:checklist",
    emoji="✅",
)

GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="@primer/octicons-react:pencil",
    emoji="🖋️",
)

GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="@primer/octicons-react:tasklist",
    emoji="🙋",
)

GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="@primer/octicons-react:sun",
    emoji="🌤️",
)

RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-echo",
    version="0.0.1",
    name="Runtime Echo",
    description="Echo text back to the caller for quick runtime verification.",
    tags=["runtime", "utility"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_echo",
    ),
    icon="@primer/octicons-react:comment",
    emoji="💬",
)

RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-send-mail",
    version="0.0.1",
    name="Runtime Send Mail (Fake)",
    description="Fake mail sender for tool approval demos; returns a simulated send receipt.",
    tags=["runtime", "approval", "mail"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_send_mail",
    ),
    icon="@primer/octicons-react:mail",
    emoji="📧",
)

RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-sensitive-echo",
    version="0.0.1",
    name="Runtime Sensitive Echo",
    description="Echo text with a manual approval checkpoint before execution.",
    tags=["runtime", "approval"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_sensitive_echo",
    ),
    icon="@primer/octicons-react:shield",
    emoji="🛡️",
)

UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="@primer/octicons-react:checklist",
    emoji="✅",
)

# ============================================================================
# Backend Tool Catalog
# ============================================================================

BACKEND_TOOL_CATALOG: Dict[str, BackendToolSpec] = {
    "create-plan": CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
    "current-time": CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
    "decide": DECIDE_BACKEND_TOOL_SPEC_0_0_1,
    "display-recipe": DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
    "example-create-plan": EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
    "example-current-time": EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
    "example-display-recipe": EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
    "example-generate-haiku": EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
    "example-generate-task-steps": EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
    "example-get-weather": EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
    "example-render-a2ui-surface": EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1,
    "example-update-plan-step": EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
    "generate-haiku": GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
    "generate-task-steps": GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
    "get-weather": GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-echo": RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-send-mail": RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-sensitive-echo": RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1,
    "update-plan-step": UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
}


def get_backend_tool_spec(tool_id: str) -> BackendToolSpec | None:
    """Get a tool specification by ID (accepts both bare and versioned refs)."""
    spec = BACKEND_TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(":")
    if base and "." in ver:
        return BACKEND_TOOL_CATALOG.get(base)
    return None


def list_backend_tool_specs() -> List[BackendToolSpec]:
    """List all tool specifications."""
    return list(BACKEND_TOOL_CATALOG.values())
