/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ServiceManager } from '@jupyterlab/services';
import type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';
import type { Transport } from '../../chat/Chat';
import type {
  AgentStatus,
  AgentConnection,
  AgentConfig,
} from '../../types/agents';

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

// ─── Runtime connection store types (merged from agentStore) ──────────

/**
 * Agent runtime store state interface.
 */
export interface AgentStoreState {
  /** Current runtime connection (includes agent fields when an agent is created) */
  runtime: AgentConnection | null;
  /** Current status */
  status: AgentStatus;
  /** Error message if any */
  error: string | null;
  /** Whether a launch is in progress */
  isLaunching: boolean;
}

/**
 * Agent runtime store actions interface.
 */
export interface AgentStoreActions {
  /** Launch a new runtime for the agent */
  launchAgent: (options: IRuntimeOptions) => Promise<AgentConnection>;
  /** Connect to an existing runtime */
  connectAgent: (connection: {
    podName: string;
    environmentName: string;
    serviceManager?: ServiceManager.IManager;
    jupyterBaseUrl?: string;
    kernelId?: string;
  }) => void;
  /** Create an agent on the current runtime */
  createAgent: (
    config?: AgentConfig,
  ) => Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>>;
  /** Disconnect from the current runtime */
  disconnect: () => void;
  /** Clear any errors */
  clearError: () => void;
  /** Set error */
  setError: (error: string) => void;
  /** Reset store to initial state */
  reset: () => void;
}

export type AgentStore = AgentStoreState & AgentStoreActions;

// ─── Agent registry types ─────────────────────────────────────────────

