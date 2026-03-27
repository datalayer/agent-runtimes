/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Zustand store for agent runtime connection state.
 *
 * Manages two distinct concepts:
 *
 * 1. **Agent Runtime** — a single currently-connected pod (launch, connect,
 *    create agent, disconnect).  Runtime pods are ephemeral; they have a
 *    `podName` and a lifecycle (idle → launching → ready → disconnected).
 *
 * 2. **Agents Registry** — a persisted registry of URL-addressable agents
 *    that were previously connected.  Each entry has a `baseUrl` + transport
 *    pair and can be from any source (agent runtimes OR the stable agents
 *    service at `/api/v1/ai-agents/`).
 *
 * @module store/agentRuntimeStore
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ServiceManager } from '@jupyterlab/services';
import type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';
import type {
  AgentStatus,
  AgentConnection,
  AgentConfig,
  Protocol,
} from '../types';

// ─── Agent registry entry ──────────────────────────────────────────────────

/**
 * A URL-addressable agent that has been previously connected.
 * May originate from an agent runtime pod OR from the stable agents service.
 */
export interface AgentRegistryEntry {
  /** Unique agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Agent description */
  description: string;
  /** Base URL for the agent */
  baseUrl: string;
  /** Transport protocol used */
  protocol: Protocol;
  /** Current status */
  status: AgentStatus;
  /** Last error message if status is 'error' */
  error?: string | null;
  /** Timestamp of last update */
  lastUpdated: number;
  /** Document ID (for document-based agents) */
  documentId?: string;
  /** Runtime ID (for agent runtime pods) */
  runtimeId?: string;
  /** Author name (optional, for display) */
  author?: string;
  /** Avatar URL (optional, for display) */
  avatarUrl?: string;
}

// ─── Agent runtime store state & actions ──────────────────────────────────

/** State for the currently-connected agent runtime pod. */
export interface AgentRuntimeStoreState {
  /** Current runtime connection (null if not connected) */
  runtime: AgentConnection | null;
  /** Current status */
  status: AgentStatus;
  /** Error message if any */
  error: string | null;
  /** Whether a launch is in progress */
  isLaunching: boolean;
}

/** Actions for the agent runtime pod lifecycle. */
export interface AgentRuntimeStoreActions {
  /** Launch a new runtime pod */
  launchAgent: (options: IRuntimeOptions) => Promise<AgentConnection>;
  /** Connect to an existing runtime pod */
  connectAgent: (connection: {
    podName: string;
    environmentName: string;
    serviceManager?: ServiceManager.IManager;
    jupyterBaseUrl?: string;
    kernelId?: string;
  }) => void;
  /** Create an agent process on the connected runtime */
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

export type AgentRuntimeStore = AgentRuntimeStoreState &
  AgentRuntimeStoreActions;

// ─── Agent registry state ──────────────────────────────────────────────────

/** Persisted registry of URL-addressable agents. */
export type AgentRegistryState = {
  /** Registered agents */
  agents: readonly AgentRegistryEntry[];
  /** Add or update an agent entry */
  upsertAgent: (
    agent: Partial<AgentRegistryEntry> & {
      id: string;
      baseUrl: string;
      protocol: Protocol;
    },
  ) => void;
  /** Get agent by ID */
  getAgentById: (id: string) => AgentRegistryEntry | undefined;
  /** Get agent by baseUrl and transport */
  getAgentByUrl: (
    baseUrl: string,
    protocol: Protocol,
  ) => AgentRegistryEntry | undefined;
  /** Update agent status */
  updateAgentStatus: (
    id: string,
    status: AgentStatus,
    error?: string | null,
  ) => void;
  /** Toggle agent status between running/paused */
  toggleAgentStatus: (id: string) => void;
  /** Remove an agent entry */
  deleteAgent: (id: string) => void;
  /** Clear all agent entries */
  clearAgents: () => void;
};

// ─── Combined store type ───────────────────────────────────────────────────

export type AgentState = AgentRegistryState &
  AgentRuntimeStoreState &
  AgentRuntimeStoreActions;

// ─── Helper: build the transport-specific endpoint URL ────────────────────

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

// ─── Helper: register agent on the runtime ────────────────────────────────

async function createAgentOnRuntime(
  agentBaseUrl: string,
  agentId: string,
  config: AgentConfig = {},
): Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>> {
  const transport = config.protocol || 'ag-ui';
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
    return { agentId, endpoint, isReady: true };
  }

