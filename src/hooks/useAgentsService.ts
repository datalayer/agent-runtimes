/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agents Service REST API hook and notebook agent management.
 *
 * @deprecated useAgents instead
 * @module hooks/useAgentsService
 */

import { useEffect } from 'react';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { URLExt } from '@jupyterlab/coreutils';
import { useAgentRuntimeStore } from '../stores/agentRuntimeStore';

export type RequestOptions = {
  signal?: AbortSignal;
  baseUrl?: string;
};

export type RoomType = 'notebook_persist' | 'notebook_memory' | 'doc_memory';

// ═══════════════════════════════════════════════════════════════════════════
// Agents Service REST API hook.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @deprecated Use useAgentRuntimes instead
 */
export const useAgentsService = (baseUrlOverride = 'api/ai-agents/v1') => {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const createAgent = (
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
  const getAgents = ({
    signal,
    baseUrl = baseUrlOverride,
  }: RequestOptions = {}) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'GET',
      signal,
    });
  };
  const deleteAgent = (
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
  const getAgent = (
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
  const patchAgent = (
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
    createAgent,
    getAgents,
    deleteAgent,
    getAgent,
    patchAgent,
  };
};

/**
 * Get the notebook AI agent if any.
 *
 * This performs a periodic liveness check and keeps the local store in sync.
 * @deprecated Use useAgentRuntimes instead
 */
export function useNotebookAgents(notebookId: string) {
  const { getAgent } = useAgentsService();
  const agents = useAgentRuntimeStore(state => state.agents);
  const upsertAgent = useAgentRuntimeStore(state => state.upsertAgent);
  const deleteAgent = useAgentRuntimeStore(state => state.deleteAgent);
  const getAgentById = useAgentRuntimeStore(state => state.getAgentById);

  useEffect(() => {
    let abortController: AbortController;

    const refreshAIAgent = async () => {
      abortController = new AbortController();
      try {
        const response = await getAgent(notebookId, {
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
              protocol: currentAgent.protocol,
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
            protocol: 'vercel-ai',
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
  }, [agents, notebookId, getAgent, deleteAgent, getAgentById, upsertAgent]);

  return getAgentById(notebookId);
}
