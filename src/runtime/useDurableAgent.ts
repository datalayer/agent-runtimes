/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hook for managing durable agents with CRIU checkpoint/restore lifecycle.
 *
 * Extends the base useAgentRuntime hook with pause/resume/terminate
 * operations backed by CRIU checkpointing and the ai-agents service.
 *
 * @module runtime/useDurableAgent
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  useRuntimeStore,
  useRuntime,
  useAgent,
  useRuntimeError,
} from './runtimeStore';
import type { AgentConfig, AgentConnection, RuntimeConnection } from './types';

/**
 * Durable-specific runtime status that extends the base with paused state.
 */
export type DurableRuntimeStatus =
  | 'idle'
  | 'launching'
  | 'ready'
  | 'paused'
  | 'resuming'
  | 'error';

/**
 * Options for the useDurableAgent hook.
 */
export interface UseDurableAgentOptions {
  /** Agent spec ID (used as the runtime and agent identifier) */
  agentSpecId: string;
  /** Auto-create runtime + agent on mount (default: false) */
  autoStart?: boolean;
  /** Agent configuration overrides */
  agentConfig?: AgentConfig;
  /** Base URL for the ai-agents service (auto-detected if omitted) */
  baseUrl?: string;
}

/**
 * Return type for the useDurableAgent hook.
 */
export interface UseDurableAgentReturn {
  // Runtime
  /** Current runtime connection (null if not connected) */
  runtime: RuntimeConnection | null;
  /** Durable-specific runtime status */
  runtimeStatus: DurableRuntimeStatus;
  /** Launch a new runtime for this agent spec */
  launchRuntime: () => Promise<void>;

  // Agent
  /** Current agent connection (null if not created) */
  agent: AgentConnection | null;
  /** Agent endpoint URL (shortcut) */
  agentEndpoint: string | null;
  /** Create an agent on the runtime */
  createAgent: () => Promise<void>;

  // Lifecycle
  /** Pause the agent (CRIU checkpoint) */
  pause: () => Promise<void>;
  /** Resume a paused agent (CRIU restore) */
  resume: () => Promise<void>;
  /** Terminate the agent (delete runtime) */
  terminate: () => Promise<void>;

  // Status
  /** Whether the agent is fully ready (runtime + agent connected) */
  isReady: boolean;
  /** Error if any */
  error: Error | null;
}

/**
 * Hook for managing durable agents with lifecycle controls.
 *
 * Provides runtime launch, agent creation, and CRIU-based
 * pause/resume/terminate functionality for long-running agents.
 *
 * @param options - Configuration options
 * @returns Durable agent state and controls
 *
 * @example
 * ```tsx
 * import { useDurableAgent } from '@datalayer/agent-runtimes/lib/runtime';
 *
 * function DurableAgentView({ agentSpecId }) {
 *   const {
 *     runtimeStatus,
 *     agentEndpoint,
 *     isReady,
 *     error,
 *     launchRuntime,
 *     pause,
 *     resume,
 *     terminate,
 *   } = useDurableAgent({ agentSpecId, autoStart: true });
 *
 *   if (error) return <ErrorBanner>{error.message}</ErrorBanner>;
 *   if (!isReady) return <Loading status={runtimeStatus} />;
 *
 *   return (
 *     <>
 *       <ChatBase endpoint={agentEndpoint} />
 *       <button onClick={pause}>Pause</button>
 *       <button onClick={resume}>Resume</button>
 *       <button onClick={terminate}>Terminate</button>
 *     </>
 *   );
 * }
 * ```
 */
