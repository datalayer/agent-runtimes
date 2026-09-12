/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agents catalog hooks.
 *
 * Includes the Zustand catalog store and the agent registry hook.
 *
 * @module hooks/useAgentsCatalog
 */

import { create } from 'zustand';
import { listAgentspecs } from '../specs';
import type { AgentRuntimeData, Agentspec } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Agent Catalog Store
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Centralised Zustand store for agents.
 *
 * Two collections are maintained:
 *
 * 1. **agentspecs** – the static catalogue of available agent blueprints
 *    (from `@datalayer/agent-runtimes/lib/specs`).
 *    Populated once at import time; call `refreshSpecs()` to re-read.
 *
 * 2. **runningAgents** – live agent runtimes fetched from the runtimes
 *    service.  Updated via `setRunningAgents()` whenever the TanStack
 *    query refreshes.
 */

export type AgentCatalogStoreState = {
  /** Static catalogue of agent blueprints. */
  agentspecs: Agentspec[];

  /** Live agent runtimes (running / starting). */
  runningAgents: AgentRuntimeData[];

  // ---- Mutators ----

  /** Re-read agent specs from the config. */
  refreshSpecs: () => void;

  /** Replace the running agents list (call from TanStack query effect). */
  setRunningAgents: (agents: AgentRuntimeData[]) => void;
};

/** Whether two agent lists name the same agents, in the same state. */
const sameAgents = (
  before: AgentRuntimeData[],
  after: AgentRuntimeData[],
): boolean =>
  before.length === after.length &&
  before.every((agent, index) => {
    const other = after[index];
    return (
      agent === other ||
      (agent.id === other.id &&
        agent.runtime_name === other.runtime_name &&
        agent.status === other.status &&
        agent.agentSpec === other.agentSpec)
    );
  });

export const useAgentCatalogStore = create<AgentCatalogStoreState>()(set => ({
  agentspecs: listAgentspecs(),
  runningAgents: [],

  refreshSpecs: () => set({ agentspecs: listAgentspecs() }),

  /*
   * The same agents twice is not a change.
   *
   * This is a global store, and the caller is a layout that recomputes its
   * list whenever the runtimes poll — so `agents` is a fresh array many times
   * a minute even when nothing about the agents differs. Storing it
   * unconditionally gave every consumer a new identity each time, which is a
   * re-render each time for a list that has not moved; and a consumer whose
   * own effect writes back closes the circle into a render loop.
   *
   * So the previous array is kept when the same agents are still there, in
   * the same order, with the same status. Comparing by that triple rather
   * than deeply because it is what a reader of this list acts on, and what
   * the poll actually changes.
   */
  setRunningAgents: agents =>
    set(state => {
      const resolved = agents.map(agent => {
        if (agent.agentSpec) return agent;
        if (!agent.agent_spec_id) return agent;
        const spec = state.agentspecs.find(s => s.id === agent.agent_spec_id);
        return spec ? { ...agent, agentSpec: spec } : agent;
      });
      return sameAgents(state.runningAgents, resolved)
        ? {}
        : { runningAgents: resolved };
    }),
}));
