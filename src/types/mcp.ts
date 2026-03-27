/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A tool provided by an MCP server.
 */
export interface MCPServerTool {
  /** Tool name/identifier */
  name: string;
  /** Tool description */
  description: string;
  /** Whether the tool is enabled */
  enabled: boolean;
  /** JSON schema for tool input parameters */
  inputSchema?: Record<string, unknown>;
}

/**
 * Configuration for an MCP server.
 */
export interface MCPServer {
  /** Unique server identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name for the server */
  name: string;
  /** Server description */
  description?: string;
  /** Server URL (for HTTP-based servers) */
  url: string;
  /** Whether the server is enabled */
  enabled: boolean;
  /** List of available tools */
  tools: MCPServerTool[];
  /** Command to run the MCP server (e.g., 'npx', 'uvx') */
  command?: string;
  /** Command arguments for the MCP server */
  args: string[];
  /** Whether the server is available (based on tool discovery) */
  isAvailable: boolean;
  /** Transport type: 'stdio' or 'http' */
  transport: 'stdio' | 'http';
  /** Environment variables required by this server (e.g., API keys) */
  requiredEnvVars?: string[];
  /** Icon identifier for the server */
  icon?: string;
  /** Emoji identifier for the server */
  emoji?: string;
}

/**
 * MCP server tool configuration for an agent spec.
 */
export interface AgentMCPServerToolConfig {
  server?: string;
  tool?: string;
  enabled?: boolean;
  approval_required?: boolean;
  [key: string]: unknown;
}

/**
 * Lightweight MCP server tool shape used by MCP management views.
 */
export interface MCPServerManagerTool {
  name: string;
  description?: string;
}

/**
 * Aggregate status of all MCP servers.
 */
export type McpAggregateStatus =
  | 'none'
  | 'not_started'
  | 'starting'
  | 'failed'
  | 'started';

/**
 * Per-server status entry returned by the MCP toolsets-status endpoint.
 */
export interface McpServerStatus {
  id: string;
  status: 'none' | 'not_started' | 'starting' | 'failed' | 'started';
  error?: string;
  tools_count?: number;
}

/**
 * Full response from `/api/v1/configure/mcp-toolsets-status`.
 */
export interface McpToolsetsStatusResponse {
  initialized: boolean;
  ready_count: number;
  failed_count: number;
  ready_servers: string[];
  failed_servers: Record<string, string>;
  servers: McpServerStatus[];
}

import { defaultIndicatorColors } from '@datalayer/primer-addons/lib/theme';

/**
 * Primer-addon indicator colours for each aggregate MCP status.
 * Uses the shared indicator palette so colours stay consistent
 * across themes and components.
 */
export const MCP_STATUS_COLORS: Record<McpAggregateStatus, string> = {
  none: defaultIndicatorColors.neutral,
  not_started: defaultIndicatorColors.muted,
  starting: defaultIndicatorColors.warning,
  failed: defaultIndicatorColors.danger,
  started: defaultIndicatorColors.success,
};

/**
 * Human-readable labels for each aggregate MCP status.
 */
export const MCP_STATUS_LABELS: Record<McpAggregateStatus, string> = {
  none: 'No MCP servers',
  not_started: 'MCP servers not started',
  starting: 'MCP servers starting\u2026',
  failed: 'MCP server error',
  started: 'MCP servers ready',
};

/**
 * MCP server shape used by MCP management views and /available endpoint payloads.
 */
export interface MCPServerManager {
  id: string;
  name: string;
  description?: string;
  url?: string;
  enabled: boolean;
  tools: MCPServerManagerTool[];
  command?: string;
  args?: string[];
  requiredEnvVars?: string[];
  isAvailable?: boolean;
  transport?: string;
  /** True if this server is from mcp.json config (not in catalog) */
  isConfig?: boolean;
  /** True if this server is currently running */
  isRunning?: boolean;
}
