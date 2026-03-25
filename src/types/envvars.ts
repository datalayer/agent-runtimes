/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Specification for an environment variable.
 */
export interface EnvvarSpec {
  /** Environment variable identifier */
  id: string;
  /** Version */
  version: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Registration URL or docs link */
  registrationUrl?: string;
  /** Tags for categorization */
  tags: string[];
  /** Icon identifier */
  icon?: string;
  /** Emoji identifier */
  emoji?: string;
}
