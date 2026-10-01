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
    description="Emitted when a running runtime is given its agent: the agent is created in the runtime, its MCP servers started and its environment set.",
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
                "name": "agent_name",
                "label": "Agent Name",
                "type": "string",
                "required": True,
                "description": "Name of the agent assigned to the runtime.",
            }
        ),
        EventField(
            **{
                "name": "assignment_source",
                "label": "Assignment Source",
                "type": "string",
                "required": True,
                "description": "What assigned the agent (e.g. the launch request, the pool).",
            }
        ),
        EventField(
            **{
                "name": "assigned_at",
                "label": "Assigned At",
                "type": "string",
                "required": True,
                "description": "ISO 8601 timestamp when the agent was assigned.",
            }
        ),
        EventField(
            **{
                "name": "sandbox_variant",
                "label": "Sandbox Variant",
                "type": "string",
                "required": False,
                "description": "The sandbox the agent executes code in.",
            }
        ),
        EventField(
            **{
                "name": "mcp_proxy_url",
                "label": "MCP Proxy URL",
                "type": "string",
                "required": False,
                "description": "Address of the MCP proxy the agent reaches its tools through.",
            }
        ),
        EventField(
            **{
                "name": "env_vars_set",
                "label": "Env Vars Set",
                "type": "number",
                "required": False,
                "description": "How many environment variables were set for the agent.",
            }
        ),
    ],
)

AGENT_ENDED_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-ended",
    version="0.0.1",
    name="Agent Ended",
    description="Emitted when an agent finishes execution. Contains timing information, exit status, optional output summary, and error details if applicable.",
    kind="agent-ended",
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
    ],
)

AGENT_OUTPUT_EVENT_SPEC_0_0_1 = EventSpec(
    id="agent-output",
    version="0.0.1",
    name="Agent Output",
    description="Emitted when an agent run produces its output: a triggered run that finished (with its timing and exit status) or a chat turn that completed. The event's status is the run's exit status.",
    kind="agent-output",
    fields=[
        EventField(
            **{
                "name": "outputs",
                "label": "Outputs",
                "type": "string",
                "required": False,
                "description": "The text the agent produced, or a summary of the artifacts it generated.",
            }
        ),
        EventField(
            **{
                "name": "exit_status",
                "label": "Exit Status",
                "type": "string",
                "required": True,
                "description": "Final status of the run (e.g. completed, error).",
            }
        ),
        EventField(
            **{
                "name": "duration_ms",
                "label": "Duration (ms)",
                "type": "number",
                "required": True,
                "description": "Execution time of the run or the turn, in milliseconds.",
            }
        ),
        EventField(
            **{
                "name": "agent_runtime_id",
                "label": "Agent Runtime ID",
                "type": "string",
                "required": False,
                "description": "Runtime pod or instance identifier; set by a triggered run.",
            }
        ),
        EventField(
            **{
                "name": "agent_spec_id",
                "label": "Agent Spec ID",
                "type": "string",
                "required": False,
                "description": "Identifier of the agent specification that ran; set by a triggered run.",
            }
        ),
        EventField(
            **{
                "name": "agent_id",
                "label": "Agent ID",
                "type": "string",
                "required": False,
                "description": "Identifier of the agent in the runtime; set by a chat turn.",
            }
        ),
        EventField(
            **{
                "name": "started_at",
                "label": "Started At",
                "type": "string",
                "required": False,
                "description": "ISO 8601 timestamp when the run started; set by a triggered run.",
            }
        ),
        EventField(
            **{
                "name": "ended_at",
                "label": "Ended At",
                "type": "string",
                "required": False,
                "description": "ISO 8601 timestamp when the run ended; set by a triggered run.",
            }
        ),
        EventField(
            **{
                "name": "error_message",
                "label": "Error Message",
                "type": "string",
                "required": False,
                "description": "Error description if the run failed.",
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
    ],
)

GENERIC_EVENT_SPEC_0_0_1 = EventSpec(
    id="generic",
    version="0.0.1",
    name="Generic",
    description="An event with no kind of its own: what the events client and the CLI create when none is named. It carries a title and a status, and no typed payload.",
    kind="generic",
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
    ],
)

# ============================================================================
# Event Catalog
# ============================================================================

EVENT_CATALOG: Dict[str, EventSpec] = {
    "agent-assigned": AGENT_ASSIGNED_EVENT_SPEC_0_0_1,
    "agent-ended": AGENT_ENDED_EVENT_SPEC_0_0_1,
    "agent-output": AGENT_OUTPUT_EVENT_SPEC_0_0_1,
    "agent-started": AGENT_STARTED_EVENT_SPEC_0_0_1,
    "generic": GENERIC_EVENT_SPEC_0_0_1,
    "tool-approval-requested": TOOL_APPROVAL_REQUESTED_EVENT_SPEC_0_0_1,
}


# Event kind constants for programmatic use
EVENT_KIND_AGENT_ASSIGNED = "agent-assigned"
EVENT_KIND_AGENT_ENDED = "agent-ended"
EVENT_KIND_AGENT_OUTPUT = "agent-output"
EVENT_KIND_AGENT_STARTED = "agent-started"
EVENT_KIND_GENERIC = "generic"
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
