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
