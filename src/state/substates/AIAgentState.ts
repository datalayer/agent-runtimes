/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Transport } from '../../components/chat/components/Chat';

export type AgentStatus = 'running' | 'paused' | 'initializing' | 'error';

/**
 * Unified Agent model combining runtime tracking and UI state
 */
export interface Agent {
  /** Unique agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Agent description */
  description: string;
  /** Base URL for the agent (for Jupyter: baseUrl, for FastAPI: baseUrl) */
  baseUrl: string;
  /** Transport protocol used */
  transport: Transport;
  /** Current status */
  status: AgentStatus;
  /** Last error message if status is 'error' */
  error?: string | null;
  /** Timestamp of last update */
  lastUpdated: number;
  /** Document ID (for document-based agents) */
  documentId?: string;
  /** Runtime ID (for Jupyter kernel-based agents) */
  runtimeId?: string;
  /** Author name (optional, for display) */
  author?: string;
  /** Avatar URL (optional, for display) */
  avatarUrl?: string;
}

export type AgentState = {
  /** All registered agents */
  agents: readonly Agent[];

  /** Add or update an agent */
  upsertAgent: (
    agent: Partial<Agent> & {
      id: string;
      baseUrl: string;
      transport: Transport;
    },
  ) => void;

  /** Get agent by ID */
  getAgentById: (id: string) => Agent | undefined;

  /** Get agent by baseUrl and transport */
  getAgentByUrl: (baseUrl: string, transport: Transport) => Agent | undefined;

  /** Update agent status */
  updateAgentStatus: (
    id: string,
    status: AgentStatus,
    error?: string | null,
  ) => void;

  /** Toggle agent status between running/paused */
  toggleAgentStatus: (id: string) => void;

  /** Delete an agent */
  deleteAgent: (id: string) => void;

  /** Clear all agents */
  clearAgents: () => void;
};

export const agentStore = createStore<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],

      upsertAgent: agentData => {
        set(state => {
          const existingIndex = state.agents.findIndex(
            a => a.id === agentData.id,
          );
          const now = Date.now();

          if (existingIndex >= 0) {
            // Update existing agent
            const updatedAgents = [...state.agents];
            updatedAgents[existingIndex] = {
              ...updatedAgents[existingIndex],
              ...agentData,
              lastUpdated: now,
            };
            return { agents: updatedAgents };
          } else {
            // Add new agent
            const newAgent: Agent = {
              name: agentData.name || agentData.id,
              description: agentData.description || '',
              status: agentData.status || 'initializing',
              lastUpdated: now,
              ...agentData,
            };
            return { agents: [...state.agents, newAgent] };
          }
        });
      },

      getAgentById: (id: string) => {
        const { agents } = get();
        return agents.find(agent => agent.id === id);
      },

      getAgentByUrl: (baseUrl: string, transport: Transport) => {
        const { agents } = get();
        return agents.find(
          agent => agent.baseUrl === baseUrl && agent.transport === transport,
        );
      },

      updateAgentStatus: (
        id: string,
        status: AgentStatus,
        error: string | null = null,
      ) => {
        set(state => {
          const index = state.agents.findIndex(a => a.id === id);
          if (index >= 0) {
            const updatedAgents = [...state.agents];
            updatedAgents[index] = {
              ...updatedAgents[index],
              status,
              error,
              lastUpdated: Date.now(),
            };
            return { agents: updatedAgents };
          }
          return {};
        });
      },

      toggleAgentStatus: (id: string) => {
        set(state => {
          const index = state.agents.findIndex(a => a.id === id);
          if (index >= 0) {
            const updatedAgents = [...state.agents];
            const currentStatus = updatedAgents[index].status;
            updatedAgents[index] = {
              ...updatedAgents[index],
              status: currentStatus === 'running' ? 'paused' : 'running',
              lastUpdated: Date.now(),
            };
            return { agents: updatedAgents };
          }
          return {};
        });
      },

      deleteAgent: (id: string) => {
        set(state => ({
          agents: state.agents.filter(a => a.id !== id),
        }));
      },

      clearAgents: () => {
        set({ agents: [] });
      },
    }),
    {
      name: 'agent-runtimes-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential fields
      partialize: state => ({
        agents: state.agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          baseUrl: agent.baseUrl,
          transport: agent.transport,
          status: agent.status,
          lastUpdated: agent.lastUpdated,
          documentId: agent.documentId,
          runtimeId: agent.runtimeId,
        })),
      }),
    },
  ),
);

export function useAgentStore(): AgentState;
export function useAgentStore<T>(selector: (state: AgentState) => T): T;
export function useAgentStore<T>(selector?: (state: AgentState) => T) {
  return useStore(agentStore, selector!);
}

// Backward compatibility exports
export type AIAgentState = AgentState;
export const aiAgentStore = agentStore;
export const useAIAgentStore = useAgentStore;

export default useAgentStore;
