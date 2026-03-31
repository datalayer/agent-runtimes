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

export const ALPHAVANTAGE_MCP_SERVER_0_0_1: MCPServer = {
  id: 'alphavantage',
  version: '0.0.1',
  name: 'Alpha Vantage',
  description: 'Financial market data and stock information',
  icon: 'graph',
  emoji: '💹',
  url: '',
  command: 'uvx',
  args: ['av-mcp==0.2.1', '${ALPHAVANTAGE_API_KEY}'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['ALPHAVANTAGE_API_KEY:0.0.1'],
};

export const CHART_MCP_SERVER_0_0_1: MCPServer = {
  id: 'chart',
  version: '0.0.1',
  name: 'Chart Generator',
  description: 'Generate charts and visualizations',
  icon: 'graph',
  emoji: '📊',
  url: '',
  command: 'npx',
  args: ['-y', '@antv/mcp-server-chart'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: [],
};

export const EARTHDATA_MCP_SERVER_0_0_1: MCPServer = {
  id: 'earthdata',
  version: '0.0.1',
  name: 'Earthdata MCP',
  description: 'Access NASA Earthdata search and metadata capabilities',
  icon: 'globe',
  emoji: '🌍',
  url: '',
  command: 'npx',
  args: ['-y', 'earthdata-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['EARTHDATA_USERNAME:0.0.1', 'EARTHDATA_PASSWORD:0.0.1'],
};

export const EURUS_MCP_SERVER_0_0_1: MCPServer = {
  id: 'eurus',
  version: '0.0.1',
  name: 'Eurus Climate MCP',
  description: 'Climate and reanalysis analysis tools for spatial workflows',
  icon: 'graph',
  emoji: '🌦️',
  url: '',
  command: 'eurus-mcp',
  args: [],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: [],
};

export const FILESYSTEM_MCP_SERVER_0_0_1: MCPServer = {
  id: 'filesystem',
  version: '0.0.1',
  name: 'Filesystem',
  description: 'Local filesystem read/write operations',
  icon: 'file-directory',
  emoji: '📁',
  url: '',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '$TMPDIR'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: [],
};

export const GITHUB_MCP_SERVER_0_0_1: MCPServer = {
  id: 'github',
  version: '0.0.1',
  name: 'GitHub',
  description: 'GitHub repository operations (issues, PRs, code search)',
  icon: 'mark-github',
  emoji: '🐙 - git - collaboration',
  url: '',
  command: 'docker',
  args: ['run', '-i', '--rm', '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN', 'ghcr.io/github/github-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['GITHUB_TOKEN:0.0.1'],
};

export const GOOGLE_WORKSPACE_MCP_SERVER_0_0_1: MCPServer = {
  id: 'google-workspace',
  version: '0.0.1',
  name: 'Google Workspace',
  description: 'Google Drive, Gmail, Calendar, and Docs integration',
  icon: 'mail',
  emoji: '📧',
  url: '',
  command: 'uvx',
  args: ['workspace-mcp'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['GOOGLE_OAUTH_CLIENT_ID:0.0.1', 'GOOGLE_OAUTH_CLIENT_SECRET:0.0.1'],
};

export const HUGGINGFACE_MCP_SERVER_0_0_1: MCPServer = {
  id: 'huggingface',
  version: '0.0.1',
  name: 'Hugging Face',
  description: 'Hugging Face models, datasets, spaces, and papers access',
  icon: 'brain',
  emoji: '🤗',
  url: '',
  command: 'npx',
  args: ['-y', 'mcp-remote', 'https://huggingface.co/mcp', '--header', 'Authorization: Bearer ${HF_TOKEN}'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['HF_TOKEN:0.0.1'],
};

export const KAGGLE_MCP_SERVER_0_0_1: MCPServer = {
  id: 'kaggle',
  version: '0.0.1',
  name: 'Kaggle',
  description: 'Kaggle datasets, models, competitions, and notebooks access',
  icon: 'database',
  emoji: '📊',
  url: '',
  command: 'npx',
  args: ['-y', 'mcp-remote', 'https://www.kaggle.com/mcp', '--header', 'Authorization: Bearer ${KAGGLE_TOKEN}'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['KAGGLE_TOKEN:0.0.1'],
};

export const SALESFORCE_MCP_SERVER_0_0_1: MCPServer = {
  id: 'salesforce',
  version: '0.0.1',
  name: 'Salesforce',
  description: 'Salesforce CRM operations (queries, reports, objects, SOQL)',
  icon: 'briefcase',
  emoji: '☁️',
  url: '',
  command: 'npx',
  args: ['-y', '@anthropic/salesforce-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['SALESFORCE_ACCESS_TOKEN:0.0.1', 'SALESFORCE_INSTANCE_URL:0.0.1'],
};

export const SLACK_MCP_SERVER_0_0_1: MCPServer = {
  id: 'slack',
  version: '0.0.1',
  name: 'Slack',
  description: 'Slack messaging and channel operations',
  icon: 'comment-discussion',
  emoji: '💬',
  url: '',
  command: 'npx',
  args: ['-y', '@datalayer/slack-mcp-server'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['SLACK_BOT_TOKEN:0.0.1', 'SLACK_TEAM_ID:0.0.1', 'SLACK_CHANNEL_IDS:0.0.1'],
};

export const TAVILY_MCP_SERVER_0_0_1: MCPServer = {
  id: 'tavily',
  version: '0.0.1',
  name: 'Tavily Search',
  description: 'Web search and research capabilities via Tavily API',
  icon: 'search',
  emoji: '🔍',
  url: '',
  command: 'npx',
  args: ['-y', 'tavily-mcp'],
  transport: 'stdio',
  enabled: true,
  isAvailable: false,
  tools: [],
  requiredEnvVars: ['TAVILY_API_KEY:0.0.1'],
};

// ============================================================================
// MCP Server Library
// ============================================================================

export const MCP_SERVER_LIBRARY: Record<string, MCPServer> = {
  alphavantage: ALPHAVANTAGE_MCP_SERVER_0_0_1,
  chart: CHART_MCP_SERVER_0_0_1,
  earthdata: EARTHDATA_MCP_SERVER_0_0_1,
  eurus: EURUS_MCP_SERVER_0_0_1,
  filesystem: FILESYSTEM_MCP_SERVER_0_0_1,
  github: GITHUB_MCP_SERVER_0_0_1,
  'google-workspace': GOOGLE_WORKSPACE_MCP_SERVER_0_0_1,
  huggingface: HUGGINGFACE_MCP_SERVER_0_0_1,
  kaggle: KAGGLE_MCP_SERVER_0_0_1,
  salesforce: SALESFORCE_MCP_SERVER_0_0_1,
  slack: SLACK_MCP_SERVER_0_0_1,
  tavily: TAVILY_MCP_SERVER_0_0_1,
};
