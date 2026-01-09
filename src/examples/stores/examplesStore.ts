/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

// Import agent examples data files.
import earthquakeDetectorData from './agents/earthquake-detector.json';
import stocksWatcherData from './agents/stock-market.json';
import salesForecasterData from './agents/sales-forecaster.json';
import socialPostGeneratorData from './agents/social-post-generator.json';

export type AgentStatus = 'running' | 'paused';
export type Transport = 'acp' | 'ag-ui' | 'vercel-ai' | 'a2a';

export interface Agent {
  id: string;
  name: string;
  description: string;
  author: string;
  lastEdited: string;
  screenshot: string;
  status?: AgentStatus;
  transport: Transport;
  avatarUrl: string;
  notebookFile: string;
  lexicalFile: string;
  stars: number;
  notifications: number;
}

export type AgentsState = {
  agents: readonly Agent[];
  getAgentById: (id: string) => Agent | undefined;
  updateAgentStatus: (id: string, status: AgentStatus) => void;
  toggleAgentStatus: (id: string) => void;
};

// Helper function to transform JSON data to Agent format
const transformAgentData = (
  data: any,
  notebookSuffix: string,
  lexicalSuffix: string,
): Agent => ({
  id: data.id,
  name: data.title,
  description: data.description,
  author: data.author,
  lastEdited: data.editTimestamp,
  screenshot: data.image,
  status: data.status as AgentStatus | undefined,
  transport: data.transport as Transport,
  avatarUrl: data.avatarUrl,
  notebookFile: `${notebookSuffix}.ipynb.json`,
  lexicalFile: `${lexicalSuffix}.lexical.json`,
  stars: data.stars || 0,
  notifications: data.notifications || 0,
});

// Initialize agents from the agents folder
const initialAgents: Agent[] = [
  transformAgentData(
    earthquakeDetectorData,
    'earthquake-detector',
    'earthquake-detector',
  ),
  transformAgentData(stocksWatcherData, 'stock-market', 'stock-market'),
  transformAgentData(
    salesForecasterData,
    'sales-forecaster',
    'sales-forecaster',
  ),
  transformAgentData(
    socialPostGeneratorData,
    'social-post-generator',
    'social-post-generator',
  ),
];

export const agentsStore = createStore<AgentsState>(set => ({
  agents: initialAgents,
  getAgentById: (id: string) => {
    const state = agentsStore.getState();
    return state.agents.find(agent => agent.id === id);
  },
  updateAgentStatus: (id: string, status: AgentStatus) => {
    set(state => ({
      agents: state.agents.map(agent =>
        agent.id === id ? { ...agent, status } : agent,
      ),
    }));
  },
  toggleAgentStatus: (id: string) => {
    set(state => ({
      agents: state.agents.map(agent =>
        agent.id === id
          ? {
              ...agent,
              status: agent.status === 'running' ? 'paused' : 'running',
            }
          : agent,
      ),
    }));
  },
}));

export function useAgentsStore(): AgentsState;
export function useAgentsStore<T>(selector: (state: AgentsState) => T): T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAgentsStore(selector?: any) {
  return useStore(agentsStore, selector);
}
