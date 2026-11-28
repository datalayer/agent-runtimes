/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which agent a workspace runs, and how it presents itself.
 *
 * The agent is the one its application's blueprint names (`AgentBlueprint`,
 * an application's agentspec id), else the workspace's own agent id; its
 * presentation is the catalogue's light module of the agents that present
 * themselves (`specs/agentPresentations`). An agent that says no
 * presentation is refused, at once: a header that named it otherwise would
 * be the host's words, not its spec's.
 *
 * @module apps/plugins/agent-identity/agentOfWorkspace
 */

import { useContributions } from '@datalayer/reactor/react';
import {
  getAgentPresentation,
  type AgentPresentation,
} from '../../../specs/agentPresentations';
import { AgentBlueprint, type AgentWorkspaceContext } from '../../core';

/** An agent's id without its version (`worker-shopper:0.0.1` → `worker-shopper`). */
export const bareAgentId = (agentId: string): string => agentId.split(':')[0];

/** The agent a workspace runs: its application's, else its own id. */
export function useWorkspaceAgentId(
  workspace: Pick<AgentWorkspaceContext, 'agentId'> | undefined,
): string | undefined {
  const blueprint = useContributions(AgentBlueprint)[0]?.value;
  const agentId = blueprint?.specId ?? workspace?.agentId;
  return agentId ? bareAgentId(agentId) : undefined;
}

/** An agent's presentation; an agent that says none is refused. */
export function presentationOrFail(
  agentId: string | undefined,
): AgentPresentation {
  const presentation = agentId ? getAgentPresentation(agentId) : undefined;
  if (!presentation) {
    throw new Error(
      `The agent ${agentId ?? '(none)'} says no presentation in its specification: the title bar has nothing of its own to name it with.`,
    );
  }
  return presentation;
}
