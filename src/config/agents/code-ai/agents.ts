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

import type { AgentSpec } from '../../types';
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
import {
  CRAWL_SKILL_SPEC,
  GITHUB_SKILL_SPEC,
  PDF_SKILL_SPEC,
} from '../../skills';
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
  crawl: CRAWL_SKILL_SPEC,
  github: GITHUB_SKILL_SPEC,
  pdf: PDF_SKILL_SPEC,
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

// Code Ai Agents
// ============================================================================

export const SIMPLE_AGENT_SPEC: AgentSpec = {
  id: 'code-ai/simple',
  name: 'A Simple Agent',
  description: `A simple conversational agent. No tools, no MCP servers, no skills — just a helpful AI assistant you can chat with.`,
  tags: ['simple', 'chat', 'assistant'],
  enabled: true,
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
  systemPrompt: `You are a helpful, friendly AI assistant. You do not have access to any external tools, MCP servers, or skills. Answer questions using your training knowledge, be concise, and let the user know if a question is outside your knowledge.
`,
  systemPromptCodemodeAddons: undefined,
};

// ============================================================================
// Agent Specs Registry
// ============================================================================

export const AGENT_SPECS: Record<string, AgentSpec> = {
  // Code Ai
  'code-ai/simple': SIMPLE_AGENT_SPEC,
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
