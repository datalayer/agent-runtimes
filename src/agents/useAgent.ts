/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Unified hook for managing agents — both ephemeral and durable.
 *
 * Merges the functionality of the former `useAgentRuntime` (ephemeral connect)
 * and `useDurableAgent` (CRIU lifecycle) into a single hook.
 *
 * @module agents/useAgent
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import {
  useAgentRuntimeStore,
  useAgentRuntime,
  useAgentFromStore,
  useAgentStatus,
  useAgentError,
  useIsLaunching,
} from './agentStore';
import type {
  IRuntimeOptions,
  AgentConfig,
  AgentConnection,
  RuntimeConnection,
  AgentStatus,
} from './types';

// ─── Types ────────────────────────────────────────────────────────────────

// AgentStatus is imported from ./types (unified superset)

/**
 * A persisted checkpoint record returned from the runtimes API.
 */
export interface CheckpointRecord {
  id: string;
  name: string;
  description: string;
  runtime_uid: string;
  agent_spec_id: string;
  agentspec: Record<string, any>;
  metadata: Record<string, any>;
  status: string;
  status_message?: string;
  updated_at: string;
}

/**
 * Options for the useAgent hook.
 */
export interface UseAgentOptions {
  /** Agent spec ID (used as identifier for durable lifecycle) */
  agentSpecId?: string;
  /** Agent configuration */
  agentConfig?: AgentConfig;
  /** Auto-create agent when runtime connects (default: true) */
  autoCreateAgent?: boolean;
  /** Auto-start runtime on mount — durable mode (default: false) */
  autoStart?: boolean;
  /** Full agent spec object (persisted with checkpoints) */
  agentSpec?: Record<string, any>;
}

/**
 * Return type for the useAgent hook.
 */
export interface UseAgentReturn {
  // Runtime
  /** Current runtime connection (null if not connected) */
  runtime: RuntimeConnection | null;
  /** Combined agent status */
  status: AgentStatus;
  /** Whether the runtime is launching */
  isLaunching: boolean;
  /** Launch a new runtime */
  launchRuntime: (options?: IRuntimeOptions) => Promise<RuntimeConnection>;
  /** Connect to an existing runtime */
  connectToRuntime: (options: {
    podName: string;
    environmentName: string;
    serviceManager: ServiceManager.IManager;
    kernelId?: string;
  }) => void;
  /** Disconnect from the runtime */
  disconnect: () => void;

  // Agent
  /** Current agent connection (null if not created) */
  agent: AgentConnection | null;
  /** Agent endpoint URL (shortcut) */
  endpoint: string | null;
  /** ServiceManager for the runtime */
  serviceManager: ServiceManager.IManager | null;
  /** Create an agent on the runtime */
  createAgent: (config?: AgentConfig) => Promise<AgentConnection>;

  // Lifecycle (durable)
  /** Pause the agent (CRIU checkpoint) */
  pause: () => Promise<void>;
  /** Resume a paused agent (CRIU restore) */
  resume: () => Promise<void>;
  /** Terminate the agent (delete runtime) */
  terminate: () => Promise<void>;
  /** Take a checkpoint and persist (pause → record → stay paused) */
  checkpoint: (name?: string) => Promise<void>;
  /** Refresh the checkpoints list from the backend */
  refreshCheckpoints: () => Promise<void>;

  // Checkpoints
  /** List of persisted checkpoints for this runtime */
  checkpoints: CheckpointRecord[];

  // Status
  /** Whether everything is ready (runtime + agent) */
  isReady: boolean;
  /** Error if any */
  error: string | null;
}

/**
 * Unified hook for managing agents.
 *
 * Works in two modes:
 * - **Ephemeral** (no `agentSpecId`): connect to an existing runtime, auto-create agent
 * - **Durable** (with `agentSpecId`): full lifecycle with launch, pause, resume, terminate
 *
 * @param options - Configuration options
 * @returns Complete agent state and controls
 *
 * @example
 * ```tsx
 * // Ephemeral mode — connect to an existing runtime
 * const { isReady, endpoint, connectToRuntime } = useAgent({
 *   autoCreateAgent: true,
 *   agentConfig: { model: 'anthropic:claude-sonnet-4-5' },
 * });
 *
 * // Durable mode — full lifecycle
 * const { isReady, endpoint, pause, resume, terminate } = useAgent({
 *   agentSpecId: 'my-agent-spec',
 *   autoStart: true,
 *   agentConfig: { name: 'my-agent', transport: 'ag-ui' },
 * });
 * ```
 */
