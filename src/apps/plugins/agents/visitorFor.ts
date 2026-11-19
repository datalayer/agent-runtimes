/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a visitor's key for an in-page agent is for.
 *
 * ai-inference serves a visitor's key the models of what it names — an
 * application, a team, a scene or a Battle — and mints none for nothing. The
 * host says it (`visitorFor`); a workspace with a team and nothing said names
 * its team.
 *
 * @module apps/plugins/agents/visitorFor
 */

import type { AgentsConfig } from './plugin';

/** What a visitor's key is for: what the host said, else `team:<teamId>`, else `''` (no key). */
export function visitorForOf(
  config: Pick<AgentsConfig, 'visitorFor' | 'teamId'> | undefined,
): string {
  if (config?.visitorFor) {
    return config.visitorFor;
  }
  return config?.teamId ? `team:${config.teamId}` : '';
}
