/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Team Library - Subfolder Organization.
 *
 * THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.
 */

import type { TeamSpec } from '../../types';

import { TEAM_SPECS as ROOT_TEAMS } from './teams';

// Merge all team specs from subfolders
export const TEAM_SPECS: Record<string, TeamSpec> = {
  ...ROOT_TEAMS,
};

function resolveTeamId(teamId: string): string {
  if (teamId in TEAM_SPECS) return teamId;
  const idx = teamId.lastIndexOf(':');
  if (idx > 0) {
    const base = teamId.slice(0, idx);
    if (base in TEAM_SPECS) return base;
  }
  return teamId;
}

/**
 * Get a team specification by ID.
 */
export function getTeamSpec(teamId: string): TeamSpec | undefined {
  return TEAM_SPECS[resolveTeamId(teamId)];
}

/**
 * List all available team specifications.
 *
 * @param prefix - If provided, only return specs whose ID starts with this prefix.
 */
export function listTeamSpecs(prefix?: string): TeamSpec[] {
  const specs = Object.values(TEAM_SPECS);
  return prefix !== undefined
    ? specs.filter(s => s.id.startsWith(prefix))
    : specs;
}
