/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a member of a team runs on, as its details say it: its harness, its
 * model, and what its application does.
 *
 * @module components/teams/memberHarness
 */

import { getAgentspecs } from '../../specs/agents';
import { getHarness } from '../../specs/harnesses';
import type { AppSpec } from '../../types/agentspecs';

/** The harness a member runs on. */
export type MemberHarness = { id: string; name: string };

/** The agent loop in the page: a member in the browser, whatever its spec names. */
export const BROWSER_HARNESS: MemberHarness = {
  id: 'browser',
  name: 'Datalayer Loop',
};

/** What an agent spec runs on when it names no harness. */
const DEFAULT_HARNESS: MemberHarness = {
  id: 'pydantic-ai',
  name: 'Pydantic AI',
};

/** The harness an application runs on, read from its agent's spec. */
export function memberHarnessOf(
  app: Pick<AppSpec, 'agent'>,
  runsIn: 'browser' | 'runtime',
): MemberHarness {
  if (runsIn === 'browser') {
    return BROWSER_HARNESS;
  }
  const id = getAgentspecs(app.agent)?.harness;
  if (!id || id === DEFAULT_HARNESS.id) {
    return DEFAULT_HARNESS;
  }
  return { id, name: getHarness(id)?.name ?? id };
}

/** What a member's details say of its application. */
export function memberAppDetails(
  app: Pick<AppSpec, 'agent' | 'description' | 'model'>,
  runsIn: 'browser' | 'runtime',
): { description: string; harness: MemberHarness; model?: string } {
  const model = app.model || getAgentspecs(app.agent)?.model;
  return {
    description: app.description,
    harness: memberHarnessOf(app, runsIn),
    ...(model ? { model } : {}),
  };
}
