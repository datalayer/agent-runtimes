/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent Library - Subfolder Organization.
 *
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

import type { Agentspec } from '../../types';

import { AGENTSPECS as ROOT_AGENTS } from './agents';

// Merge all agent specs from subfolders
export const AGENTSPECS: Record<string, Agentspec> = {
  ...ROOT_AGENTS,
};

function resolveAgentId(agentId: string): string {
  if (agentId in AGENTSPECS) return agentId;
  const idx = agentId.lastIndexOf(':');
  if (idx > 0) {
    const base = agentId.slice(0, idx);
    if (base in AGENTSPECS) return base;
  }
  return agentId;
}

/**
 * Get an agent specification by ID.
 */
export function getAgentspecs(agentId: string): Agentspec | undefined {
  return AGENTSPECS[resolveAgentId(agentId)];
}

/**
 * List all available agent specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listAgentspecs(prefix?: string): Agentspec[] {
  const specs = Object.values(AGENTSPECS);
  return prefix !== undefined
    ? specs.filter(s => s.id.startsWith(prefix))
    : specs;
}

/**
 * Collect all required environment variables for an agent spec.
 */
export function getAgentspecRequiredEnvVars(spec: Agentspec): string[] {
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
