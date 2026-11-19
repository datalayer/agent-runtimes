/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The composer's indicators. The MCP and skills dots are triggers of the
 * same overlay as the footer's menus (`chat/prompt/menus/EquipmentMenus`).
 *
 * @module chat/indicators
 */

export type { McpServerStatus, McpAggregateStatus } from '../../types/mcp';

export {
  SandboxStatusIndicator,
  type SandboxStatusIndicatorProps,
} from './SandboxStatusIndicator';
export type {
  SandboxAggregateStatus,
  SandboxWsStatus,
} from '../../types/sandbox';
