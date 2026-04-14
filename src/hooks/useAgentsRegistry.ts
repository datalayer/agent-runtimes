/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hook exposing the agent registry from the Zustand store.
 *
 * Provides CRUD operations on the in-memory agent map without coupling
 * consumers directly to the low-level store.
 *
 * @module hooks/useAgentsRegistry
 */

import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

export function useAgentRegistry() {
  const agents = useAgentRuntimeStore(state => state.agents);
  const upsertAgent = useAgentRuntimeStore(state => state.upsertAgent);
  const deleteAgent = useAgentRuntimeStore(state => state.deleteAgent);
  const getAgentById = useAgentRuntimeStore(state => state.getAgentById);
  return { agents, upsertAgent, deleteAgent, getAgentById };
}