export function useAgent(options: UseAgentOptions = {}): UseAgentReturn {
  const {
    agentSpecId,
    agentConfig,
    autoCreateAgent = true,
    autoStart = false,
    agentSpec,
  } = options;

  // Base store state
  const runtime = useAgentRuntime();
  const agent = useAgentFromStore();
  const baseStatus = useAgentStatus();
  const storeError = useAgentError();
  const isLaunching = useIsLaunching();

  // Store actions
  const storeLaunchAgent = useAgentRuntimeStore(state => state.launchAgent);
  const storeConnectAgent = useAgentRuntimeStore(state => state.connectAgent);
  const storeCreateAgent = useAgentRuntimeStore(state => state.createAgent);
  const storeDisconnect = useAgentRuntimeStore(state => state.disconnect);

  // Durable-specific local state
  const [durableStatus, setDurableStatus] = useState<AgentStatus>('idle');
  const [durableError, setDurableError] = useState<string | null>(null);
  const [checkpointRecords, setCheckpointRecords] = useState<
    CheckpointRecord[]
  >([]);
  const hasAutoStarted = useRef(false);
  const hasCreatedAgentRef = useRef(false);
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;

  // Whether we're operating in durable mode
  const isDurable = !!agentSpecId;

  // ─── Auth helpers (durable mode) ────────────────────────────────────

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

  // ─── Launch Runtime ─────────────────────────────────────────────────

  const launchRuntime = useCallback(
    async (runtimeOptions?: IRuntimeOptions) => {
      if (isDurable) {
        setDurableStatus('launching');
        setDurableError(null);
        try {
          const safeName = `durable-${agentSpecId}`
            .replace(/\//g, '-')
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 63);

          const conn = await storeLaunchAgent(
            runtimeOptions || {
              environmentName: 'ai-agents-env',
              creditsLimit: 10,
              givenName: safeName,
            },
          );
          setDurableStatus('ready');
          return conn;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setDurableError(msg);
          setDurableStatus('error');
          throw err;
        }
      } else {
        if (!runtimeOptions) {
          throw new Error('Runtime options are required in ephemeral mode');
        }
        return storeLaunchAgent(runtimeOptions);
      }
    },
    [agentSpecId, isDurable, storeLaunchAgent],
  );

  // ─── Create Agent ───────────────────────────────────────────────────

  const createAgent = useCallback(
    async (config?: AgentConfig) => {
      const merged = config || agentConfig;
      if (isDurable && agentSpecId) {
        try {
          return await storeCreateAgent({ name: agentSpecId, ...merged });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setDurableError(msg);
          setDurableStatus('error');
          throw err;
        }
      }
      return storeCreateAgent(merged);
    },
    [agentSpecId, agentConfig, isDurable, storeCreateAgent],
  );

  // ─── Pause (CRIU Checkpoint) ────────────────────────────────────────

  const pause = useCallback(async () => {
    if (!runtime) {
      setDurableError('No runtime to pause');
      return;
    }
    try {
      const { token, runtimesRunUrl } = await getAuthHeaders();
      const { pauseRuntime } =
        await import('@datalayer/core/lib/api/runtimes/runtimes');
      const resp = await pauseRuntime(token, runtime.podName, runtimesRunUrl, {
        agent_spec_id: agentSpecId,
        ...(agentSpec ? { agentspec: agentSpec } : {}),
      });
      if (resp.checkpoint_id) {
        const { waitForCheckpointStatus } =
          await import('@datalayer/core/lib/api/runtimes/checkpoints');
        const ckpt = await waitForCheckpointStatus(
          token,
          runtime.podName,
          resp.checkpoint_id,
          ['paused', 'failed'],
          runtimesRunUrl,
        );
        if (ckpt.status === 'failed') {
          throw new Error(
            `Checkpoint ${resp.checkpoint_id} failed during CRIU pause`,
          );
        }
      }
      setDurableStatus('paused');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDurableError(msg);
    }
  }, [runtime, getAuthHeaders, agentSpecId, agentSpec]);

  // ─── Resume (CRIU Restore) ─────────────────────────────────────────

  const resume = useCallback(async () => {
    setDurableStatus('resuming');
    setDurableError(null);
    try {
      const { token, runtimesRunUrl } = await getAuthHeaders();
      if (runtime) {
        const { resumeRuntime } =
          await import('@datalayer/core/lib/api/runtimes/runtimes');
        const resp = await resumeRuntime(
          token,
          runtime.podName,
          runtimesRunUrl,
          {
            agent_spec_id: agentSpecId,
          },
        );
        if (resp.checkpoint_id) {
          const { waitForCheckpointStatus } =
            await import('@datalayer/core/lib/api/runtimes/checkpoints');
          const ckpt = await waitForCheckpointStatus(
            token,
            runtime.podName,
            resp.checkpoint_id,
            ['resumed', 'failed'],
            runtimesRunUrl,
          );
          if (ckpt.status === 'failed') {
            throw new Error(
              `Checkpoint ${resp.checkpoint_id} failed during CRIU resume`,
            );
          }
        }
        setDurableStatus('ready');
      } else {
        await launchRuntime();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDurableError(msg);
      setDurableStatus('error');
    }
  }, [runtime, getAuthHeaders, agentSpecId, launchRuntime]);

  // ─── Refresh Checkpoints ───────────────────────────────────────────

  const refreshCheckpoints = useCallback(async () => {
    try {
      const { token, runtimesRunUrl } = await getAuthHeaders();
      const podName = runtime?.podName;
      if (!podName) return;
      const { listCheckpoints } =
        await import('@datalayer/core/lib/api/runtimes/checkpoints');
      const resp = await listCheckpoints(token, runtimesRunUrl, podName);
      setCheckpointRecords(resp.checkpoints || []);
    } catch (err) {
      console.warn('Failed to refresh checkpoints:', err);
    }
  }, [runtime, getAuthHeaders]);

  // ─── Checkpoint (Pause → Wait → Stay Paused) ──────────────────────

  const checkpoint = useCallback(
    async (name?: string) => {
      if (!runtime) {
        setDurableError('No runtime to checkpoint');
        return;
      }
      try {
        const { token, runtimesRunUrl } = await getAuthHeaders();
        const { pauseRuntime } =
          await import('@datalayer/core/lib/api/runtimes/runtimes');
        const pauseResp = await pauseRuntime(
          token,
          runtime.podName,
          runtimesRunUrl,
          {
            name: name || `checkpoint-${Date.now()}`,
            description: `CRIU checkpoint for ${agentSpecId}`,
            agent_spec_id: agentSpecId,
            agentspec: agentSpec || {},
          },
        );
        const checkpointId = pauseResp.checkpoint_id;
        if (!checkpointId)
          throw new Error('Pause did not return a checkpoint_id');
        const { waitForCheckpointStatus } =
          await import('@datalayer/core/lib/api/runtimes/checkpoints');
        const ckpt = await waitForCheckpointStatus(
          token,
          runtime.podName,
          checkpointId,
          ['paused', 'failed'],
          runtimesRunUrl,
        );
        if (ckpt.status === 'failed') {
          throw new Error(
            `Checkpoint ${checkpointId} failed during CRIU pause`,
          );
        }
        setDurableStatus('paused');
        await refreshCheckpoints();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDurableError(msg);
      }
    },
    [runtime, agentSpecId, agentSpec, getAuthHeaders, refreshCheckpoints],
  );

  // ─── Terminate ─────────────────────────────────────────────────────

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
      const msg = err instanceof Error ? err.message : String(err);
      setDurableError(msg);
    }
  }, [runtime, getAuthHeaders, storeDisconnect]);

  // ─── Auto-create agent when runtime is ready (ephemeral mode) ──────

  useEffect(() => {
    if (
      !isDurable &&
      autoCreateAgent &&
      runtime &&
      baseStatus === 'ready' &&
      !agent &&
      !hasCreatedAgentRef.current
    ) {
      hasCreatedAgentRef.current = true;
      storeCreateAgent(agentConfigRef.current).catch(err => {
        console.error('[useAgent] Failed to auto-create agent:', err);
        hasCreatedAgentRef.current = false;
      });
    }
  }, [
    isDurable,
    autoCreateAgent,
    runtime,
    baseStatus,
    agent,
    storeCreateAgent,
  ]);

  // Reset agent creation tracking on disconnect
  useEffect(() => {
    if (baseStatus === 'disconnected' || baseStatus === 'idle') {
      hasCreatedAgentRef.current = false;
    }
  }, [baseStatus]);

  // ─── Auto-start (durable mode) ────────────────────────────────────

  useEffect(() => {
    if (
      isDurable &&
      autoStart &&
      !hasAutoStarted.current &&
      durableStatus === 'idle'
    ) {
      hasAutoStarted.current = true;
      launchRuntime().then(() => createAgent());
    }
  }, [isDurable, autoStart, durableStatus, launchRuntime, createAgent]);

  // ─── Sync store errors ─────────────────────────────────────────────

  useEffect(() => {
    if (storeError && isDurable && durableStatus !== 'error') {
      setDurableError(storeError);
      setDurableStatus('error');
    }
  }, [storeError, isDurable, durableStatus]);

  // ─── Derived state ─────────────────────────────────────────────────

  const status: AgentStatus = isDurable
    ? durableStatus
    : (baseStatus as AgentStatus);
  const error = isDurable ? durableError || storeError : storeError;
  const isReady = isDurable
    ? durableStatus === 'ready' && !!agent?.isReady
    : baseStatus === 'ready' && !!agent?.isReady;
  const endpoint = agent?.endpoint || null;
  const serviceManager = runtime?.serviceManager || null;

  return {
    // Runtime
    runtime,
    status,
    isLaunching,
    launchRuntime,
    connectToRuntime: storeConnectAgent,
    disconnect: storeDisconnect,

    // Agent
    agent,
    endpoint,
    serviceManager,
    createAgent,

    // Lifecycle (durable)
    pause,
    resume,
    terminate,
    checkpoint,
    refreshCheckpoints,

    // Checkpoints
    checkpoints: checkpointRecords,

    // Status
    isReady,
    error,
  };
}
