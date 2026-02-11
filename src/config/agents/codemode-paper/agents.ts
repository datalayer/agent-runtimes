/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library.
 *
 * Predefined agent specifications that can be instantiated as AgentSpaces.
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 * Generated from YAML specifications in specs/agents/
 */

import type { AgentSpec } from '../../../types';
import {
  ALPHAVANTAGE_MCP_SERVER,
  CHART_MCP_SERVER,
  FILESYSTEM_MCP_SERVER,
  GITHUB_MCP_SERVER,
  GOOGLE_WORKSPACE_MCP_SERVER,
  KAGGLE_MCP_SERVER,
  SLACK_MCP_SERVER,
  TAVILY_MCP_SERVER,
} from '../../mcpServers';
import { GITHUB_SKILL_SPEC } from '../../skills';
import type { SkillSpec } from '../../skills';

// ============================================================================
// MCP Server Lookup
// ============================================================================

const MCP_SERVER_MAP: Record<string, any> = {
  alphavantage: ALPHAVANTAGE_MCP_SERVER,
  chart: CHART_MCP_SERVER,
  filesystem: FILESYSTEM_MCP_SERVER,
  github: GITHUB_MCP_SERVER,
  'google-workspace': GOOGLE_WORKSPACE_MCP_SERVER,
  kaggle: KAGGLE_MCP_SERVER,
  slack: SLACK_MCP_SERVER,
  tavily: TAVILY_MCP_SERVER,
};

/**
 * Map skill IDs to SkillSpec objects, converting to AgentSkillSpec shape.
 */
const SKILL_MAP: Record<string, any> = {
  github: GITHUB_SKILL_SPEC,
};

function toAgentSkillSpec(skill: SkillSpec) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: '1.0.0',
    tags: skill.tags,
    enabled: skill.enabled,
    requiredEnvVars: skill.requiredEnvVars,
  };
}

// ============================================================================
// Agent Specs
// ============================================================================

// Codemode Paper Agents
// ============================================================================

export const CRAWLER_AGENT_SPEC: AgentSpec = {
  id: 'codemode-paper/crawler',
  name: 'Crawler Agent',
  description: `Web crawling and research agent that searches the web and GitHub repositories for information.`,
  tags: ['web', 'search', 'research', 'crawler', 'github'],
  enabled: false,
  mcpServers: [MCP_SERVER_MAP['tavily'], MCP_SERVER_MAP['github']],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'globe',
  emoji: '🌐',
  color: '#10B981',
  suggestions: [
    'Search the web for recent news about AI agents',
    'Find trending open-source Python projects on GitHub',
    'Research best practices for building RAG applications',
    'Compare popular JavaScript frameworks in 2024',
  ],
  systemPrompt: `You are a web crawling and research assistant with access to Tavily search and GitHub tools. Use Tavily to search the web for current information and search GitHub repositories for relevant projects. Synthesize information from multiple sources and provide clear summaries with sources cited.
`,
  systemPromptCodemodeAddons: `## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: \`from generated.servers.<server_name> import <function_name>\`
   NEVER use \`import *\` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
`,
};

export const DATA_ACQUISITION_AGENT_SPEC: AgentSpec = {
  id: 'codemode-paper/data-acquisition',
  name: 'Data Acquisition Agent',
  description: `Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.`,
  tags: ['data', 'acquisition', 'kaggle', 'filesystem'],
  enabled: true,
  mcpServers: [
    MCP_SERVER_MAP['kaggle'],
    MCP_SERVER_MAP['filesystem'],
    MCP_SERVER_MAP['tavily'],
  ],
  skills: [toAgentSkillSpec(SKILL_MAP['github'])],
  environmentName: 'ai-agents-env',
  icon: 'database',
  emoji: '📊',
  color: '#3B82F6',
  suggestions: [
    'Find popular machine learning datasets on Kaggle',
    'Download and explore a dataset for sentiment analysis',
    'List available files in my workspace',
    'Search Kaggle for time series forecasting competitions',
  ],
  systemPrompt: `You are a data acquisition specialist with access to Kaggle datasets and filesystem tools. You can search for datasets, download data, read and write files, and help users prepare data for analysis. Guide users through finding relevant datasets and organizing their workspace efficiently.
`,
  systemPromptCodemodeAddons: `## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: \`from generated.servers.<server_name> import <function_name>\`
   NEVER use \`import *\` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
`,
};

export const FINANCIAL_VIZ_AGENT_SPEC: AgentSpec = {
  id: 'codemode-paper/financial-viz',
  name: 'Financial Visualization Agent',
  description: `Analyzes financial market data and creates visualizations and charts.`,
  tags: ['finance', 'stocks', 'visualization', 'charts'],
  enabled: false,
  mcpServers: [MCP_SERVER_MAP['alphavantage'], MCP_SERVER_MAP['chart']],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'trending-up',
  emoji: '📈',
  color: '#F59E0B',
  suggestions: [
    'Show me the stock price history for AAPL',
    'Create a chart comparing MSFT and GOOGL over the last year',
    'Analyze the trading volume trends for Tesla',
    'Get the latest market news for tech stocks',
  ],
  systemPrompt: `You are a financial market analyst with access to Alpha Vantage market data and chart generation tools. You can fetch stock prices, analyze trading volumes, create visualizations, and track market trends. Provide clear insights with relevant data points and generate charts to illustrate patterns.
`,
  systemPromptCodemodeAddons: `## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: \`from generated.servers.<server_name> import <function_name>\`
   NEVER use \`import *\` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
`,
};

