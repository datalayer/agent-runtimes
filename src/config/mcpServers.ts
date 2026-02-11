/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * MCP Server Catalog
 *
 * Predefined MCP server configurations.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { MCPServer } from '../types';

// ============================================================================
// MCP Server Definitions
// ============================================================================

export const ALPHAVANTAGE_MCP_SERVER: MCPServer = {
  id: 'alphavantage',
  name: 'Alpha Vantage',
  url: '',
  command: 'uvx',
  args: ['av-mcp==0.2.1', '${ALPHAVANTAGE_API_KEY}'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['ALPHAVANTAGE_API_KEY'],
};

export const CHART_MCP_SERVER: MCPServer = {
  id: 'chart',
  name: 'Chart Generator',
  url: '',
  command: 'npx',
  args: ['-y', '@antv/mcp-server-chart'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: [],
};

export const FILESYSTEM_MCP_SERVER: MCPServer = {
  id: 'filesystem',
  name: 'Filesystem',
  url: '',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '$TMPDIR'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: [],
};

export const GITHUB_MCP_SERVER: MCPServer = {
  id: 'github',
  name: 'GitHub',
  url: '',
  command: 'docker',
  args: [
    'run',
    '-i',
    '--rm',
    '-e',
    'GITHUB_PERSONAL_ACCESS_TOKEN',
    'ghcr.io/github/github-mcp-server',
  ],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
};

export const GOOGLE_WORKSPACE_MCP_SERVER: MCPServer = {
  id: 'google-workspace',
  name: 'Google Workspace',
  url: '',
  command: 'uvx',
  args: ['workspace-mcp'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'],
};

export const KAGGLE_MCP_SERVER: MCPServer = {
  id: 'kaggle',
  name: 'Kaggle',
  url: '',
  command: 'npx',
  args: [
    '-y',
    'mcp-remote',
    'https://www.kaggle.com/mcp',
    '--header',
    'Authorization: Bearer ${KAGGLE_TOKEN}',
  ],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['KAGGLE_TOKEN'],
};

export const SLACK_MCP_SERVER: MCPServer = {
  id: 'slack',
  name: 'Slack',
  url: '',
  command: 'npx',
  args: ['-y', '@datalayer/slack-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID', 'SLACK_CHANNEL_IDS'],
};

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
  requiredEnvVars: ['TAVILY_API_KEY'],
};

// ============================================================================
// MCP Server Library
// ============================================================================

export const MCP_SERVER_LIBRARY: Record<string, MCPServer> = {
  alphavantage: ALPHAVANTAGE_MCP_SERVER,
  chart: CHART_MCP_SERVER,
  filesystem: FILESYSTEM_MCP_SERVER,
  github: GITHUB_MCP_SERVER,
  'google-workspace': GOOGLE_WORKSPACE_MCP_SERVER,
  kaggle: KAGGLE_MCP_SERVER,
  slack: SLACK_MCP_SERVER,
  tavily: TAVILY_MCP_SERVER,
};
