/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { create } from 'zustand';
import { listAgentSpecs } from '../specs';
import type { AgentSpec } from '../types';
import type { AgentRuntimeData } from './useAgentRuntimes';

/**
 * Centralised Zustand store for agents.
 *
 * Two collections are maintained:
 *
 * 1. **agentSpecs** – the static catalogue of available agent blueprints
 *    (from `@datalayer/agent-runtimes/lib/specs`).
 *    Populated once at import time; call `refreshSpecs()` to re-read.
 *
 * 2. **runningAgents** – live agent runtimes fetched from the runtimes
 *    service.  Updated via `setRunningAgents()` whenever the TanStack
 *    query refreshes.
 *
 * The store is consumed by `AgentAssignMenu` to show two action groups:
 * • **Running Agents** – already-running runtimes that can be re-attached
 * • **New Agents** – agent specs that can be instantiated
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentStoreState = {
  /** Static catalogue of agent blueprints. */
  agentSpecs: AgentSpec[];

  /** Live agent runtimes (running / starting). */
  runningAgents: AgentRuntimeData[];

  // ---- Mutators ----

  /** Re-read agent specs from the config. */
  refreshSpecs: () => void;

  /** Replace the running agents list (call from TanStack query effect). */
  setRunningAgents: (agents: AgentRuntimeData[]) => void;
};

// ── Store ──────────────────────────────────────────────────────────────────

export const useAgentCatalogStore = create<AgentStoreState>()(set => ({
  agentSpecs: listAgentSpecs('datalayer-ai/'),
  runningAgents: [],

  refreshSpecs: () => set({ agentSpecs: listAgentSpecs('datalayer-ai/') }),

  setRunningAgents: agents =>
    set(state => ({
      runningAgents: agents.map(agent => {
        if (agent.agentSpec) return agent;
        if (!agent.agent_spec_id) return agent;
        const spec = state.agentSpecs.find(s => s.id === agent.agent_spec_id);
        return spec ? { ...agent, agentSpec: spec } : agent;
      }),
    })),
}));
