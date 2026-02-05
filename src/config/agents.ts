/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library.
 *
 * Predefined agent specifications that can be instantiated as AgentSpaces.
 */

import type { AgentSpec } from '../types';
import {
  TAVILY_MCP_SERVER,
  FILESYSTEM_MCP_SERVER,
  GITHUB_MCP_SERVER,
  SLACK_MCP_SERVER,
  KAGGLE_MCP_SERVER,
  ALPHAVANTAGE_MCP_SERVER,
  CHART_MCP_SERVER,
  GMAIL_MCP_SERVER,
  GDRIVE_MCP_SERVER,
} from './mcpServers';

// ============================================================================
// Agent Specs
// ============================================================================

export const DATA_ACQUISITION_AGENT_SPEC: AgentSpec = {
  id: 'data-acquisition',
  name: 'Data Acquisition Agent',
  description:
    'Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.',
  tags: ['data', 'acquisition', 'kaggle', 'filesystem'],
  enabled: true,
  mcpServers: [KAGGLE_MCP_SERVER, FILESYSTEM_MCP_SERVER],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'database',
  color: '#3B82F6', // Blue
  suggestions: [
    'Find popular machine learning datasets on Kaggle',
    'Download and explore a dataset for sentiment analysis',
    'List available files in my workspace',
    'Search Kaggle for time series forecasting competitions',
  ],
};

export const CRAWLER_AGENT_SPEC: AgentSpec = {
  id: 'crawler',
  name: 'Crawler Agent',
  description:
    'Web crawling and research agent that searches the web and GitHub repositories for information.',
  tags: ['web', 'search', 'research', 'crawler', 'github'],
  enabled: false,
  mcpServers: [TAVILY_MCP_SERVER, GITHUB_MCP_SERVER],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'globe',
  color: '#10B981', // Green
  suggestions: [
    'Search the web for recent news about AI agents',
    'Find trending open-source Python projects on GitHub',
    'Research best practices for building RAG applications',
    'Compare popular JavaScript frameworks in 2024',
  ],
};

export const GITHUB_AGENT_SPEC: AgentSpec = {
  id: 'github-agent',
  name: 'GitHub Agent',
  description:
    'Manages GitHub repositories, issues, and pull requests with email notification capabilities.',
  tags: ['github', 'git', 'code', 'email'],
  enabled: false,
  mcpServers: [GITHUB_MCP_SERVER, GMAIL_MCP_SERVER],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'git-branch',
  color: '#6366F1', // Indigo
  suggestions: [
    'List my open pull requests across all repositories',
    'Create an issue for a bug I found in datalayer/ui',
    'Show recent commits on the main branch',
    'Search for repositories related to Jupyter notebooks',
  ],
};

export const FINANCIAL_VIZ_AGENT_SPEC: AgentSpec = {
  id: 'financial-viz',
  name: 'Financial Visualization Agent',
  description:
    'Analyzes financial market data and creates visualizations and charts.',
  tags: ['finance', 'stocks', 'visualization', 'charts'],
  enabled: false,
  mcpServers: [ALPHAVANTAGE_MCP_SERVER, CHART_MCP_SERVER],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'trending-up',
  color: '#F59E0B', // Amber
  suggestions: [
    'Show me the stock price history for AAPL',
    'Create a chart comparing MSFT and GOOGL over the last year',
    'Analyze the trading volume trends for Tesla',
    'Get the latest market news for tech stocks',
  ],
};

export const INFORMATION_ROUTING_AGENT_SPEC: AgentSpec = {
  id: 'information-routing',
  name: 'Information Routing Agent',
  description:
    'Routes information between Google Drive and Slack, managing document workflows and team communication.',
  tags: ['workflow', 'communication', 'gdrive', 'slack'],
  enabled: false,
  mcpServers: [GDRIVE_MCP_SERVER, SLACK_MCP_SERVER],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'share-2',
  color: '#EC4899', // Pink
  suggestions: [
    'Find documents shared with me in Google Drive',
    "Send a summary of today's meeting notes to the #team channel",
    'List recent files in my Drive folder',
    'Post a reminder to Slack about the upcoming deadline',
  ],
};

// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
  'data-acquisition': DATA_ACQUISITION_AGENT_SPEC,
  crawler: CRAWLER_AGENT_SPEC,
  'github-agent': GITHUB_AGENT_SPEC,
  'financial-viz': FINANCIAL_VIZ_AGENT_SPEC,
  'information-routing': INFORMATION_ROUTING_AGENT_SPEC,
};

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[agentId];
}

/**
 * List all available agent specifications.
 */
export function listAgentSpecs(): AgentSpec[] {
  return Object.values(AGENT_SPECS);
}
