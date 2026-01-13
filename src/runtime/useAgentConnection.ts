/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hook for creating and managing agent connections on a runtime.
 *
 * @module runtime/useAgentConnection
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRuntimeStore } from './runtimeStore';
import type { AgentConfig, AgentConnection } from './types';

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: 'anthropic:claude-sonnet-4-5',
  systemPrompt: 'You are a helpful AI assistant.',
  agentLibrary: 'pydantic-ai',
  transport: 'ag-ui',
};

interface UseAgentConnectionOptions {
  /** Agent configuration */
  config?: AgentConfig;
  /** Auto-create agent when runtime is ready */
  autoCreate?: boolean;
}

interface UseAgentConnectionReturn {
  /** Current agent connection */
  agent: AgentConnection | null;
  /** Whether the agent is ready */
  isReady: boolean;
  /** Whether agent creation is in progress */
  isCreating: boolean;
  /** Error message if any */
  error: string | null;
  /** Create an agent on the runtime */
  create: (config?: AgentConfig) => Promise<AgentConnection>;
}

/**
 * Hook for creating and managing agent connections.
 * Uses the Zustand store for runtime state.
 *
 * @param options - Configuration options
 * @returns Agent state and control functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { runtime } = useRuntimeStore();
 *   const { agent, isReady } = useAgentConnection({
 *     autoCreate: true,
 *     config: {
 *       model: 'anthropic:claude-sonnet-4-5',
 *       systemPrompt: 'You are a helpful assistant.',
 *     },
 *   });
 *
 *   if (!isReady) return <div>Creating agent...</div>;
 *
 *   return <ChatFloating endpoint={agent.endpoint} />;
 * }
 * ```
 */
export function useAgentConnection(
  options: UseAgentConnectionOptions = {},
): UseAgentConnectionReturn {
  const { config, autoCreate = false } = options;

  const runtime = useRuntimeStore(state => state.runtime);
  const storeAgent = useRuntimeStore(state => state.agent);
  const createStoreAgent = useRuntimeStore(state => state.createAgent);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const createdForRuntimeRef = useRef<string | null>(null);

  const create = useCallback(
    async (overrideConfig?: AgentConfig): Promise<AgentConnection> => {
      if (!runtime) {
        throw new Error(
          'No runtime connected. Launch or connect to a runtime first.',
        );
      }

      if (creatingRef.current) {
        throw new Error('Agent creation already in progress');
      }

      creatingRef.current = true;
      setIsCreating(true);
      setError(null);

      try {
        // Merge configs: defaults < options.config < overrideConfig
        const mergedConfig: AgentConfig = {
          ...DEFAULT_AGENT_CONFIG,
          ...config,
          ...overrideConfig,
          name: overrideConfig?.name || config?.name || runtime.podName,
        };

        const agentConnection = await createStoreAgent(mergedConfig);
        createdForRuntimeRef.current = runtime.podName;

        return agentConnection;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create agent';
        setError(errorMessage);
        throw err;
      } finally {
        creatingRef.current = false;
        setIsCreating(false);
      }
    },
    [runtime, config, createStoreAgent],
  );

  // Auto-create agent when runtime is ready (and not already created for this runtime)
  useEffect(() => {
    if (
      autoCreate &&
      runtime &&
      runtime.status === 'ready' &&
      !storeAgent &&
      !creatingRef.current
    ) {
      // Only create if we haven't already created for this runtime
      if (createdForRuntimeRef.current !== runtime.podName) {
        create().catch(err => {
          console.error('[useAgentConnection] Auto-create failed:', err);
        });
      }
    }
  }, [autoCreate, runtime, storeAgent, create]);

  // Reset created tracking when runtime changes
  useEffect(() => {
    if (!runtime) {
      createdForRuntimeRef.current = null;
    }
  }, [runtime]);

  return {
    agent: storeAgent,
    isReady: !!storeAgent?.isReady,
    isCreating,
    error,
    create,
  };
}
