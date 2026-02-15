/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library - Subfolder Organization.
 *
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

import type { AgentSpec } from '../../types';

import { AGENT_SPECS as CODEAI_AGENTS } from './codeai';
import { AGENT_SPECS as CODEMODE_PAPER_AGENTS } from './codemode-paper';
import { AGENT_SPECS as DATALAYER_AI_AGENTS } from './datalayer-ai';

// Merge all agent specs from subfolders
export const AGENT_SPECS: Record<string, AgentSpec> = {
  ...CODEAI_AGENTS,
  ...CODEMODE_PAPER_AGENTS,
  ...DATALAYER_AI_AGENTS,
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
