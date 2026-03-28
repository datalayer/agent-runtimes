/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Event type specification types for agent lifecycle and guardrail events.
 *
 * @module types/eventspecs
 */

/**
 * Dynamic field definition for an event type specification.
 */
export interface EventField {
  /** Field key */
  name: string;
  /** Human-readable label */
  label: string;
  /** Field type */
  type: 'string' | 'boolean' | 'number';
  /** Whether the field is required */
  required: boolean;
  /** Field description */
  description?: string;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Event type specification for agent lifecycle and guardrail events.
 */
export interface EventSpec {
  /** Unique event type identifier */
  id: string;
  /** Version */
  version: string;
  /** Display name */
  name: string;
  /** Description of the event type */
  description: string;
  /** Event kind constant */
  kind: string;
  /** Payload fields for this event type */
  fields: EventField[];
}