export const GITHUB_AGENT_SPEC: AgentSpec = {
  id: 'codemode-paper/github-agent',
  name: 'GitHub Agent',
  description: `Manages GitHub repositories, issues, and pull requests with email notification capabilities.`,
  tags: ['github', 'git', 'code', 'email'],
  enabled: false,
  mcpServers: [MCP_SERVER_MAP['github'], MCP_SERVER_MAP['google-workspace']],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'git-branch',
  emoji: '🐙',
  color: '#6366F1',
  suggestions: [
    'List my open pull requests across all repositories',
    'Create an issue for a bug I found in datalayer/ui',
    'Show recent commits on the main branch',
    'Search for repositories related to Jupyter notebooks',
  ],
  systemPrompt: `You are a GitHub assistant with access to GitHub repository tools and Google Workspace for email notifications. You can list and search repositories, issues, and pull requests, create new issues, review PRs, search code, and send email notifications. Always confirm repository names before creating issues/PRs and provide clear summaries when listing multiple items.
`,
  systemPromptCodemodeAddons: `## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: \`from generated.servers.<server_name> import <function_name>\`
   NEVER use \`import *\` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
`,
};

export const INFORMATION_ROUTING_AGENT_SPEC: AgentSpec = {
  id: 'codemode-paper/information-routing',
  name: 'Information Routing Agent',
  description: `Routes information between Google Drive and Slack, managing document workflows and team communication.`,
  tags: ['workflow', 'communication', 'gdrive', 'slack'],
  enabled: false,
  mcpServers: [MCP_SERVER_MAP['google-workspace'], MCP_SERVER_MAP['slack']],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'share-2',
  emoji: '🔀',
  color: '#EC4899',
  suggestions: [
    'Find documents shared with me in Google Drive',
    "Send a summary of today's meeting notes to the",
    'List recent files in my Drive folder',
    'Post a reminder to Slack about the upcoming deadline',
  ],
  systemPrompt: `You are an information routing specialist with access to Google Drive and Slack tools. You can find and manage documents in Drive, send messages to Slack channels, and automate workflows between these platforms. Help users coordinate team communication and document management efficiently. Use "#" to denote Slack channels. Do not use file extension when referring to Google Drive documents.
`,
  systemPromptCodemodeAddons: `## IMPORTANT: Be Honest About Your Capabilities NEVER claim to have tools or capabilities you haven't verified.
## Core Codemode Tools Use these 4 tools to accomplish any task: 1. **list_servers** - List available MCP servers
   Use this to see what MCP servers you can access.

2. **search_tools** - Progressive tool discovery by natural language query
   Use this to find relevant tools before executing tasks.

3. **get_tool_details** - Get full tool schema and documentation
   Use this to understand tool parameters before calling them.

4. **execute_code** - Run Python code that composes multiple tools
   Use this for complex multi-step operations. Code runs in a PERSISTENT sandbox.
   Variables, functions, and state PERSIST between execute_code calls.
   Import tools using: \`from generated.servers.<server_name> import <function_name>\`
   NEVER use \`import *\` - always use explicit named imports.

## Recommended Workflow 1. **Discover**: Use list_servers and search_tools to find relevant tools 2. **Understand**: Use get_tool_details to check parameters 3. **Execute**: Use execute_code to perform multi-step tasks, calling tools as needed
## Token Efficiency When possible, chain multiple tool calls in a single execute_code block. This reduces output tokens by processing intermediate results in code rather than returning them. If you want to examine results, print subsets, preview (maximum 20 first characters) and/or counts instead of full data, this is really important.
`,
};

// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
  // Codemode Paper
  'codemode-paper/crawler': CRAWLER_AGENT_SPEC,
  'codemode-paper/data-acquisition': DATA_ACQUISITION_AGENT_SPEC,
  'codemode-paper/financial-viz': FINANCIAL_VIZ_AGENT_SPEC,
  'codemode-paper/github-agent': GITHUB_AGENT_SPEC,
  'codemode-paper/information-routing': INFORMATION_ROUTING_AGENT_SPEC,
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

/**
 * Collect all required environment variables for an agent spec.
 *
 * Iterates over the spec's MCP servers and skills and returns the
 * deduplicated union of their `requiredEnvVars` arrays.
 */
export function getAgentSpecRequiredEnvVars(spec: AgentSpec): string[] {
  const vars = new Set<string>();
  for (const server of spec.mcpServers) {
    for (const v of server.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  for (const skill of spec.skills) {
    for (const v of skill.requiredEnvVars ?? []) {
      vars.add(v);
    }
  }
  return Array.from(vars);
}
