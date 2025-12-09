/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { IAIAgent } from '../../models';

export type AIAgentState = {
  aiAgents: readonly IAIAgent[];
  addAIAgent: (aiAgent: IAIAgent) => void;
  deleteAIAgent: (documentId: string) => void;
  updateAIAgent: (documentId: string, runtimeId?: string) => void;
};

export const aiAgentStore = createStore<AIAgentState>(set => ({
  aiAgents: [],
  addAIAgent: (aiAgent: IAIAgent) => {
    set((state: AIAgentState) => {
      if (!state.aiAgents.includes(aiAgent)) {
        return { aiAgents: state.aiAgents.concat([aiAgent]) };
      } else {
        return {};
      }
    });
  },
  deleteAIAgent: (documentId: string) => {
    set((state: AIAgentState) => {
      return {
        aiAgents: state.aiAgents.filter(a => a.documentId === documentId),
      };
    });
  },
  updateAIAgent: (documentId: string, runtimeId?: string) => {
    set((state: AIAgentState) => {
      const index = state.aiAgents.findIndex(
        aiAgent => aiAgent.documentId === documentId,
      );
      if (index >= 0) {
        state.aiAgents[index].runtimeId = runtimeId;
        return { aiAgents: [...state.aiAgents] };
      } else {
        return {};
      }
    });
  },
}));

export function useAIAgentStore(): AIAgentState;
export function useAIAgentStore<T>(selector: (state: AIAgentState) => T): T;
export function useAIAgentStore<T>(selector?: (state: AIAgentState) => T) {
  return useStore(aiAgentStore, selector!);
}

export default useAIAgentStore;
