# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Event Catalog.

Predefined event type specifications for agent lifecycle and guardrail events.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import EventField, EventSpec

# ============================================================================
# Event Definitions
# ============================================================================

AGENT_ASSIGNED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-assigned",
    version="0.0.1",
    name="Agent Assigned",
    description="Emitted when an agent runtime is assigned/configured by the companion through the MCP servers start API.",
    kind="agent-assigned",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "assignment_source",
                "label": "Assignment Source",
                "type": "string",
                "required": False,
                "description": "Source that initiated the assignment (for example companion).",
            }
        ),
        EventField(
            **{
                "name": "assigned_at",
                "label": "Assigned At",
                "type": "string",
                "required": False,
                "description": "ISO 8601 timestamp when assignment/configuration completed.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

AGENT_OUTPUT_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-output",
    version="0.0.1",
    name="Agent Output",
    description="Emitted when an agent produces output. Contains timing information, exit status, optional output summary, and error details if applicable.",
    kind="agent-output",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "agent_spec_id",
                "label": "Agent Spec ID",
                "type": "string",
                "required": True,
                "description": "Identifier of the agent specification that was executed.",
            }
        ),
        EventField(
            **{
                "name": "started_at",
                "label": "Started At",
                "type": "string",
                "required": True,
                "description": "ISO 8601 timestamp when the agent started.",
            }
        ),
        EventField(
            **{
                "name": "ended_at",
                "label": "Ended At",
                "type": "string",
                "required": True,
                "description": "ISO 8601 timestamp when the agent ended.",
            }
        ),
        EventField(
            **{
                "name": "duration_ms",
                "label": "Duration (ms)",
                "type": "number",
                "required": True,
                "description": "Total execution time in milliseconds.",
            }
        ),
        EventField(
            **{
                "name": "exit_status",
                "label": "Exit Status",
                "type": "string",
                "required": True,
                "description": "Final status of the agent run (e.g. completed, error).",
            }
        ),
        EventField(
            **{
                "name": "outputs",
                "label": "Outputs",
                "type": "string",
                "required": False,
                "description": "Summary of the agent output or generated artifacts.",
            }
        ),
        EventField(
            **{
                "name": "error_message",
                "label": "Error Message",
                "type": "string",
                "required": False,
                "description": "Error description if the agent run failed.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

AGENT_START_REQUESTED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-start-requested",
    version="0.0.1",
    name="Agent Start Requested",
    description="Emitted when the API endpoint receives a request to start an agent runtime.",
    kind="agent-start-requested",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": False,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "started_at",
                "label": "Requested At",
                "type": "string",
                "required": False,
                "description": "ISO 8601 timestamp when the start was requested.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

AGENT_STARTED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-started",
    version="0.0.1",
    name="Agent Started",
    description="Emitted when an agent begins execution. Contains the runtime identifier, agent spec, trigger type, and the prompt being executed.",
    kind="agent-started",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "agent_spec_id",
                "label": "Agent Spec ID",
                "type": "string",
                "required": True,
                "description": "Identifier of the agent specification being executed.",
            }
        ),
        EventField(
            **{
                "name": "started_at",
                "label": "Started At",
                "type": "string",
                "required": True,
                "description": "ISO 8601 timestamp when the agent started.",
            }
        ),
        EventField(
            **{
                "name": "trigger_type",
                "label": "Trigger Type",
                "type": "string",
                "required": True,
                "description": "Type of trigger that launched the agent (e.g. once, cron, webhook).",
            }
        ),
        EventField(
            **{
                "name": "trigger_prompt",
                "label": "Trigger Prompt",
                "type": "string",
                "required": False,
                "description": "The prompt passed to the agent by the trigger.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

AGENT_TERMINATED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-terminated",
    version="0.0.1",
    name="Agent Terminated",
    description="Emitted when an agent runtime is fully terminated.",
    kind="agent-terminated",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "ended_at",
                "label": "Ended At",
                "type": "string",
                "required": False,
                "description": "ISO 8601 timestamp when the runtime termination completed.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

AGENT_TERMINATION_REQUESTED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-termination-requested",
    version="0.0.1",
    name="Agent Termination Requested",
    description="Emitted when the API endpoint receives a request to terminate an agent runtime.",
    kind="agent-termination-requested",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "reason",
                "label": "Reason",
                "type": "string",
                "required": False,
                "description": "Optional reason associated with the termination request.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

TOOL_APPROVAL_REQUESTED_EVENT_SPEC_0_0_1 = EventSpec(
    id="tool-approval-requested",
    version="0.0.1",
    name="Tool Approval Requested",
    description="Emitted when an agent invokes a tool that requires manual approval before execution. The agent pauses until the request is approved or rejected.",
    kind="tool-approval-requested",
    fields=[
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": True,
                "description": "Runtime pod or instance identifier.",
            }
        ),
        EventField(
            **{
                "name": "agent_spec_id",
                "label": "Agent Spec ID",
                "type": "string",
                "required": False,
                "description": "Identifier of the agent specification requesting approval.",
            }
        ),
        EventField(
            **{
                "name": "tool_name",
                "label": "Tool Name",
                "type": "string",
                "required": True,
                "description": "Name of the tool requiring approval.",
            }
        ),
        EventField(
            **{
                "name": "tool_args",
                "label": "Tool Arguments",
                "type": "string",
                "required": False,
                "description": "JSON-serialized arguments passed to the tool.",
            }
        ),
        EventField(
            **{
                "name": "origin",
                "label": "Origin",
                "type": "string",
                "required": False,
                "description": "Producer origin (endpoint, companion, runtime, or agent-runtime).",
            }
        ),
    ],
)

# ============================================================================
# Event Catalog
# ============================================================================

EVENT_CATALOG: Dict[str, EventSpec] = {
    "agent-assigned": AGENT_ASSIGNED_EVENT_SPEC_0_0_1,
    "agent-output": AGENT_OUTPUT_EVENT_SPEC_0_0_1,
    "agent-start-requested": AGENT_START_REQUESTED_EVENT_SPEC_0_0_1,
    "agent-started": AGENT_STARTED_EVENT_SPEC_0_0_1,
    "agent-terminated": AGENT_TERMINATED_EVENT_SPEC_0_0_1,
    "agent-termination-requested": AGENT_TERMINATION_REQUESTED_EVENT_SPEC_0_0_1,
    "tool-approval-requested": TOOL_APPROVAL_REQUESTED_EVENT_SPEC_0_0_1,
}


# Event kind constants for programmatic use
EVENT_KIND_AGENT_ASSIGNED = "agent-assigned"
EVENT_KIND_AGENT_OUTPUT = "agent-output"
EVENT_KIND_AGENT_START_REQUESTED = "agent-start-requested"
EVENT_KIND_AGENT_STARTED = "agent-started"
EVENT_KIND_AGENT_TERMINATED = "agent-terminated"
EVENT_KIND_AGENT_TERMINATION_REQUESTED = "agent-termination-requested"
EVENT_KIND_TOOL_APPROVAL_REQUESTED = "tool-approval-requested"


def get_event_spec(event_id: str) -> EventSpec | None:
    """Get an event specification by ID (accepts both bare and versioned refs)."""
    spec = EVENT_CATALOG.get(event_id)
    if spec is not None:
        return spec
    base, _, ver = event_id.rpartition(":")
    if base and "." in ver:
        return EVENT_CATALOG.get(base)
    return None


def list_event_specs() -> List[EventSpec]:
    """List all event specifications."""
    return list(EVENT_CATALOG.values())