export function useDurableAgent(
  options: UseDurableAgentOptions,
): UseDurableAgentReturn {
  const { agentSpecId, autoStart = false, agentConfig } = options;

  // Base store state
  const runtime = useRuntime();
  const agent = useAgent();
  const storeError = useRuntimeError();

  // Store actions
  const storeLaunchRuntime = useRuntimeStore(state => state.launchRuntime);
  const storeCreateAgent = useRuntimeStore(state => state.createAgent);
  const storeDisconnect = useRuntimeStore(state => state.disconnect);

  // Durable-specific state
  const [durableStatus, setDurableStatus] =
    useState<DurableRuntimeStatus>('idle');
  const [durableError, setDurableError] = useState<Error | null>(null);
  const hasAutoStarted = useRef(false);

  // Compute auth token and base URL from the core stores
  const getAuthHeaders = useCallback(async () => {
    try {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const runUrl = coreStore.getState().configuration?.aiagentsRunUrl || '';
      return { token, runUrl };
    } catch {
      return { token: '', runUrl: '' };
    }
  }, []);

  // --- Launch Runtime ---
  const launchRuntime = useCallback(async () => {
    setDurableStatus('launching');
    setDurableError(null);

    try {
      // Sanitize givenName: K8s names must be lowercase alphanumeric + hyphens
      const safeName = `durable-${agentSpecId}`
        .replace(/\//g, '-')
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 63);

      await storeLaunchRuntime({
        environmentName: 'ai-agents-env',
        creditsLimit: 10,
        givenName: safeName,
      });
      setDurableStatus('ready');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDurableError(error);
      setDurableStatus('error');
    }
  }, [agentSpecId, storeLaunchRuntime]);

  // --- Create Agent ---
  const createAgent = useCallback(async () => {
    try {
      await storeCreateAgent({
        name: agentSpecId,
        ...agentConfig,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDurableError(error);
      setDurableStatus('error');
    }
  }, [agentSpecId, agentConfig, storeCreateAgent]);

  // --- Pause (CRIU Checkpoint) ---
  const pause = useCallback(async () => {
    if (!runtime) {
      setDurableError(new Error('No runtime to pause'));
      return;
    }

    try {
      const { token, runUrl } = await getAuthHeaders();
      const { pauseAgent } =
        await import('@datalayer/core/lib/api/ai-agents/agents');
      await pauseAgent(token, runtime.podName, runUrl);
      setDurableStatus('paused');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDurableError(error);
    }
  }, [runtime, getAuthHeaders]);

  // --- Resume (CRIU Restore) ---
  const resume = useCallback(async () => {
    setDurableStatus('resuming');
    setDurableError(null);

    try {
      const { token, runUrl } = await getAuthHeaders();

      if (runtime) {
        // Runtime still exists — just resume it
        const { resumeAgent } =
          await import('@datalayer/core/lib/api/ai-agents/agents');
        await resumeAgent(token, runtime.podName, runUrl);
        setDurableStatus('ready');
      } else {
        // Runtime was destroyed — re-launch
        await launchRuntime();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDurableError(error);
      setDurableStatus('error');
    }
  }, [runtime, getAuthHeaders, launchRuntime]);

  // --- Terminate (Delete Runtime) ---
  const terminate = useCallback(async () => {
    if (!runtime) {
      storeDisconnect();
      setDurableStatus('idle');
      return;
    }

    try {
      const { token, runUrl } = await getAuthHeaders();
      const { deleteRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');
      await deleteRuntime(token, runtime.podName, runUrl);
      storeDisconnect();
      setDurableStatus('idle');
      setDurableError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setDurableError(error);
    }
  }, [runtime, getAuthHeaders, storeDisconnect]);

  // --- Auto-start on mount ---
  useEffect(() => {
    if (autoStart && !hasAutoStarted.current && durableStatus === 'idle') {
      hasAutoStarted.current = true;
      launchRuntime().then(() => createAgent());
    }
  }, [autoStart, durableStatus, launchRuntime, createAgent]);

  // --- Sync store status into durable status ---
  useEffect(() => {
    if (storeError && durableStatus !== 'error') {
      setDurableError(new Error(storeError));
      setDurableStatus('error');
    }
  }, [storeError, durableStatus]);

  // Derived state
  const isReady = durableStatus === 'ready' && !!agent?.isReady;
  const agentEndpoint = agent?.endpoint || null;
  const combinedError =
    durableError || (storeError ? new Error(storeError) : null);

  return {
    // Runtime
    runtime,
    runtimeStatus: durableStatus,
    launchRuntime,

    // Agent
    agent,
    agentEndpoint,
    createAgent,

    // Lifecycle
    pause,
    resume,
    terminate,

    // Status
    isReady,
    error: combinedError,
  };
}
