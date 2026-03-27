/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * McpStatusIndicator — Round status dot showing the aggregate
 * state of MCP servers, with a tooltip listing per-server details.
 *
 * Statuses:
 * - none:        No MCP servers defined (gray)
 * - not_started: Servers defined but not started (gray)
 * - starting:    Servers are starting up (amber / pulsing)
 * - failed:      At least one server failed (red)
 * - started:     All servers started & available (green)
 *
 * @module chat/indicators/McpStatusIndicator
 */

export {
  McpStatusIndicator,
  type McpStatusIndicatorProps,
} from './McpStatusIndicator';
export type { McpServerStatus, McpAggregateStatus } from '../../types/mcp';

export {
  SandboxStatusIndicator,
  type SandboxStatusIndicatorProps,
} from './SandboxStatusIndicator';
export type {
  SandboxAggregateStatus,
  SandboxWsStatus,
} from '../../types/sandbox';
