/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What this workspace is talking to, in its own header.
 *
 * The examples shell drew this for every example from a store it kept itself,
 * which worked while an example *was* the agent. This workspace is not: the
 * agent it addresses is chosen inside it, by this plugin, and can change
 * without the page around it knowing — so a summary assembled outside was
 * describing a session it could not see.
 *
 * Assembled here instead, from the sandbox service and the workspace context,
 * and contributed to the workspace's own header like every other control.
 *
 * @module loop/plugins/agents/AgentSummaryPanel
 */

import type { JSX } from 'react';
import type { ReadonlySignal } from '@datalayer/reactor';
import { useSignalValue } from '@datalayer/reactor/react';

import { AgentSummary } from '../../../components/agents/AgentSummary';
import type { AgentSummaryData } from '../../../components/agents/AgentSummary';
import { AGENTSPECS } from '../../../specs/agents/agents';
import type { LoopWorkspaceContext } from '../../core';
import { TARGET_SPECS, type SandboxTarget } from './switchable';
import { useSandboxService } from './useSandboxService';
import type { TeamMember } from './team';
import { useOptionalTeamSelection } from './useTeamSelection';

/* Stand-ins for a workspace with no sandbox plugin or no team. `peek` as well
   as `value`: `useSignalValue` subscribes, and a bare object is not a signal. */
const NO_TARGET: ReadonlySignal<SandboxTarget | undefined> = {
  value: undefined,
  peek: () => undefined,
};
const NO_MEMBER: ReadonlySignal<TeamMember | undefined> = {
  value: undefined,
  peek: () => undefined,
};

export function AgentSummaryPanel({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const service = useSandboxService();
  const target = useSignalValue(service?.target ?? NO_TARGET);
  const team = useOptionalTeamSelection();
  const active = useSignalValue(team?.active ?? NO_MEMBER);

  if (!service) {
    return null;
  }

  const snapshot = workspace.sandbox;
  /*
   * The member being addressed, when there is a team; the workspace's agent
   * otherwise. The two differ precisely when a team is in play, and the one a
   * prompt reaches is the one worth naming.
   */
  const specId = active?.specId || workspace.agentId;
  const spec = AGENTSPECS[specId];

  const summary: AgentSummaryData = {
    agentName: active?.name || spec?.name || workspace.agentId,
    location: target ? TARGET_SPECS[target].label : '—',
    specId,
    harness: spec?.harness,
    // Where it runs and what turns its loop, as the workspace has it. The
    // sandbox reports the second half; `variant` is the pair.
    variant: snapshot.variant,
    status: snapshot.state,
    baseUrl: snapshot.agentBaseUrl || workspace.serverUrl,
    sandboxBaseUrl: snapshot.jupyterUrl,
    agentId: workspace.agentId,
    isReady: snapshot.state === 'running',
  };

  return <AgentSummary summary={summary} />;
}

export default AgentSummaryPanel;
