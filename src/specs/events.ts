/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Event Catalog
 *
 * Predefined event type specifications for agent lifecycle and guardrail events.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { EventSpec } from '../types';

// ============================================================================
// Event Definitions
// ============================================================================

export const AGENT_ASSIGNED_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'agent-assigned',
  version: '0.0.1',
  name: 'Agent Assigned',
  description:
    'Emitted when a running runtime is given its agent: the agent is created in the runtime, its MCP servers started and its environment set.',
  kind: 'agent-assigned',
  fields: [
    {
      name: 'agent_runtime_id',
      label: 'Agent Runtime ID',
      type: 'string',
      required: true,
      description: 'Runtime pod or instance identifier.',
    },
    {
      name: 'agent_name',
      label: 'Agent Name',
      type: 'string',
      required: true,
      description: 'Name of the agent assigned to the runtime.',
    },
    {
      name: 'assignment_source',
      label: 'Assignment Source',
      type: 'string',
      required: true,
      description:
        'What assigned the agent (e.g. the launch request, the pool).',
    },
    {
      name: 'assigned_at',
      label: 'Assigned At',
      type: 'string',
      required: true,
      description: 'ISO 8601 timestamp when the agent was assigned.',
    },
    {
      name: 'sandbox_variant',
      label: 'Sandbox Variant',
      type: 'string',
      required: false,
      description: 'The sandbox the agent executes code in.',
    },
    {
      name: 'mcp_proxy_url',
      label: 'MCP Proxy URL',
      type: 'string',
      required: false,
      description:
        'Address of the MCP proxy the agent reaches its tools through.',
    },
    {
      name: 'env_vars_set',
      label: 'Env Vars Set',
      type: 'number',
      required: false,
      description: 'How many environment variables were set for the agent.',
    },
  ],
};

export const AGENT_ENDED_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'agent-ended',
  version: '0.0.1',
  name: 'Agent Ended',
  description:
    'Emitted when an agent finishes execution. Contains timing information, exit status, optional output summary, and error details if applicable.',
  kind: 'agent-ended',
  fields: [
    {
      name: 'agent_runtime_id',
      label: 'Agent Runtime ID',
      type: 'string',
      required: true,
      description: 'Runtime pod or instance identifier.',
    },
    {
      name: 'agent_spec_id',
      label: 'Agent Spec ID',
      type: 'string',
      required: true,
      description: 'Identifier of the agent specification that was executed.',
    },
    {
      name: 'started_at',
      label: 'Started At',
      type: 'string',
      required: true,
      description: 'ISO 8601 timestamp when the agent started.',
    },
    {
      name: 'ended_at',
      label: 'Ended At',
      type: 'string',
      required: true,
      description: 'ISO 8601 timestamp when the agent ended.',
    },
    {
      name: 'duration_ms',
      label: 'Duration (ms)',
      type: 'number',
      required: true,
      description: 'Total execution time in milliseconds.',
    },
    {
      name: 'exit_status',
      label: 'Exit Status',
      type: 'string',
      required: true,
      description: 'Final status of the agent run (e.g. completed, error).',
    },
    {
      name: 'outputs',
      label: 'Outputs',
      type: 'string',
      required: false,
      description: 'Summary of the agent output or generated artifacts.',
    },
    {
      name: 'error_message',
      label: 'Error Message',
      type: 'string',
      required: false,
      description: 'Error description if the agent run failed.',
    },
  ],
};

export const AGENT_OUTPUT_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'agent-output',
  version: '0.0.1',
  name: 'Agent Output',
  description:
    "Emitted when an agent run produces its output: a triggered run that finished (with its timing and exit status) or a chat turn that completed. The event's status is the run's exit status.",
  kind: 'agent-output',
  fields: [
    {
      name: 'outputs',
      label: 'Outputs',
      type: 'string',
      required: false,
      description:
        'The text the agent produced, or a summary of the artifacts it generated.',
    },
    {
      name: 'exit_status',
      label: 'Exit Status',
      type: 'string',
      required: true,
      description: 'Final status of the run (e.g. completed, error).',
    },
    {
      name: 'duration_ms',
      label: 'Duration (ms)',
      type: 'number',
      required: true,
      description: 'Execution time of the run or the turn, in milliseconds.',
    },
    {
      name: 'agent_runtime_id',
      label: 'Agent Runtime ID',
      type: 'string',
      required: false,
      description:
        'Runtime pod or instance identifier; set by a triggered run.',
    },
    {
      name: 'agent_spec_id',
      label: 'Agent Spec ID',
      type: 'string',
      required: false,
      description:
        'Identifier of the agent specification that ran; set by a triggered run.',
    },
    {
      name: 'agent_id',
      label: 'Agent ID',
      type: 'string',
      required: false,
      description:
        'Identifier of the agent in the runtime; set by a chat turn.',
    },
    {
      name: 'started_at',
      label: 'Started At',
      type: 'string',
      required: false,
      description:
        'ISO 8601 timestamp when the run started; set by a triggered run.',
    },
    {
      name: 'ended_at',
      label: 'Ended At',
      type: 'string',
      required: false,
      description:
        'ISO 8601 timestamp when the run ended; set by a triggered run.',
    },
    {
      name: 'error_message',
      label: 'Error Message',
      type: 'string',
      required: false,
      description: 'Error description if the run failed.',
    },
  ],
};

