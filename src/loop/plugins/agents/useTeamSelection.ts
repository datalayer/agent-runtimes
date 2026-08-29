/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reading the team selection from anywhere in the workspace.
 *
 * The same shape as `useSandboxService`: the plugin publishes it as output,
 * and whoever needs it asks the reactor rather than being handed it down a
 * prop chain that would have to pass through views that do not care.
 *
 * @module loop/plugins/agents/useTeamSelection
 */

import { useReactorPlatform } from '@datalayer/reactor/react';

import { AGENTS_PLUGIN_NAME, type AgentsOutput } from './plugin';
import type { TeamSelection } from './team';

/**
 * The team selection, or `undefined`.
 *
 * Optional by design rather than by oversight: most workspaces run a single
 * agent and have no team at all, and a hook that threw for them would make
 * teams a requirement instead of a feature.
 */
export function useOptionalTeamSelection(): TeamSelection | undefined {
  const reactor = useReactorPlatform();
  return reactor.getOutput<AgentsOutput>(AGENTS_PLUGIN_NAME)?.team;
}

export default useOptionalTeamSelection;