  const errorData = await response.json().catch(() => ({}));
  throw new Error(
    errorData.detail || `Failed to create agent: ${response.status}`,
  );
}

// ─── Initial runtime state ────────────────────────────────────────────────

const initialRuntimeState: AgentRuntimeStoreState = {
  runtime: null,
  status: 'idle',
  error: null,
  isLaunching: false,
};

// ─── Combined Zustand store ───────────────────────────────────────────────

export const agentStore = createStore<AgentState>()(
  persist(
    (set, get) => ({
      // ── Agent registry ────────────────────────────────────────────────
      agents: [],

      upsertAgent: agentData => {
        set(state => {
          const existingIndex = state.agents.findIndex(
            a => a.id === agentData.id,
          );
          const now = Date.now();
          if (existingIndex >= 0) {
            const updatedAgents = [...state.agents];
            updatedAgents[existingIndex] = {
              ...updatedAgents[existingIndex],
              ...agentData,
              lastUpdated: now,
            };
            return { agents: updatedAgents };
          }
          const newAgent: AgentRegistryEntry = {
            name: agentData.name || agentData.id,
            description: agentData.description || '',
            status: agentData.status || 'initializing',
            lastUpdated: now,
            ...agentData,
          };
          return { agents: [...state.agents, newAgent] };
        });
      },

      getAgentById: (id: string) => {
        return get().agents.find(agent => agent.id === id);
      },

      getAgentByUrl: (baseUrl: string, protocol: Protocol) => {
        return get().agents.find(
          agent => agent.baseUrl === baseUrl && agent.protocol === protocol,
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

      // ── Agent runtime pod ───────────────────────────────────────────
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
        set({
          runtime: {
            podName: connection.podName,
            environmentName: connection.environmentName,
            jupyterBaseUrl: baseUrl,
            agentBaseUrl,
            serviceManager: connection.serviceManager,
            status: 'ready',
            kernelId: connection.kernelId,
          },
          status: 'ready',
          error: null,
        });
      },

      launchAgent: async config => {
        set({ status: 'launching', error: null, isLaunching: true });
        try {
          const { createRuntime } = await import('@datalayer/core/lib/api');
          const runtimePod = await createRuntime({
            environmentName: config.environmentName,
            creditsLimit: config.creditsLimit,
            type: config.type || 'notebook',
            givenName: config.givenName,
            capabilities: config.capabilities,
            snapshot: config.snapshot,
          });
          set({ status: 'connecting' });
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
          set({ runtime: connection, status: 'ready', isLaunching: false });
          return connection;
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Failed to launch runtime';
          set({ status: 'error', error: errorMessage, isLaunching: false });
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
        set({ runtime: null, status: 'disconnected', error: null });
      },

      clearError: () => set({ error: null }),

      setError: error => set({ error, status: 'error' }),

      reset: () => set(initialRuntimeState),
    }),
    {
      name: 'agent-runtimes-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the agent registry; runtime connection state is ephemeral.
      partialize: state => ({
        agents: state.agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          description: agent.description,
          baseUrl: agent.baseUrl,
          transport: agent.protocol,
          status: agent.status,
          lastUpdated: agent.lastUpdated,
          documentId: agent.documentId,
          runtimeId: agent.runtimeId,
        })),
      }),
    },
  ),
);

// ─── React hook ────────────────────────────────────────────────────────────

export function useAgentStore(): AgentState;
export function useAgentStore<T>(selector: (state: AgentState) => T): T;
export function useAgentStore<T>(selector?: (state: AgentState) => T) {
  return useStore(agentStore, selector!);
}

// Attach getState / subscribe for non-React consumers
(useAgentStore as any).getState = agentStore.getState;
(useAgentStore as any).subscribe = agentStore.subscribe;

// ─── Focused selector hooks ────────────────────────────────────────────────

/** Currently-connected agent runtime pod connection. */
export const useAgentRuntime = () => useAgentStore(state => state.runtime);

/**
 * @deprecated Use useAgentRuntime() — agent fields are merged onto the runtime connection.
 */
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

// ─── Non-React access ──────────────────────────────────────────────────────

/** Get agent runtime store state outside React. */
export const getAgentState = () => agentStore.getState();

/** Subscribe to agent runtime store outside React. */
export const subscribeToAgent = agentStore.subscribe;

export default useAgentStore;
