/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Dynamic field definition for a notification channel.
 */
export interface NotificationField {
  /** Field key */
  name: string;
  /** Human-readable label */
  label: string;
  /** Field type */
  type: 'string' | 'boolean' | 'number';
  /** Whether the field is required */
  required: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Default value */
  default?: string | boolean | number;
}

/**
 * Notification channel specification.
 */
export interface NotificationChannelSpec {
  /** Unique channel identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the channel */
  description: string;
  /** Icon identifier */
  icon: string;
  /** Whether this channel is currently available */
  available: boolean;
  /** Whether this channel is marked as coming soon */
  coming_soon?: boolean;
  /** Dynamic configuration fields for this channel */
  fields: NotificationField[];
}

/**
 * Notification configuration for an agent spec.
 */
export interface AgentNotificationConfig {
  email?: string;
  slack?: string;
  teams?: string;
  webhook?: string;
  [key: string]: string | number | boolean | undefined;
}
