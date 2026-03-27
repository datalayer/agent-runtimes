/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent catalog hooks.
 *
 * Includes the Zustand catalog store and the agent registry hook.
 *
 * @module hooks/useAgentsCatalog
 */

import { create } from 'zustand';
import { listAgentSpecs } from '../specs';
import type { AgentRuntimeData, AgentSpec } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Agent Catalog Store
// ═══════════════════════════════════════════════════════════════════════════

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
 */

export type AgentCatalogStoreState = {
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

export const useAgentCatalogStore = create<AgentCatalogStoreState>()(set => ({
  agentSpecs: listAgentSpecs(),
  runningAgents: [],

  refreshSpecs: () => set({ agentSpecs: listAgentSpecs() }),

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
