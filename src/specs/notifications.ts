/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Notification Channel Catalog
 *
 * Predefined notification channel configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { NotificationChannelSpec } from '../types/types';

// ============================================================================
// Notification Channel Definitions
// ============================================================================

export const EMAIL_NOTIFICATION_SPEC_0_0_1: NotificationChannelSpec = {
  id: 'email',
  version: '0.0.1',
  name: 'Email',
  description:
    'Send notifications via email when agent events occur. Supports completion alerts, failure reports, and summary digests.',
  icon: 'mail',
  available: true,
  coming_soon: false,
  fields: [
    {
      name: 'recipients',
      label: 'Recipients',
      type: 'string',
      required: true,
      placeholder: 'ops@company.com, team-lead@company.com',
    },
    {
      name: 'subject_template',
      label: 'Subject Template',
      type: 'string',
      required: false,
      placeholder: '[Agent] {{agent_name}} — {{event_type}}',
    },
    {
      name: 'include_output',
      label: 'Include Output',
      type: 'boolean',
      required: false,
      default: true,
    },
  ],
};

export const SLACK_NOTIFICATION_SPEC_0_0_1: NotificationChannelSpec = {
  id: 'slack',
  version: '0.0.1',
  name: 'Slack',
  description:
    'Post notifications to a Slack channel or direct message when agent events occur. Supports rich message formatting with blocks.',
  icon: 'bell',
  available: true,
  coming_soon: false,
  fields: [
    {
      name: 'channel',
      label: 'Channel',
      type: 'string',
      required: true,
      placeholder: '#sales-analytics',
    },
    {
      name: 'mention_on_failure',
      label: 'Mention on Failure',
      type: 'string',
      required: false,
      placeholder: '@oncall-team',
    },
    {
      name: 'include_output',
      label: 'Include Output',
      type: 'boolean',
      required: false,
      default: false,
    },
  ],
};

export const TEAMS_NOTIFICATION_SPEC_0_0_1: NotificationChannelSpec = {
  id: 'teams',
  version: '0.0.1',
  name: 'Teams',
  description:
    'Post notifications to a Microsoft Teams channel via incoming webhook connector when agent events occur.',
  icon: 'bell',
  available: false,
  coming_soon: true,
  fields: [
    {
      name: 'webhook_url',
      label: 'Webhook URL',
      type: 'string',
      required: true,
      placeholder: 'https://outlook.office.com/webhook/...',
    },
    {
      name: 'include_output',
      label: 'Include Output',
      type: 'boolean',
      required: false,
      default: false,
    },
  ],
};

export const WEBHOOK_NOTIFICATION_SPEC_0_0_1: NotificationChannelSpec = {
  id: 'webhook',
  version: '0.0.1',
  name: 'Webhook',
  description:
    'Send notifications to a custom HTTP endpoint via POST request. Payload includes event type, agent metadata, and optional output.',
  icon: 'bell',
  available: false,
  coming_soon: true,
  fields: [
    {
      name: 'url',
      label: 'Webhook URL',
      type: 'string',
      required: true,
      placeholder: 'https://api.example.com/agent-events',
    },
    {
      name: 'secret',
      label: 'Signing Secret',
      type: 'string',
      required: false,
      placeholder: 'Optional HMAC secret for payload signing',
    },
    {
      name: 'include_output',
      label: 'Include Output',
      type: 'boolean',
      required: false,
      default: true,
    },
  ],
};

// ============================================================================
// Notification Channel Catalog
// ============================================================================

export const NOTIFICATION_CATALOG: Record<string, NotificationChannelSpec> = {
  email: EMAIL_NOTIFICATION_SPEC_0_0_1,
  'email:0.0.1': EMAIL_NOTIFICATION_SPEC_0_0_1,
  slack: SLACK_NOTIFICATION_SPEC_0_0_1,
  'slack:0.0.1': SLACK_NOTIFICATION_SPEC_0_0_1,
  teams: TEAMS_NOTIFICATION_SPEC_0_0_1,
  'teams:0.0.1': TEAMS_NOTIFICATION_SPEC_0_0_1,
  webhook: WEBHOOK_NOTIFICATION_SPEC_0_0_1,
  'webhook:0.0.1': WEBHOOK_NOTIFICATION_SPEC_0_0_1,
};

export function getNotificationSpecs(): NotificationChannelSpec[] {
  return Object.values(NOTIFICATION_CATALOG);
}

export function getNotificationSpec(
  channelId: string,
): NotificationChannelSpec | undefined {
  return NOTIFICATION_CATALOG[channelId];
}
