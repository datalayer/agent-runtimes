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

import { AGENT_SPECS as ROOT_AGENTS } from './agents';

// Merge all agent specs from subfolders
export const AGENT_SPECS: Record<string, AgentSpec> = {
  ...ROOT_AGENTS,
};

function resolveAgentId(agentId: string): string {
  if (agentId in AGENT_SPECS) return agentId;
  const idx = agentId.lastIndexOf(':');
  if (idx > 0) {
    const base = agentId.slice(0, idx);
    if (base in AGENT_SPECS) return base;
  }
  return agentId;
}

/**
 * Get an agent specification by ID.
 */
export function getAgentSpecs(agentId: string): AgentSpec | undefined {
  return AGENT_SPECS[resolveAgentId(agentId)];
}

/**
 * List enabled agent specifications.
 *
 * @param prefix - Only return specs whose ID starts with this prefix.
 * @param includeDisabled - When `true`, include disabled specs.
 */
export function listAgentSpecs(
  prefix?: string,
  includeDisabled = false,
): AgentSpec[] {
  let specs = Object.values(AGENT_SPECS);
  if (!includeDisabled) {
    specs = specs.filter(s => s.enabled);
  }
  if (prefix !== undefined) {
    specs = specs.filter(s => s.id.startsWith(prefix));
  }
  return specs;
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
