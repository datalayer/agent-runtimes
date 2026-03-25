/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Dynamic field definition for a trigger type.
 */
export interface TriggerField {
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
  /** Help text */
  help?: string;
  /** Font family hint (e.g., 'mono') */
  font?: string;
}

/**
 * Trigger type specification.
 */
export interface TriggerSpec {
  /** Unique trigger identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the trigger */
  description: string;
  /** Trigger type discriminator */
  type: 'once' | 'schedule' | 'event';
  /** Dynamic fields for this trigger type */
  fields?: TriggerField[];
}
