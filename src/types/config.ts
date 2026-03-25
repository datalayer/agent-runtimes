/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { TransportType } from './protocol';

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
