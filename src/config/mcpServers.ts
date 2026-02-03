/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP Server Library.
 *
 * Predefined MCP server configurations that can be used by agents.
 * Credentials are configured via environment variables.
 */

import type { MCPServer } from '../types';

// ============================================================================
// MCP Server Definitions
// ============================================================================

export const TAVILY_MCP_SERVER: MCPServer = {
  id: 'tavily',
  name: 'Tavily Search',
  url: '',
  command: 'npx',
  args: ['-y', 'tavily-mcp'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: TAVILY_API_KEY
};

export const FILESYSTEM_MCP_SERVER: MCPServer = {
  id: 'filesystem',
  name: 'Filesystem',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
};

export const GITHUB_MCP_SERVER: MCPServer = {
  id: 'github',
  name: 'GitHub',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-github'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: GITHUB_TOKEN
};

export const GOOGLE_WORKSPACE_MCP_SERVER: MCPServer = {
  id: 'google-workspace',
  name: 'Google Workspace',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-google-workspace'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
};

export const SLACK_MCP_SERVER: MCPServer = {
  id: 'slack',
  name: 'Slack',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-slack'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: SLACK_BOT_TOKEN
};

export const KAGGLE_MCP_SERVER: MCPServer = {
  id: 'kaggle',
  name: 'Kaggle',
  url: '',
  command: 'uvx',
  args: ['kaggle-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: KAGGLE_USERNAME, KAGGLE_KEY
};

export const ALPHAVANTAGE_MCP_SERVER: MCPServer = {
  id: 'alphavantage',
  name: 'Alpha Vantage',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-alphavantage'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: ALPHAVANTAGE_API_KEY
};

export const CHART_MCP_SERVER: MCPServer = {
  id: 'chart',
  name: 'Chart Generator',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-chart'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
};

export const LINKEDIN_MCP_SERVER: MCPServer = {
  id: 'linkedin',
  name: 'LinkedIn',
  url: '',
  command: 'uvx',
  args: ['linkedin-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: LINKEDIN_ACCESS_TOKEN
};

export const GMAIL_MCP_SERVER: MCPServer = {
  id: 'gmail',
  name: 'Gmail',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-gmail'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
};

export const GDRIVE_MCP_SERVER: MCPServer = {
  id: 'gdrive',
  name: 'Google Drive',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/mcp-server-gdrive'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  // Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
};

// ============================================================================
// MCP Server Library
// ============================================================================

export const MCP_SERVER_LIBRARY: Record<string, MCPServer> = {
  tavily: TAVILY_MCP_SERVER,
  filesystem: FILESYSTEM_MCP_SERVER,
  github: GITHUB_MCP_SERVER,
  'google-workspace': GOOGLE_WORKSPACE_MCP_SERVER,
  slack: SLACK_MCP_SERVER,
  kaggle: KAGGLE_MCP_SERVER,
  alphavantage: ALPHAVANTAGE_MCP_SERVER,
  chart: CHART_MCP_SERVER,
  linkedin: LINKEDIN_MCP_SERVER,
  gmail: GMAIL_MCP_SERVER,
  gdrive: GDRIVE_MCP_SERVER,
};

/**
 * Get an MCP server by ID.
 */
export function getMcpServer(serverId: string): MCPServer | undefined {
  return MCP_SERVER_LIBRARY[serverId];
}

/**
 * List all available MCP servers.
 */
export function listMcpServers(): MCPServer[] {
  return Object.values(MCP_SERVER_LIBRARY);
}
