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
  /** Full agent spec object (persisted with checkpoints) */
  agentSpec?: Record<string, any>;
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
  /** Take a checkpoint and persist it (pause → record → resume) */
  checkpoint: (name?: string) => Promise<void>;
  /** Refresh the checkpoints list from the backend */
  refreshCheckpoints: () => Promise<void>;

  // Checkpoints
  /** List of persisted checkpoints for this runtime */
  checkpoints: CheckpointRecord[];

  // Status
  /** Whether the agent is fully ready (runtime + agent connected) */
  isReady: boolean;
  /** Error if any */
  error: Error | null;
}

/**
 * A persisted checkpoint record returned from the runtimes API.
 */
export interface CheckpointRecord {
  uid: string;
  name: string;
  description: string;
  pod_name: string;
  agentspec_id: string;
  agentspec: Record<string, any>;
  metadata: Record<string, any>;
  status: string;
  updated_at: string;
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
  const { agentSpecId, autoStart = false, agentConfig, agentSpec } = options;

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
  const [checkpointRecords, setCheckpointRecords] = useState<
    CheckpointRecord[]
  >([]);
  const hasAutoStarted = useRef(false);

  // Compute auth token and base URL from the core stores
  const getAuthHeaders = useCallback(async () => {
    try {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const config = coreStore.getState().configuration;
      const runUrl = config?.aiagentsRunUrl || '';
      const runtimesRunUrl = config?.runtimesRunUrl || '';
      return { token, runUrl, runtimesRunUrl };
    } catch {
      return { token: '', runUrl: '', runtimesRunUrl: '' };
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

  // --- Checkpoint (Pause → Record → Resume) ---
  const checkpoint = useCallback(
    async (name?: string) => {
      if (!runtime) {
        setDurableError(new Error('No runtime to checkpoint'));
        return;
      }

      try {
        const { token, runUrl, runtimesRunUrl } = await getAuthHeaders();

        // 1. Pause (CRIU checkpoint)
        const { pauseAgent } =
          await import('@datalayer/core/lib/api/ai-agents/agents');
        await pauseAgent(token, runtime.podName, runUrl);

        // 2. Persist checkpoint record with agentspec
        const { createCheckpoint } =
          await import('@datalayer/core/lib/api/runtimes/checkpoints');
        const ckptName = name || `checkpoint-${Date.now()}`;
        await createCheckpoint(
          token,
          {
            pod_name: runtime.podName,
            name: ckptName,
            description: `CRIU checkpoint for ${agentSpecId}`,
            agentspec_id: agentSpecId,
            agentspec: agentSpec || {},
          },
          runtimesRunUrl,
        );

        // 3. Resume immediately
        const { resumeAgent } =
          await import('@datalayer/core/lib/api/ai-agents/agents');
        await resumeAgent(token, runtime.podName, runUrl);
        setDurableStatus('ready');

        // 4. Refresh checkpoints list
        await refreshCheckpoints();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setDurableError(error);
      }
    },
    [runtime, agentSpecId, agentSpec, getAuthHeaders],
  );

  // --- Refresh Checkpoints List ---
  const refreshCheckpoints = useCallback(async () => {
    try {
      const { token, runtimesRunUrl } = await getAuthHeaders();
      const { listCheckpoints } =
        await import('@datalayer/core/lib/api/runtimes/checkpoints');
      const podName = runtime?.podName;
      const resp = await listCheckpoints(token, runtimesRunUrl, podName);
      setCheckpointRecords(resp.checkpoints || []);
    } catch (err) {
      // Non-fatal — just log
      console.warn('Failed to refresh checkpoints:', err);
    }
  }, [runtime, getAuthHeaders]);

  // --- Terminate (Delete Runtime) ---
  const terminate = useCallback(async () => {
    if (!runtime) {
      storeDisconnect();
      setDurableStatus('idle');
      return;
    }

    try {
      const { token, runtimesRunUrl } = await getAuthHeaders();
      const { deleteRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');
      await deleteRuntime(token, runtime.podName, runtimesRunUrl);
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
    checkpoint,
    refreshCheckpoints,

    // Checkpoints
    checkpoints: checkpointRecords,

    // Status
    isReady,
    error: combinedError,
  };
}
