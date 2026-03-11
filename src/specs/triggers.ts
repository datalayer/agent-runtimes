/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Trigger Catalog
 *
 * Predefined trigger type configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { TriggerSpec } from '../types/Types';

// ============================================================================
// Trigger Definitions
// ============================================================================

export const EVENT_TRIGGER_SPEC: TriggerSpec = {
  id: 'event',
  name: 'Event-Based',
  description:
    'Trigger on specific events such as a webhook call, API request, database change, file upload, or email arrival.',
  type: 'event',
  fields: [
    {
      name: 'event_source',
      label: 'Event Source URL',
      type: 'string',
      required: false,
      placeholder: 'https://helpdesk.example.com/webhooks',
      help: 'Allowed event source URL (leave empty to allow any source)',
    },
    {
      name: 'event',
      label: 'Event Name',
      type: 'string',
      required: false,
      placeholder: 'email_received',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'string',
      required: false,
      placeholder: "Description (e.g. 'Triggered on incoming email')",
    },
  ],
};

export const ONCE_TRIGGER_SPEC: TriggerSpec = {
  id: 'once',
  name: 'Run Once',
  description: 'Execute agent immediately after deployment.',
  type: 'once',
  fields: [],
};

export const SCHEDULE_TRIGGER_SPEC: TriggerSpec = {
  id: 'schedule',
  name: 'Schedule',
  description:
    'Run on a recurring schedule using a cron expression (e.g. daily at 9 AM, every Monday, monthly on the 1st).',
  type: 'schedule',
  fields: [
    {
      name: 'cron',
      label: 'Cron Expression',
      type: 'string',
      required: true,
      placeholder: '0 9 * * * (every day at 9 AM)',
      font: 'mono',
    },
    {
      name: 'description',
      label: 'Description',
      type: 'string',
      required: false,
      placeholder: "Description (e.g. 'Monthly sales report')",
    },
  ],
};

// ============================================================================
// Trigger Catalog
// ============================================================================

export const TRIGGER_CATALOG: Record<string, TriggerSpec> = {
  event: EVENT_TRIGGER_SPEC,
  once: ONCE_TRIGGER_SPEC,
  schedule: SCHEDULE_TRIGGER_SPEC,
};

export function getTriggerSpecs(): TriggerSpec[] {
  return Object.values(TRIGGER_CATALOG);
}

export function getTriggerSpec(triggerId: string): TriggerSpec | undefined {
  return TRIGGER_CATALOG[triggerId];
}
