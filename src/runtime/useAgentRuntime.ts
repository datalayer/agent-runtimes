/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Combined hook for using a runtime with an AI agent.
 *
 * This is the main entry point for consumers who want a simple,
 * all-in-one solution for cloud runtime + agent management.
 *
 * @module runtime/useAgentRuntime
 */

import { useEffect, useRef, useCallback } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import {
  useRuntimeStore,
  useRuntime,
  useAgent,
  useRuntimeStatus,
  useRuntimeError,
  useIsLaunching,
} from './runtimeStore';
import type {
  IRuntimeOptions,
  AgentConfig,
  RuntimeConnection,
  AgentConnection,
  AgentRuntimeStatus,
} from './types';

interface UseAgentRuntimeOptions {
  /** Agent configuration */
  agentConfig?: AgentConfig;
  /** Auto-create agent when runtime connects */
  autoCreateAgent?: boolean;
}

interface UseAgentRuntimeReturn {
  /** Current runtime connection */
  runtime: RuntimeConnection | null;
  /** Current agent connection */
  agent: AgentConnection | null;
  /** Runtime status */
  status: AgentRuntimeStatus;
  /** Error message if any */
  error: string | null;
  /** Whether the runtime is launching */
  isLaunching: boolean;
  /** Whether everything is ready (runtime + agent) */
  isReady: boolean;
  /** Agent endpoint URL (shortcut) */
  endpoint: string | null;
  /** ServiceManager for the runtime */
  serviceManager: ServiceManager.IManager | null;
  /** Launch a new runtime */
  launchRuntime: (options: IRuntimeOptions) => Promise<RuntimeConnection>;
  /** Connect to an existing runtime */
  connectToRuntime: (options: {
    podName: string;
    environmentName: string;
    serviceManager: ServiceManager.IManager;
    kernelId?: string;
  }) => void;
  /** Create an agent (if not auto-created) */
  createAgent: (config?: AgentConfig) => Promise<AgentConnection>;
  /** Disconnect from the runtime */
  disconnect: () => void;
}

/**
 * Combined hook for using a runtime with an AI agent.
 *
 * This hook provides everything needed to:
 * 1. Connect to an existing runtime (or launch a new one)
 * 2. Create an AI agent on the runtime
 *
 * Use this in conjunction with useNotebookTools or useLexicalTools
 * for frontend tool execution.
 *
 * @param options - Configuration options
 * @returns Complete agent runtime state and controls
 *
 * @example
 * ```tsx
 * // For notebooks
 * import { useAgentRuntime } from '@datalayer/agent-runtimes/lib/runtime';
 * import { useNotebookTools } from '@datalayer/agent-runtimes/lib/tools/adapters/agent-runtimes';
 *
 * function NotebookEditor({ notebookId }) {
 *   const {
 *     isReady,
 *     endpoint,
 *     error,
 *     connectToRuntime,
 *   } = useAgentRuntime({
 *     autoCreateAgent: true,
 *     agentConfig: {
 *       model: 'anthropic:claude-sonnet-4-5',
 *       systemPrompt: 'You help users with Jupyter notebooks.',
 *     },
 *   });
 *
 *   // Get tools separately
 *   const tools = useNotebookTools(notebookId);
 *
 *   // Connect when user assigns a runtime
 *   const onRuntimeAssigned = (serviceManager, podName, poolName) => {
 *     connectToRuntime({ serviceManager, podName, jupyterpoolName: poolName });
 *   };
 *
 *   return (
 *     <>
 *       <Notebook />
 *       {isReady && (
 *         <ChatFloating endpoint={endpoint} tools={tools} />
 *       )}
 *       {error && <ErrorBanner>{error}</ErrorBanner>}
 *     </>
 *   );
 * }
 * ```
 */
export function useAgentRuntime(
  options: UseAgentRuntimeOptions = {},
): UseAgentRuntimeReturn {
  const { agentConfig, autoCreateAgent = true } = options;

  // Get store state
  const runtime = useRuntime();
  const agent = useAgent();
  const status = useRuntimeStatus();
  const error = useRuntimeError();
  const isLaunching = useIsLaunching();

  // Get store actions
  const launchRuntime = useRuntimeStore(state => state.launchRuntime);
  const connectToRuntime = useRuntimeStore(state => state.connectToRuntime);
  const disconnect = useRuntimeStore(state => state.disconnect);
  const createAgentAction = useRuntimeStore(state => state.createAgent);

  // Track if we've created the agent to prevent duplicates
  const hasCreatedAgentRef = useRef(false);
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;

  // Auto-create agent when runtime is ready
  useEffect(() => {
    if (
      autoCreateAgent &&
      runtime &&
      status === 'ready' &&
      !agent &&
      !hasCreatedAgentRef.current
    ) {
      hasCreatedAgentRef.current = true;
      createAgentAction(agentConfigRef.current).catch(err => {
        console.error('[useAgentRuntime] Failed to auto-create agent:', err);
        hasCreatedAgentRef.current = false;
      });
    }
  }, [autoCreateAgent, runtime, status, agent, createAgentAction]);

  // Reset agent creation tracking on disconnect
  useEffect(() => {
    if (status === 'disconnected' || status === 'idle') {
      hasCreatedAgentRef.current = false;
    }
  }, [status]);

  // Memoized create agent function
  const createAgent = useCallback(
    (config?: AgentConfig) => createAgentAction(config || agentConfig),
    [createAgentAction, agentConfig],
  );

  // Derived state
  const isReady = status === 'ready' && !!agent?.isReady;
  const endpoint = agent?.endpoint || null;
  const serviceManager = runtime?.serviceManager || null;

  return {
    runtime,
    agent,
    status,
    error,
    isLaunching,
    isReady,
    endpoint,
    serviceManager,
    launchRuntime,
    connectToRuntime,
    createAgent,
    disconnect,
  };
}