export const AGENT_STARTED_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'agent-started',
  version: '0.0.1',
  name: 'Agent Started',
  description:
    'Emitted when an agent begins execution. Contains the runtime identifier, agent spec, trigger type, and the prompt being executed.',
  kind: 'agent-started',
  fields: [
    {
      name: 'agent_runtime_id',
      label: 'Agent Runtime ID',
      type: 'string',
      required: true,
      description: 'Runtime pod or instance identifier.',
    },
    {
      name: 'agent_spec_id',
      label: 'Agent Spec ID',
      type: 'string',
      required: true,
      description: 'Identifier of the agent specification being executed.',
    },
    {
      name: 'started_at',
      label: 'Started At',
      type: 'string',
      required: true,
      description: 'ISO 8601 timestamp when the agent started.',
    },
    {
      name: 'trigger_type',
      label: 'Trigger Type',
      type: 'string',
      required: true,
      description:
        'Type of trigger that launched the agent (e.g. once, cron, webhook).',
    },
    {
      name: 'trigger_prompt',
      label: 'Trigger Prompt',
      type: 'string',
      required: false,
      description: 'The prompt passed to the agent by the trigger.',
    },
  ],
};

export const GENERIC_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'generic',
  version: '0.0.1',
  name: 'Generic',
  description:
    'An event with no kind of its own: what the events client and the CLI create when none is named. It carries a title and a status, and no typed payload.',
  kind: 'generic',
  fields: [],
};

export const TOOL_APPROVAL_REQUESTED_EVENT_SPEC_0_0_1: EventSpec = {
  id: 'tool-approval-requested',
  version: '0.0.1',
  name: 'Tool Approval Requested',
  description:
    'Emitted when an agent invokes a tool that requires manual approval before execution. The agent pauses until the request is approved or rejected.',
  kind: 'tool-approval-requested',
  fields: [
    {
      name: 'agent_runtime_id',
      label: 'Agent Runtime ID',
      type: 'string',
      required: true,
      description: 'Runtime pod or instance identifier.',
    },
    {
      name: 'agent_spec_id',
      label: 'Agent Spec ID',
      type: 'string',
      required: false,
      description: 'Identifier of the agent specification requesting approval.',
    },
    {
      name: 'tool_name',
      label: 'Tool Name',
      type: 'string',
      required: true,
      description: 'Name of the tool requiring approval.',
    },
    {
      name: 'tool_args',
      label: 'Tool Arguments',
      type: 'string',
      required: false,
      description: 'JSON-serialized arguments passed to the tool.',
    },
  ],
};

// Event kind constants for programmatic use
export const EVENT_KIND_AGENT_ASSIGNED = 'agent-assigned';
export const EVENT_KIND_AGENT_ENDED = 'agent-ended';
export const EVENT_KIND_AGENT_OUTPUT = 'agent-output';
export const EVENT_KIND_AGENT_STARTED = 'agent-started';
export const EVENT_KIND_GENERIC = 'generic';
export const EVENT_KIND_TOOL_APPROVAL_REQUESTED = 'tool-approval-requested';

// ============================================================================
// Event Catalog
// ============================================================================

export const EVENT_CATALOG: Record<string, EventSpec> = {
  'agent-assigned': AGENT_ASSIGNED_EVENT_SPEC_0_0_1,
  'agent-ended': AGENT_ENDED_EVENT_SPEC_0_0_1,
  'agent-output': AGENT_OUTPUT_EVENT_SPEC_0_0_1,
  'agent-started': AGENT_STARTED_EVENT_SPEC_0_0_1,
  generic: GENERIC_EVENT_SPEC_0_0_1,
  'tool-approval-requested': TOOL_APPROVAL_REQUESTED_EVENT_SPEC_0_0_1,
};

export function getEventSpecs(): EventSpec[] {
  return Object.values(EVENT_CATALOG);
}

function resolveEventIdTs(eventId: string): string {
  if (eventId in EVENT_CATALOG) return eventId;
  const idx = eventId.lastIndexOf(':');
  if (idx > 0) {
    const base = eventId.slice(0, idx);
    if (base in EVENT_CATALOG) return base;
  }
  return eventId;
}

export function getEventSpec(eventId: string): EventSpec | undefined {
  return EVENT_CATALOG[resolveEventIdTs(eventId)];
}
