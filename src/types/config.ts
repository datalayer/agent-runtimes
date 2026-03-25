/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { TransportType } from './protocol';
import type { AgentValidationConfig } from './execution';

/**
 * Configuration for connecting to an agent runtime.
 */
export interface AgentRuntimeConfig {
  /** URL of the agent runtime server */
  url: string;
  /** Optional agent ID to connect to */
  agentId?: string;
  /** Optional authentication token */
  authToken?: string;
  /** Optional protocol type (defaults handled by consumers) */
  protocol?: TransportType;
}

/**
 * Codemode configuration for an agent spec.
 */
export interface AgentCodemodeConfig {
  enabled?: boolean;
  token_reduction?: string;
  speedup?: string;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Advanced configuration for an agent spec.
 */
export interface AgentAdvancedConfig {
  cost_limit?: string;
  time_limit?: string;
  max_iterations?: number;
  validation?: AgentValidationConfig | string;
  [key: string]: unknown;
}
