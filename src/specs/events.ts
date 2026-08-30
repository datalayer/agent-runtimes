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
export const EVENT_KIND_AGENT_ENDED = 'agent-ended';
export const EVENT_KIND_AGENT_STARTED = 'agent-started';
export const EVENT_KIND_TOOL_APPROVAL_REQUESTED = 'tool-approval-requested';
export const EVENT_KIND_AGENT_ASSIGNED = 'agent-assigned';

// ============================================================================
// Event Catalog
// ============================================================================

export const EVENT_CATALOG: Record<string, EventSpec> = {
  'agent-ended': AGENT_ENDED_EVENT_SPEC_0_0_1,
  'agent-started': AGENT_STARTED_EVENT_SPEC_0_0_1,
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