export type AgentRegistryState = {
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

// ─── Combined state ───────────────────────────────────────────────────

export type AgentState = AgentRegistryState &
  AgentStoreState &
  AgentStoreActions;

// ─── Helper: build the transport-specific endpoint URL ────────────────

function getTransportEndpoint(
  baseUrl: string,
  transport: string,
  agentId: string,
): string {
  switch (transport) {
    case 'vercel-ai':
      return `${baseUrl}/api/v1/vercel-ai/${agentId}`;
    case 'a2a':
      return `${baseUrl}/api/v1/a2a/agents/${agentId}/`;
    case 'acp':
      return `${baseUrl}/api/v1/acp/ws/${agentId}`;
    case 'ag-ui':
    default:
      return `${baseUrl}/api/v1/ag-ui/${agentId}/`;
  }
}

// ─── Helper: create agent on runtime ──────────────────────────────────

async function createAgentOnRuntime(
  agentBaseUrl: string,
  agentId: string,
  config: AgentConfig = {},
): Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>> {
  const transport = config.transport || 'ag-ui';
  const response = await fetch(`${agentBaseUrl}/api/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: config.name || agentId,
      description: config.description || 'AI assistant',
      agent_library: config.agentLibrary || 'pydantic-ai',
      transport,
      model:
        config.model || 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      system_prompt: config.systemPrompt || 'You are a helpful AI assistant.',
    }),
  });

  if (response.ok || response.status === 400) {
    // 400 means agent already exists, which is fine
    const endpoint = getTransportEndpoint(agentBaseUrl, transport, agentId);
    return {
      agentId,
      endpoint,
      isReady: true,
    };
  }

  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.detail || `Failed to create agent: ${response.status}`,
  );
}

// ─── Initial runtime state ────────────────────────────────────────────

const initialRuntimeState: AgentStoreState = {
  runtime: null,
  status: 'idle',
  error: null,
  isLaunching: false,
};

// ─── Combined store ───────────────────────────────────────────────────

export const agentStore = createStore<AgentState>()(
  persist(
    (set, get) => ({
      // ── Agent registry state ──────────────────────────────────────
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

      // ── Runtime connection state (merged from agentStore) ─────────
      ...initialRuntimeState,

      connectAgent: connection => {
        const baseUrl =
          connection.jupyterBaseUrl ||
          connection.serviceManager?.serverSettings.baseUrl;
        if (!baseUrl) {
          throw new Error(
            'connectAgent requires either jupyterBaseUrl or serviceManager',
          );
        }
        const agentBaseUrl = baseUrl.replace(
          '/jupyter/server/',
          '/agent-runtimes/',
        );

        const fullConnection: AgentConnection = {
          podName: connection.podName,
          environmentName: connection.environmentName,
          jupyterBaseUrl: baseUrl,
          agentBaseUrl,
          serviceManager: connection.serviceManager,
          status: 'ready',
          kernelId: connection.kernelId,
        };

        set({
          runtime: fullConnection,
          status: 'ready',
          error: null,
        });
      },

      launchAgent: async config => {
        set({ status: 'launching', error: null, isLaunching: true });

        try {
          // Import @datalayer/core dynamically to avoid circular dependencies
          const { createRuntime } = await import('@datalayer/core/lib/api');

          // Create the runtime using IRuntimeOptions from @datalayer/core
          const runtimePod = await createRuntime({
            environmentName: config.environmentName,
            creditsLimit: config.creditsLimit,
            type: config.type || 'notebook',
            givenName: config.givenName,
            capabilities: config.capabilities,
            snapshot: config.snapshot,
          });

          set({ status: 'connecting' });

          // Construct URLs
          const jupyterBaseUrl = runtimePod.ingress;
          const agentBaseUrl = jupyterBaseUrl.replace(
            '/jupyter/server/',
            '/agent-runtimes/',
          );

          const connection: AgentConnection = {
            podName: runtimePod.pod_name,
            environmentName: runtimePod.environment_name,
            jupyterBaseUrl,
            agentBaseUrl,
            status: 'ready',
          };

          set({
            runtime: connection,
            status: 'ready',
            isLaunching: false,
          });

          return connection;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to launch runtime';
          set({
            status: 'error',
            error: errorMessage,
            isLaunching: false,
          });
          throw err;
        }
      },

      createAgent: async (config = {}) => {
        const { runtime } = get();

        if (!runtime) {
          throw new Error(
            'No runtime connected. Launch or connect to a runtime first.',
          );
        }

        try {
          const agentId = config.name || runtime.podName;
          const agentConnection = await createAgentOnRuntime(
            runtime.agentBaseUrl,
            agentId,
            config,
          );

          // Merge agent fields into the runtime connection
          set({
            runtime: {
              ...runtime,
              agentId: agentConnection.agentId,
              endpoint: agentConnection.endpoint,
              isReady: agentConnection.isReady,
            },
          });
          return agentConnection;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to create agent';
          set({ error: errorMessage });
          throw err;
        }
      },

      disconnect: () => {
        set({
          runtime: null,
          status: 'disconnected',
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      setError: error => {
        set({ error, status: 'error' });
      },

      reset: () => {
        set(initialRuntimeState);
      },
    }),
    {
      name: 'agent-runtimes-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the agent registry fields, NOT runtime connection state
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

// ─── React hooks ──────────────────────────────────────────────────────

export function useAgentStore(): AgentState;
export function useAgentStore<T>(selector: (state: AgentState) => T): T;
export function useAgentStore<T>(selector?: (state: AgentState) => T) {
  return useStore(agentStore, selector!);
}

// Attach getState and subscribe so non-React code works:
// e.g. useAgentStore.getState(), useAgentStore.subscribe(...)
(useAgentStore as any).getState = agentStore.getState;
(useAgentStore as any).subscribe = agentStore.subscribe;

/**
 * Selector hooks for common use cases (runtime connection).
 */
export const useAgentRuntime = () => useAgentStore(state => state.runtime);
/** @deprecated Use useAgentRuntime() instead — agent fields are now on the runtime connection. */
export const useAgentFromStore = () =>
  useAgentStore(state =>
    state.runtime
      ? {
          agentId: state.runtime.agentId,
          endpoint: state.runtime.endpoint,
          isReady: state.runtime.isReady,
        }
      : null,
  );
export const useAgentStatus = () => useAgentStore(state => state.status);
export const useAgentError = () => useAgentStore(state => state.error);
export const useIsLaunching = () => useAgentStore(state => state.isLaunching);

/**
 * Get agent store state without React (for use outside components).
 */
export const getAgentState = () => agentStore.getState();

/**
 * Subscribe to agent store changes (for use outside React).
 */
export const subscribeToAgent = agentStore.subscribe;

export default useAgentStore;
