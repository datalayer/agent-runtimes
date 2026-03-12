/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect } from 'react';
import type { Agent } from '../state';
import { useAgentStore } from '../state';
import { useAIAgents } from './useAgent';

/**
 * Get the document AI Agent if any.
 *
 * It handles checking the AI Agent is alive so it should only be use once per document.
 */
export function useNotebookAIAgent(notebookId: string): Agent | undefined {
  const { getAIAgent } = useAIAgents();
  const agents = useAgentStore(state => state.agents);
  const upsertAgent = useAgentStore(state => state.upsertAgent);
  const deleteAgent = useAgentStore(state => state.deleteAgent);
  const getAgentById = useAgentStore(state => state.getAgentById);

  // Check AI Agent is alive.
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
          // Update existing agent if runtime changed
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
          // Add new agent - assume it's a notebook agent with document tracking
          upsertAgent({
            id: notebookId,
            name: `Notebook ${notebookId}`,
            description: 'AI agent for notebook',
            baseUrl: '', // Will be set by the actual agent implementation
            transport: 'vercel-ai', // Default transport for notebook agents
            documentId: notebookId,
            runtimeId,
            status: 'running',
          });
        }
      } catch (r) {
        deleteAgent(notebookId);
      }
    };
    const refreshInterval = setInterval(refreshAIAgent, 60_000);
    return () => {
      abortController?.abort('Component unmounted');
      clearInterval(refreshInterval);
    };
  }, [agents, notebookId, getAIAgent, deleteAgent, getAgentById, upsertAgent]);

  const aiAgent = getAgentById(notebookId);
  return aiAgent;
}

export default useNotebookAIAgent;
