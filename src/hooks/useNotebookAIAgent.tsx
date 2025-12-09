/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect } from 'react';
import type { IAIAgent } from '../models';
import { useAIAgentStore } from '../state';
import { useAIAgents } from './useAIAgents';

/**
 * Get the document AI Agent if any.
 *
 * It handles checking the AI Agent is alive so it should only be use once per document.
 */
export function useNotebookAIAgent(notebookId: string): IAIAgent | undefined {
  const { getAIAgent } = useAIAgents();
  const { aiAgents, addAIAgent, deleteAIAgent, updateAIAgent } =
    useAIAgentStore();
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
          deleteAIAgent(notebookId);
          return;
        }
        const currentAgent = aiAgents.find(
          agent => agent.documentId === notebookId,
        );
        const runtimeId = response.agent.runtime?.id;
        if (currentAgent) {
          if (currentAgent.runtimeId !== runtimeId) {
            updateAIAgent(notebookId, runtimeId);
          }
        } else {
          addAIAgent({
            documentId: notebookId,
            runtimeId,
          });
        }
      } catch (r) {
        deleteAIAgent(notebookId);
      }
    };
    const refreshInterval = setInterval(refreshAIAgent, 60_000);
    return () => {
      abortController?.abort('Component unmounted');
      clearInterval(refreshInterval);
    };
  }, [aiAgents, notebookId]);
  const aiAgent = aiAgents.find(aiAgent => aiAgent.documentId === notebookId);
  return aiAgent;
}

export default useNotebookAIAgent;
