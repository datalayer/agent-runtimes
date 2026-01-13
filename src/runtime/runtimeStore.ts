/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Zustand store for runtime management.
 *
 * Provides a global store for managing cloud runtimes and agent connections.
 *
 * @module runtime/runtimeStore
 */

import { create } from 'zustand';
import type { ServiceManager } from '@jupyterlab/services';
import type {
  IRuntimeOptions,
  RuntimeConnection,
  AgentRuntimeStatus,
  AgentConfig,
  AgentConnection,
} from './types';

/**
 * Runtime store state interface.
 */
interface RuntimeStoreState {
  /** Current runtime connection */
  runtime: RuntimeConnection | null;
  /** Current agent connection */
  agent: AgentConnection | null;
  /** Current status */
  status: AgentRuntimeStatus;
  /** Error message if any */
  error: string | null;
  /** Whether a launch is in progress */
  isLaunching: boolean;
}

/**
 * Runtime store actions interface.
 */
interface RuntimeStoreActions {
  /** Launch a new runtime */
  launchRuntime: (options: IRuntimeOptions) => Promise<RuntimeConnection>;
  /** Connect to an existing runtime */
  connectToRuntime: (connection: {
    podName: string;
    environmentName: string;
    serviceManager: ServiceManager.IManager;
    kernelId?: string;
  }) => void;
  /** Create an agent on the current runtime */
  createAgent: (config?: AgentConfig) => Promise<AgentConnection>;
  /** Disconnect from the current runtime */
  disconnect: () => void;
  /** Clear any errors */
  clearError: () => void;
  /** Set error */
  setError: (error: string) => void;
  /** Reset store to initial state */
  reset: () => void;
}

type RuntimeStore = RuntimeStoreState & RuntimeStoreActions;

const initialState: RuntimeStoreState = {
  runtime: null,
  agent: null,
  status: 'idle',
  error: null,
  isLaunching: false,
};

/**
 * Create an agent on a runtime.
 */
async function createAgentOnRuntime(
  agentBaseUrl: string,
  agentId: string,
  config: AgentConfig = {},
): Promise<AgentConnection> {
  const response = await fetch(`${agentBaseUrl}/api/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: config.name || agentId,
      description: config.description || 'AI assistant',
      agent_library: config.agentLibrary || 'pydantic-ai',
      transport: config.transport || 'ag-ui',
      model: config.model || 'anthropic:claude-sonnet-4-5',
      system_prompt: config.systemPrompt || 'You are a helpful AI assistant.',
    }),
  });

  if (response.ok || response.status === 400) {
    // 400 means agent already exists, which is fine
    const endpoint = `${agentBaseUrl}/api/v1/ag-ui/${agentId}/`;
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

/**
 * Zustand store for runtime management.
 *
 * @example
 * ```typescript
 * import { useRuntimeStore } from '@datalayer/agent-runtimes/lib/runtime';
 *
 * // In a component
 * const { runtime, launchRuntime, status } = useRuntimeStore();
 *
 * // Launch a runtime
 * await launchRuntime({ environmentName: 'python-simple', creditsLimit: 100 });
 *
 * // Access runtime info
 * console.log(runtime?.agentBaseUrl);
 * ```
 */
export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  ...initialState,

  connectToRuntime: connection => {
    const baseUrl = connection.serviceManager.serverSettings.baseUrl;
    const agentBaseUrl = baseUrl.replace(
      '/jupyter/server/',
      '/agent-runtimes/',
    );

    const fullConnection: RuntimeConnection = {
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

  launchRuntime: async config => {
    set({ status: 'launching', error: null, isLaunching: true });

    try {
      // Import @datalayer/core dynamically to avoid circular dependencies
      const { createRuntime, makeDatalayerSettings } =
        await import('@datalayer/core/lib/api');
      const { ServiceManager } = await import('@jupyterlab/services');

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

      // Create service manager for the runtime
      const serverSettings = makeDatalayerSettings(
        runtimePod.ingress,
        runtimePod.token,
      );
      const serviceManager = new ServiceManager({ serverSettings });

      // Wait for the service manager to be ready
      await serviceManager.ready;

      // Construct URLs
      const jupyterBaseUrl = serverSettings.baseUrl;
      const agentBaseUrl = jupyterBaseUrl.replace(
        '/jupyter/server/',
        '/agent-runtimes/',
      );

      const connection: RuntimeConnection = {
        podName: runtimePod.pod_name,
        environmentName: runtimePod.environment_name,
        jupyterBaseUrl,
        agentBaseUrl,
        serviceManager,
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

      set({ agent: agentConnection });
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
      agent: null,
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
    set(initialState);
  },
}));

/**
 * Selector hooks for common use cases.
 */
export const useRuntime = () => useRuntimeStore(state => state.runtime);
export const useAgent = () => useRuntimeStore(state => state.agent);
export const useRuntimeStatus = () => useRuntimeStore(state => state.status);
export const useRuntimeError = () => useRuntimeStore(state => state.error);
export const useIsLaunching = () => useRuntimeStore(state => state.isLaunching);

/**
 * Get runtime store state without React (for use outside components).
 */
export const getRuntimeState = () => useRuntimeStore.getState();

/**
 * Subscribe to runtime store changes (for use outside React).
 */
export const subscribeToRuntime = useRuntimeStore.subscribe;
