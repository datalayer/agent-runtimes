/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent catalog hooks.
 *
 * Includes the Zustand catalog store, AI Agents REST API hooks,
 * notebook agent management, and the agent registry hook.
 *
 * @module hooks/useAgentsCatalog
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { URLExt } from '@jupyterlab/coreutils';
import { useAgentStore } from '../state/substates/AgentState';
import type { AgentRuntimeData } from '../types/agents';
import type { AgentSpec } from '../types';
import { listAgentSpecs } from '../specs';

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

// ═══════════════════════════════════════════════════════════════════════════
// AI Agents REST API hook.
// ═══════════════════════════════════════════════════════════════════════════

export type RequestOptions = {
  signal?: AbortSignal;
  baseUrl?: string;
};

export type RoomType = 'notebook_persist' | 'notebook_memory' | 'doc_memory';

export const useAIAgents = (baseUrlOverride = 'api/ai-agents/v1') => {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const createAIAgent = (
    documentId: string,
    documentType: RoomType,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'POST',
      body: {
        document_id: documentId,
        document_type: documentType,
        runtime: {
          ingress,
          token,
          kernel_id: kernelId,
        },
      },
      signal,
    });
  };
  const getAIAgents = ({
    signal,
    baseUrl = baseUrlOverride,
  }: RequestOptions = {}) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'GET',
      signal,
    });
  };
  const deleteAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'DELETE',
      signal,
    });
  };
  const getAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'GET',
      signal,
    });
  };
  const patchAIAgent = (
    documentId: string,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'PATCH',
      body: {
        runtime:
          ingress && token && kernelId
            ? {
                ingress,
                token,
                kernel_id: kernelId,
              }
            : null,
      },
      signal,
    });
  };
  return {
    createAIAgent,
    getAIAgents,
    deleteAIAgent,
    getAIAgent,
    patchAIAgent,
  };
};

/**
 * Get the notebook AI agent if any.
 *
 * This performs a periodic liveness check and keeps the local store in sync.
 */
export function useNotebookAgents(notebookId: string) {
  const { getAIAgent } = useAIAgents();
  const agents = useAgentStore(state => state.agents);
  const upsertAgent = useAgentStore(state => state.upsertAgent);
  const deleteAgent = useAgentStore(state => state.deleteAgent);
  const getAgentById = useAgentStore(state => state.getAgentById);

  useEffect(() => {
    let abortController: AbortController;

    const refreshAIAgent = async () => {
      abortController = new AbortController();
      try {
        const response = await getAIAgent(notebookId, {
          signal: abortController.signal,
        });
        if (!response.success) {
          deleteAgent(notebookId);
          return;
        }
        const currentAgent = getAgentById(notebookId);
        const runtimeId = response.agent.runtime?.id;

        if (currentAgent) {
          if (currentAgent.runtimeId !== runtimeId) {
            upsertAgent({
              id: notebookId,
              baseUrl: currentAgent.baseUrl,
              transport: currentAgent.transport,
              runtimeId,
              status: 'running',
            });
          }
        } else {
          upsertAgent({
            id: notebookId,
            name: `Notebook ${notebookId}`,
            description: 'AI agent for notebook',
            baseUrl: '',
            transport: 'vercel-ai',
            documentId: notebookId,
            runtimeId,
            status: 'running',
          });
        }
      } catch {
        deleteAgent(notebookId);
      }
    };

    const refreshInterval = setInterval(refreshAIAgent, 60_000);
    return () => {
      abortController?.abort('Component unmounted');
      clearInterval(refreshInterval);
    };
  }, [agents, notebookId, getAIAgent, deleteAgent, getAgentById, upsertAgent]);

  return getAgentById(notebookId);
}

/**
 * Hook exposing the agent registry from the Zustand store.
 *
 * Provides CRUD operations on the in-memory agent map without coupling
 * consumers directly to the low-level store.
 */
export function useAgentRegistry() {
  const agents = useAgentStore(state => state.agents);
  const upsertAgent = useAgentStore(state => state.upsertAgent);
  const deleteAgent = useAgentStore(state => state.deleteAgent);
  const getAgentById = useAgentStore(state => state.getAgentById);
  return { agents, upsertAgent, deleteAgent, getAgentById };
}
