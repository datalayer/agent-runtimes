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

import type { AgentSpec } from '../../../types/Types';
import {
  FILESYSTEM_MCP_SERVER,
  KAGGLE_MCP_SERVER,
  TAVILY_MCP_SERVER,
} from '../../mcpServers';
import { GITHUB_SKILL_SPEC } from '../../skills';
import type { SkillSpec } from '../../skills';

// ============================================================================
// MCP Server Lookup
// ============================================================================

const MCP_SERVER_MAP: Record<string, any> = {
  filesystem: FILESYSTEM_MCP_SERVER,
  kaggle: KAGGLE_MCP_SERVER,
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

// Codeai Agents
// ============================================================================

export const DATA_ACQUISITION_AGENT_SPEC: AgentSpec = {
  id: 'codeai/data-acquisition',
  name: 'Data Acquisition Agent',
  description: `Acquires and manages data from various sources including Kaggle datasets and local filesystem operations.`,
  tags: ['data', 'acquisition', 'kaggle', 'filesystem'],
  enabled: true,
  model: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
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
  sandboxVariant: 'jupyter',
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

export const SIMPLE_AGENT_SPEC: AgentSpec = {
  id: 'codeai/simple',
  name: 'A Simple Agent',
  description: `A simple conversational agent. No tools, no MCP servers, no skills — just a helpful AI assistant you can chat with.`,
  tags: ['simple', 'chat', 'assistant'],
  enabled: true,
  model: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  mcpServers: [],
  skills: [],
  environmentName: 'ai-agents-env',
  icon: 'share-2',
  emoji: '🤖',
  color: '#6366F1',
  suggestions: [
    'Tell me a joke',
    'Explain quantum computing in simple terms',
    'Help me brainstorm ideas for a weekend project',
    'Summarize the key points of a topic I describe',
  ],
  sandboxVariant: 'jupyter',
  systemPrompt: `You are a helpful, friendly AI assistant. You do not have access to any external tools, MCP servers, or skills. Answer questions using your training knowledge, be concise, and let the user know if a question is outside your knowledge.
`,
  systemPromptCodemodeAddons: undefined,
};

// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
  // Codeai
  'codeai/data-acquisition': DATA_ACQUISITION_AGENT_SPEC,
  'codeai/simple': SIMPLE_AGENT_SPEC,
};

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[agentId];
}

/**
 * List all available agent specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listAgentSpecs(prefix?: string): AgentSpec[] {
  const specs = Object.values(AGENT_SPECS);
  return prefix !== undefined
    ? specs.filter(s => s.id.startsWith(prefix))
    : specs;
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
