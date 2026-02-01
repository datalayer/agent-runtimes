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
  environmentName: 'ai-agents',
  icon: 'database',
  color: '#3B82F6', // Blue
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
  environmentName: 'ai-agents',
  icon: 'globe',
  color: '#10B981', // Green
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
  environmentName: 'ai-agents',
  icon: 'git-branch',
  color: '#6366F1', // Indigo
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
  environmentName: 'ai-agents',
  icon: 'trending-up',
  color: '#F59E0B', // Amber
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
  environmentName: 'ai-agents',
  icon: 'share-2',
  color: '#EC4899', // Pink
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
