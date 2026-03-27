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

import { useAgentStore } from '../stores/agentsStore';

export function useAgentRegistry() {
  const agents = useAgentStore(state => state.agents);
  const upsertAgent = useAgentStore(state => state.upsertAgent);
  const deleteAgent = useAgentStore(state => state.deleteAgent);
  const getAgentById = useAgentStore(state => state.getAgentById);
  return { agents, upsertAgent, deleteAgent, getAgentById };
}
