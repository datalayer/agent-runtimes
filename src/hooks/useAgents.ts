/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Unified hook for managing agents.
 *
 * @module hooks/useAgents
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import {
  useAgentStore,
  useAgentRuntime,
  useAgentStatus,
  useAgentError,
  useIsLaunching,
} from '../state/substates/AgentState';

// Imports for useAgentRuntimes hooks (self-contained, no useCache dependency)
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIAMStore } from '@datalayer/core/lib/state';
import * as aiAgentsApi from '../api';

// Imports for useAIAgents hook
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { URLExt } from '@jupyterlab/coreutils';

// Imports for useAgentCatalogStore
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { listAgentSpecs } from '../specs';
import type { AgentSpec } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types (formerly agents/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unified agent status covering the full lifecycle.
 *
 * Covers both the runtime lifecycle (idle → launching → connecting → ready → disconnected)
 * and the agent UI state (initializing, running, paused, resuming).
 */
export type AgentStatus =
  | 'idle'
  | 'initializing'
  | 'launching'
  | 'connecting'
  | 'ready'
  | 'running'
  | 'paused'
  | 'pausing'
  | 'resumed'
  | 'resuming'
  | 'error'
  | 'disconnected';

/** Shared Label variants for agent lifecycle statuses. */
export type AgentStatusColorVariant =
  | 'secondary'
  | 'attention'
  | 'success'
  | 'severe'
  | 'accent'
  | 'danger';

/** Shared Label variants for agent lifecycle statuses. */
export const AGENT_STATUS_COLORS: Record<AgentStatus, AgentStatusColorVariant> =
  {
    idle: 'secondary',
    initializing: 'attention',
    launching: 'attention',
    connecting: 'attention',
    ready: 'success',
    running: 'success',
    pausing: 'attention',
    paused: 'severe',
    resumed: 'accent',
    resuming: 'accent',
    error: 'danger',
    disconnected: 'secondary',
  };

/**
 * Information about a connected agent with agent-runtimes server.
 * Combines agent infrastructure and connection details.
 */
export interface AgentConnection {
  /** Runtime pod name (unique identifier) */
  podName: string;
  /** Environment name */
  environmentName: string;
  /** Base URL for the Jupyter server */
  jupyterBaseUrl: string;
  /** Base URL for the agent-runtimes server */
  agentBaseUrl: string;
  /** JupyterLab ServiceManager for the runtime */
  serviceManager?: ServiceManager.IManager;
  /** Runtime status */
  status: AgentStatus;
  /** Kernel ID if connected */
  kernelId?: string;
  /** Agent ID */
  agentId?: string;
  /** Full endpoint URL for the agent */
  endpoint?: string;
  /** Whether the agent is ready to use */
  isReady?: boolean;
}

/**
 * Configuration for creating an agent on a runtime.
 */
export interface AgentConfig {
  /** Agent name/ID (defaults to runtime pod name) */
  name?: string;
  /** Agent description */
  description?: string;
  /** AI model to use (e.g., 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0') */
  model?: string;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Agent library (defaults to 'pydantic-ai') */
  agentLibrary?: 'pydantic-ai' | 'langchain' | 'openai';
  /** Transport protocol (defaults to 'ag-ui') */
  transport?: 'ag-ui' | 'vercel-ai' | 'acp' | 'a2a';
}

/**
 * Complete state for an agent runtime in the Zustand store.
 */
export interface AgentRuntimeState {
  /** Runtime connection including agent info (null if not connected) */
  runtime: AgentConnection | null;
  /** Current status */
  status: AgentStatus;
  /** Error message if any */
  error: string | null;
  /** Whether the runtime is launching */
  isLaunching: boolean;
  /** Whether the agent is ready */
  isReady: boolean;
}

/**
 * Default agent configuration values (minimal fallbacks when no spec is provided).
 */
export const DEFAULT_AGENT_CONFIG: Required<AgentConfig> = {
  name: 'ai-agent',
  description: 'AI Assistant',
  model: '',
  systemPrompt: 'You are a helpful AI assistant.',
  agentLibrary: 'pydantic-ai',
  transport: 'ag-ui',
};

// ═══════════════════════════════════════════════════════════════════════════
// useAgentshook types
// ═══════════════════════════════════════════════════════════════════════════

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
  checkpoint_mode?: 'criu' | 'light';
  messages?: string[];
  status: string;
  status_message?: string;
  updated_at: string;
}

export type CheckpointMode = 'criu' | 'light';

/**
 * Options for the useAgentshook.
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
 * Return type for the useAgentshook.
 */
export interface UseAgentReturn {
  // Runtime
  /** Current runtime connection (null if not connected) */
  runtime: AgentConnection | null;
  /** Combined agent status */
  status: AgentStatus;
  /** Whether the runtime is launching */
  isLaunching: boolean;
  /** Launch a new runtime */
  launchRuntime: (options?: IRuntimeOptions) => Promise<AgentConnection>;
  /** Connect to an existing runtime */
  connectToRuntime: (options: {
    podName: string;
    environmentName: string;
    serviceManager?: ServiceManager.IManager;
    jupyterBaseUrl?: string;
    kernelId?: string;
  }) => void;
  /** Disconnect from the runtime */
  disconnect: () => void;

  // Agent
  /** Agent endpoint URL (derived from runtime connection) */
  endpoint: string | null;
  /** ServiceManager for the runtime */
  serviceManager: ServiceManager.IManager | null;
  /** Create an agent on the runtime */
  createAgent: (
    config?: AgentConfig,
  ) => Promise<Pick<AgentConnection, 'agentId' | 'endpoint' | 'isReady'>>;
  /** Whether agent creation is currently in progress */
  isCreating: boolean;

  // Lifecycle (durable)
  /** Pause the agent (checkpoint mode aware) */
  pause: (mode?: CheckpointMode, messages?: string[]) => Promise<void>;
  /** Resume a paused agent (checkpoint mode aware) */
  resume: (
    mode?: CheckpointMode,
    checkpointId?: string,
    podName?: string,
  ) => Promise<void>;
  /** Terminate the agent (delete runtime) */
  terminate: () => Promise<void>;
  /** Take a checkpoint and persist (pause → record → stay paused) */
  checkpoint: (
    name?: string,
    mode?: CheckpointMode,
    messages?: string[],
  ) => Promise<void>;
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

  // Runtime catalog operations (merged from useAgentRuntimes* hooks)
  /** All runtimes (running + paused) available for the user */
  runtimes: AgentRuntimeData[];
  /** Loading state for runtime list */
  isRuntimesLoading: boolean;
  /** Error state for runtime list */
  isRuntimesError: boolean;
  /** Error object for runtime list */
  runtimesError: unknown;
  /** Refetch runtime list immediately */
  refetchRuntimes: () => Promise<void>;
  /** Invalidate runtime list query */
  refreshRuntimes: () => void;
  /** Delete a running runtime by pod name */
  deleteRuntimeByPod: (podName: string) => Promise<unknown>;
  /** Delete a paused runtime record by pod name */
  deletePausedRuntimeByPod: (podName: string) => Promise<unknown>;
  /** Resume a paused runtime by pod name */
  resumePausedRuntimeByPod: (podName: string) => Promise<unknown>;
  /** Create a runtime */
  createRuntime: (data: CreateAgentRuntimeRequest) => Promise<unknown>;
}

// Need to re-import IRuntimeOptions as a value-level reference for use in the hook
import type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';

// ═══════════════════════════════════════════════════════════════════════════
// useAgentshook
// ═══════════════════════════════════════════════════════════════════════════

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
 * const { isReady, endpoint, connectToRuntime } = useAgents({
 *   autoCreateAgent: true,
 *   agentConfig: { model: 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0' },
 * });
 *
 * // Durable mode — full lifecycle
 * const { isReady, endpoint, pause, resume, terminate } = useAgents({
 *   agentSpecId: 'my-agent-spec',
 *   autoStart: true,
 *   agentConfig: { name: 'my-agent', transport: 'ag-ui' },
 * });
 * ```
 */
export function useAgents(options: UseAgentOptions = {}): UseAgentReturn {
  const {
    agentSpecId,
    agentConfig,
    autoCreateAgent = true,
    autoStart = false,
    agentSpec,
  } = options;

  // Base store state
  const runtime = useAgentRuntime();
  const baseStatus = useAgentStatus();
  const storeError = useAgentError();
  const isLaunching = useIsLaunching();

  // Store actions
  const storeLaunchAgent = useAgentStore(state => state.launchAgent);
  const storeConnectAgent = useAgentStore(state => state.connectAgent);
  const storeCreateAgent = useAgentStore(state => state.createAgent);
  const storeDisconnect = useAgentStore(state => state.disconnect);

  // Runtime catalog hooks (single-hook surface for consumers)
  const runtimesQuery = useAgentRuntimes();
  const createRuntimeMutation = useCreateAgentRuntime();
  const deleteRuntimeMutation = useDeleteAgentRuntime();
  const deletePausedRuntimeMutation = useDeletePausedAgentRuntime();
  const resumePausedRuntimeMutation = useResumePausedAgentRuntime();
  const refreshRuntimes = useRefreshAgentRuntimes();

  // Durable-specific local state
  const [durableStatus, setDurableStatus] = useState<AgentStatus>('idle');
  const [durableError, setDurableError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [checkpointRecords, setCheckpointRecords] = useState<
    CheckpointRecord[]
  >([]);
  const hasAutoStarted = useRef(false);
  const hasCreatedAgentRef = useRef(false);
  const lastRuntimePodRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
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
          const safeName = `${agentSpecId}`
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
      if (creatingRef.current) {
        throw new Error('Agent creation already in progress');
      }

      creatingRef.current = true;
      setIsCreating(true);

      try {
        // Build spec-derived defaults from the agent spec (if provided)
        const specDefaults: Partial<AgentConfig> = {};
        if (agentSpec) {
          if (agentSpec.model) specDefaults.model = agentSpec.model;
          if (agentSpec.protocol)
            specDefaults.transport =
              agentSpec.protocol as AgentConfig['transport'];
          if (agentSpec.systemPrompt)
            specDefaults.systemPrompt = agentSpec.systemPrompt;
          if (agentSpec.description)
            specDefaults.description = agentSpec.description;
          if (agentSpec.name) specDefaults.name = agentSpec.name;
        }

        // Merge configs: DEFAULT_AGENT_CONFIG < spec < options.agentConfig < override config
        const mergedConfig: AgentConfig = {
          ...DEFAULT_AGENT_CONFIG,
          ...specDefaults,
          ...agentConfig,
          ...config,
          name:
            config?.name ||
            agentConfig?.name ||
            (isDurable && agentSpecId ? agentSpecId : runtime?.podName),
        };

        if (isDurable && agentSpecId) {
          return await storeCreateAgent(mergedConfig);
        }
        return await storeCreateAgent(mergedConfig);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (isDurable) {
          setDurableError(msg);
          setDurableStatus('error');
        }
        throw err;
      } finally {
        creatingRef.current = false;
        setIsCreating(false);
      }
    },
    [agentSpecId, agentConfig, agentSpec, isDurable, runtime, storeCreateAgent],
  );

  // ─── Pause (checkpoint mode aware) ───────────────────────────────────

  const pause = useCallback(
    async (mode: CheckpointMode = 'light', messages?: string[]) => {
      if (!runtime) {
        setDurableError('No runtime to pause');
        return;
      }
      if (durableStatus === 'resumed') {
        setDurableError('Resumed agents cannot be paused');
        return;
      }
      try {
        const { token, runtimesRunUrl } = await getAuthHeaders();
        const { pauseRuntime } =
          await import('@datalayer/core/lib/api/runtimes/runtimes');
        const resp = await pauseRuntime(
          token,
          runtime.podName,
          runtimesRunUrl,
          {
            agent_spec_id: agentSpecId,
            checkpoint_mode: mode,
            ...(messages && mode === 'light' ? { messages } : {}),
            ...(agentSpec ? { agentspec: agentSpec } : {}),
          },
        );
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
              `Checkpoint ${resp.checkpoint_id} failed during ${mode.toUpperCase()} pause`,
            );
          }
        }
        setDurableStatus('paused');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDurableError(msg);
      }
    },
    [runtime, durableStatus, getAuthHeaders, agentSpecId, agentSpec],
  );

  // ─── Resume (checkpoint restore) ───────────────────────────────────

  const resume = useCallback(
    async (
      mode: CheckpointMode = 'criu',
      checkpointId?: string,
      podName?: string,
    ) => {
      setDurableStatus('resuming');
      setDurableError(null);
      try {
        const { token, runtimesRunUrl } = await getAuthHeaders();
        // Resolve the pod name: explicit arg > current runtime > checkpoint record lookup
        const targetPodName =
          podName ||
          runtime?.podName ||
          (checkpointId
            ? checkpointRecords.find(c => c.id === checkpointId)?.runtime_uid
            : undefined);
        if (targetPodName) {
          const { resumeRuntime, listRuntimes } =
            await import('@datalayer/core/lib/api/runtimes/runtimes');
          await resumeRuntime(token, targetPodName, runtimesRunUrl, {
            agent_spec_id: agentSpecId,
            checkpoint_mode: mode,
            ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
          });

          // Resume (especially light restore) may move the session to a
          // different pool pod. Refresh and rebind runtime connection so
          // downstream calls target the restored runtime URL.
          try {
            const runtimesResponse = await listRuntimes(token, runtimesRunUrl);
            const runtimes = runtimesResponse.runtimes || [];
            const aiAgentRuntimes = runtimes.filter(rt => {
              if (rt.environment_name !== 'ai-agents-env') {
                return false;
              }
              if (!agentSpecId) {
                return true;
              }
              const runtimeAgentSpecId = (rt as { agent_spec_id?: string })
                .agent_spec_id;
              return runtimeAgentSpecId === agentSpecId;
            });
            const latestRuntime = aiAgentRuntimes.slice().sort((a, b) => {
              const aTs = Number(a.started_at || 0);
              const bTs = Number(b.started_at || 0);
              return bTs - aTs;
            })[0];
            if (latestRuntime?.pod_name && latestRuntime?.ingress) {
              storeConnectAgent({
                podName: latestRuntime.pod_name,
                environmentName: latestRuntime.environment_name,
                jupyterBaseUrl: latestRuntime.ingress,
              });
            }
          } catch (refreshError) {
            console.warn(
              'Failed to refresh runtime binding after resume:',
              refreshError,
            );
          }

          // Force agent re-creation on the (possibly new) restored pod.
          hasCreatedAgentRef.current = false;
          setDurableStatus('resumed');
        } else {
          await launchRuntime();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setDurableError(msg);
        setDurableStatus('error');
      }
    },
    [
      runtime,
      checkpointRecords,
      getAuthHeaders,
      agentSpecId,
      launchRuntime,
      storeConnectAgent,
    ],
  );

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
    async (
      name?: string,
      mode: CheckpointMode = 'criu',
      messages?: string[],
    ) => {
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
            description: `${mode.toUpperCase()} checkpoint for ${agentSpecId}`,
            checkpoint_mode: mode,
            ...(messages && mode === 'light' ? { messages } : {}),
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
            `Checkpoint ${checkpointId} failed during ${mode.toUpperCase()} pause`,
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
      !runtime.isReady &&
      !hasCreatedAgentRef.current
    ) {
      hasCreatedAgentRef.current = true;
      storeCreateAgent(agentConfigRef.current).catch(err => {
        console.error('[useAgent] Failed to auto-create agent:', err);
        hasCreatedAgentRef.current = false;
      });
    }
  }, [isDurable, autoCreateAgent, runtime, baseStatus, storeCreateAgent]);

  // ─── Auto-create agent when runtime is ready (durable mode) ─────────

  useEffect(() => {
    if (
      isDurable &&
      autoCreateAgent &&
      runtime &&
      (durableStatus === 'ready' || durableStatus === 'resumed') &&
      !runtime.isReady &&
      !hasCreatedAgentRef.current
    ) {
      hasCreatedAgentRef.current = true;
      createAgent(agentConfigRef.current).catch(err => {
        console.error('[useAgents] Failed to auto-create durable agent:', err);
        const message = err instanceof Error ? err.message : String(err);
        setDurableError(message);
        setDurableStatus('error');
        hasCreatedAgentRef.current = false;
      });
    }
  }, [isDurable, autoCreateAgent, runtime, durableStatus, createAgent]);

  // If runtime pod changes (e.g. after restore), force re-creation on new pod.
  useEffect(() => {
    const currentPod = runtime?.podName || null;
    if (!currentPod) {
      lastRuntimePodRef.current = null;
      return;
    }
    if (lastRuntimePodRef.current && lastRuntimePodRef.current !== currentPod) {
      hasCreatedAgentRef.current = false;
    }
    lastRuntimePodRef.current = currentPod;
  }, [runtime?.podName]);

  // ─── Durable bootstrap on initial load ───────────────────────────────

  useEffect(() => {
    if (!isDurable || runtime || autoStart || durableStatus !== 'idle') {
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        const { token, runtimesRunUrl } = await getAuthHeaders();
        if (!token) {
          return;
        }
        const { listRuntimes } =
          await import('@datalayer/core/lib/api/runtimes/runtimes');
        const runtimesResponse = await listRuntimes(token, runtimesRunUrl);
        const runtimes = runtimesResponse.runtimes || [];
        const aiAgentRuntimes = runtimes.filter(rt => {
          if (rt.environment_name !== 'ai-agents-env') {
            return false;
          }
          if (!agentSpecId) {
            return true;
          }
          const runtimeAgentSpecId = (rt as { agent_spec_id?: string })
            .agent_spec_id;
          return runtimeAgentSpecId === agentSpecId;
        });

        const latestRuntime = aiAgentRuntimes.slice().sort((a, b) => {
          const aTs = Number(a.started_at || 0);
          const bTs = Number(b.started_at || 0);
          return bTs - aTs;
        })[0];

        if (cancelled || !latestRuntime?.pod_name || !latestRuntime?.ingress) {
          return;
        }

        storeConnectAgent({
          podName: latestRuntime.pod_name,
          environmentName: latestRuntime.environment_name,
          jupyterBaseUrl: latestRuntime.ingress,
        });

        // Ensure auto-create fires for this reconnected runtime.
        hasCreatedAgentRef.current = false;

        const resolvedStatus = mapRuntimeToStatus(
          latestRuntime as { status?: string; phase?: string },
        );
        if (resolvedStatus === 'paused') {
          setDurableStatus('paused');
        } else if (
          resolvedStatus === 'resuming' ||
          resolvedStatus === 'resumed'
        ) {
          setDurableStatus('resumed');
        } else {
          setDurableStatus('ready');
        }
      } catch (err) {
        console.warn('[useAgents] Failed to bootstrap durable runtime:', err);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    isDurable,
    runtime,
    autoStart,
    durableStatus,
    getAuthHeaders,
    agentSpecId,
    storeConnectAgent,
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
      launchRuntime();
    }
  }, [isDurable, autoStart, durableStatus, launchRuntime]);

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
    ? (durableStatus === 'ready' || durableStatus === 'resumed') &&
      !!runtime?.isReady
    : baseStatus === 'ready' && !!runtime?.isReady;
  const endpoint = runtime?.endpoint || null;
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
    endpoint,
    serviceManager,
    createAgent,
    isCreating,

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

    // Runtime catalog operations
    runtimes: runtimesQuery.data || [],
    isRuntimesLoading: runtimesQuery.isLoading,
    isRuntimesError: runtimesQuery.isError,
    runtimesError: runtimesQuery.error,
    refetchRuntimes: async () => {
      await runtimesQuery.refetch();
    },
    refreshRuntimes,
    deleteRuntimeByPod: async (podName: string) =>
      deleteRuntimeMutation.mutateAsync(podName),
    deletePausedRuntimeByPod: async (podName: string) =>
      deletePausedRuntimeMutation.mutateAsync(podName),
    resumePausedRuntimeByPod: async (podName: string) =>
      resumePausedRuntimeMutation.mutateAsync(podName),
    createRuntime: async (data: CreateAgentRuntimeRequest) =>
      createRuntimeMutation.mutateAsync(data),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Runtimes hooks (self-contained, no useCache dependency)
// ═══════════════════════════════════════════════════════════════════════════

/** Default query options for all agent runtime queries. */
const AGENT_QUERY_OPTIONS = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 10 * 60 * 1000, // 10 minutes
};

/** Query keys for agent runtimes and checkpoints. */
export const agentQueryKeys = {
  agentRuntimes: {
    all: () => ['agentRuntimes'] as const,
    lists: () => [...agentQueryKeys.agentRuntimes.all(), 'list'] as const,
    details: () => [...agentQueryKeys.agentRuntimes.all(), 'detail'] as const,
    detail: (podName: string) =>
      [...agentQueryKeys.agentRuntimes.details(), podName] as const,
  },
  checkpoints: {
    all: () => ['checkpoints'] as const,
    lists: () => [...agentQueryKeys.checkpoints.all(), 'list'] as const,
  },
} as const;

/** Request payload for creating a new agent runtime. */
export type CreateAgentRuntimeRequest = {
  environmentName?: string;
  givenName?: string;
  creditsLimit?: number;
  type?: string;
  /** 'none', 'notebook', or 'document' */
  editorVariant?: string;
  enableCodemode?: boolean;
  /** ID of the agent spec used to create this runtime */
  agentSpecId?: string;
};

/**
 * Agent Runtime data type (mapped from runtimes service).
 *
 * Backend RuntimePod fields: pod_name, environment_name, environment_title, uid,
 * type, given_name, token, ingress, reservation_id, started_at, expired_at, burning_rate.
 *
 * We map 'ingress' to 'url' for consistency with the UI.
 */
export type AgentRuntimeData = {
  pod_name: string;
  id: string;
  name: string;
  environment_name: string;
  environment_title?: string;
  given_name: string;
  phase?: string;
  type: string;
  started_at?: string;
  expired_at?: string;
  burning_rate?: number;
  status:
    | 'starting'
    | 'running'
    | 'pausing'
    | 'resuming'
    | 'resumed'
    | 'paused'
    | 'terminated'
    | 'archived';
  messageCount: number;
  // Backend returns 'ingress', mapped to 'url'
  ingress?: string;
  url?: string;
  token?: string;
  // Agent specification with suggestions for chat UI (enriched by useAgentCatalogStore)
  agentSpec?: AgentSpec;
  // ID of the agent spec used to create this runtime
  agent_spec_id?: string;
};

/**
 * Checkpoint data returned by the runtime-checkpoints API.
 */
export type CheckpointData = {
  id: string;
  name: string;
  description: string;
  runtime_uid: string;
  agent_spec_id: string;
  agentspec: Record<string, unknown>;
  metadata: Record<string, unknown>;
  checkpoint_mode?: 'criu' | 'light';
  messages?: string[];
  status: string;
  status_message: string;
  updated_at: string;
  start_date?: string;
  end_date?: string;
};

/**
 * Helper: map a raw runtime phase to a UI-friendly status.
 */
function mapPhaseToStatus(phase?: string): AgentRuntimeData['status'] {
  switch ((phase || '').toLowerCase()) {
    case 'resume':
    case 'resumed':
      return 'resumed';
    case 'resuming':
      return 'resuming';
    case 'pausing':
      return 'pausing';
    case 'pending':
      return 'starting';
    case 'terminated':
      return 'terminated';
    case 'paused':
      return 'paused';
    case 'archived':
      return 'archived';
    default:
      return 'running';
  }
}

/**
 * Normalize raw runtime status values from the backend.
 *
 * Some backends emit transient `resume`; we normalize it to `resumed`.
 */
function normalizeRuntimeStatus(
  status?: string,
): AgentRuntimeData['status'] | undefined {
  if (!status) return undefined;
  switch (status.toLowerCase()) {
    case 'resume':
    case 'resumed':
      return 'resumed';
    case 'resuming':
      return 'resuming';
    case 'pausing':
      return 'pausing';
    case 'paused':
      return 'paused';
    case 'starting':
    case 'pending':
    case 'launching':
      return 'starting';
    case 'terminated':
      return 'terminated';
    case 'archived':
      return 'archived';
    case 'running':
      return 'running';
    default:
      return 'running';
  }
}

/**
 * Map runtime record to UI status, preferring explicit runtime.status when present.
 */
function mapRuntimeToStatus(runtime: {
  status?: string;
  phase?: string;
}): AgentRuntimeData['status'] {
  return (
    normalizeRuntimeStatus(runtime.status) || mapPhaseToStatus(runtime.phase)
  );
}

/**
 * Hook to access all agent runtime operations.
 *
 * @example
 * ```tsx
 * const {
 *   useAgentRuntime,
 *   useAgentRuntimes,
 *   useCreateAgentRuntime,
 *   useDeleteAgentRuntime,
 *   useRefreshAgentRuntimes,
 * } = useAgentRuntimesCache();
 * ```
 */
export function useAgentRuntimesCache() {
  return {
    useAgentRuntime: useAgentRuntimeByPodName,
    useAgentRuntimes,
    useCreateAgentRuntime,
    useDeleteAgentRuntime,
    useDeletePausedAgentRuntime,
    useRefreshAgentRuntimes,
    queryKeys: agentQueryKeys,
  };
}

/**
 * Hook to fetch user's agent runtimes (running agent instances).
 *
 * The backend returns active runtimes from the operator **plus** paused
 * runtimes synthesised from Solr checkpoint records (with ``phase="Paused"``).
 *
 * Phase to status mapping:
 * - ``Pending``    → ``starting``
 * - ``Paused``     → ``paused``
 * - ``Terminated`` → ``terminated``
 * - ``Archived``   → ``archived``
 * - (default)      → ``running``
 */
export function useAgentRuntimes() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const { user } = useIAMStore();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: agentQueryKeys.agentRuntimes.lists(),
    queryFn: async () => {
      const resp = await requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes`,
        method: 'GET',
      });
      if (resp.success && resp.runtimes) {
        const agentRuntimes = (resp.runtimes as AgentRuntimeData[])
          .filter(
            (rt: AgentRuntimeData) => rt.environment_name === 'ai-agents-env',
          )
          .map((rt: AgentRuntimeData) => ({
            ...rt,
            status: mapRuntimeToStatus(rt),
            name: rt.given_name || rt.pod_name,
            id: rt.pod_name,
            url: rt.ingress,
            messageCount: 0,
            agent_spec_id: rt.agent_spec_id || undefined,
          }));
        agentRuntimes.forEach((runtime: AgentRuntimeData) => {
          queryClient.setQueryData(
            agentQueryKeys.agentRuntimes.detail(runtime.pod_name),
            runtime,
          );
        });
        return agentRuntimes;
      }
      return [];
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: 10000,
    enabled: !!user,
  });
}

/**
 * Hook to fetch a single agent runtime by pod name.
 */
export function useAgentRuntimeByPodName(podName: string | undefined) {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });

  return useQuery({
    queryKey: agentQueryKeys.agentRuntimes.detail(podName ?? ''),
    queryFn: async () => {
      const resp = await requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}`,
        method: 'GET',
      });
      if (resp.runtime) {
        const rt = resp.runtime as AgentRuntimeData;
        return {
          ...rt,
          status: mapRuntimeToStatus(rt),
          name: rt.given_name || rt.pod_name,
          id: rt.pod_name,
          url: rt.ingress,
          messageCount: 0,
          agent_spec_id: rt.agent_spec_id || undefined,
        };
      }
      throw new Error('Failed to fetch agent runtime');
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: query => {
      if (query.state.error) return false;
      return 5000;
    },
    retry: false,
    enabled: !!podName,
  });
}

/**
 * Hook to create a new agent runtime.
 */
export function useCreateAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateAgentRuntimeRequest) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes`,
        method: 'POST',
        body: {
          environment_name: data.environmentName || 'ai-agents-env',
          given_name: data.givenName || 'Agent',
          credits_limit: data.creditsLimit || 10,
          type: data.type || 'notebook',
          editor_variant: data.editorVariant || 'none',
          enable_codemode: data.enableCodemode ?? false,
          agent_spec_id: data.agentSpecId || undefined,
        },
      });
    },
    onSuccess: resp => {
      if (resp.success && resp.runtime) {
        const rt = resp.runtime as AgentRuntimeData;
        queryClient.setQueryData(
          agentQueryKeys.agentRuntimes.detail(rt.pod_name),
          {
            ...rt,
            status: mapRuntimeToStatus(rt),
            name: rt.given_name || rt.pod_name,
            id: rt.pod_name,
            url: rt.ingress,
            messageCount: 0,
            agent_spec_id: rt.agent_spec_id || undefined,
          },
        );
        queryClient.invalidateQueries({
          queryKey: agentQueryKeys.agentRuntimes.all(),
        });
      }
    },
  });
}

/**
 * Hook to delete an agent runtime.
 */
export function useDeleteAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podName: string) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}`,
        method: 'DELETE',
      });
    },
    onSuccess: (_data, podName) => {
      queryClient.cancelQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.removeQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.lists(),
      });
    },
  });
}

/**
 * Hook to delete a paused agent runtime.
 *
 * Paused agents have no K8s pod — their state lives entirely in Solr
 * checkpoint records. This calls the dedicated
 * ``DELETE /runtimes/{podName}/paused`` endpoint which removes those
 * Solr records.
 */
export function useDeletePausedAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podName: string) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}/paused`,
        method: 'DELETE',
      });
    },
    onSuccess: (_data, podName) => {
      queryClient.cancelQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.removeQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(podName),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

/**
 * Hook to resume a paused agent runtime via checkpoint restore.
 *
 * Calls ``POST /runtimes/{podName}/resume`` which triggers an async
 * background restore from the latest checkpoint.
 */
export function useResumePausedAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (podName: string) => {
      return requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtimes/${podName}/resume`,
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.all(),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.checkpoints.all(),
      });
    },
  });
}

/**
 * Hook to refresh agent runtimes list.
 */
export function useRefreshAgentRuntimes() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: agentQueryKeys.agentRuntimes.all(),
    });
  };
}

// ============================================================================
// Checkpoint Hooks (light by default, CRIU optional)
// ============================================================================

/**
 * Fetch all runtime checkpoints for the current user.
 *
 * Calls ``GET /api/runtimes/v1/runtime-checkpoints`` and returns
 * the list of checkpoint records in visible states.
 */
export function useCheckpoints() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const { user } = useIAMStore();

  return useQuery({
    queryKey: agentQueryKeys.checkpoints.lists(),
    queryFn: async () => {
      const resp = await requestDatalayer({
        url: `${configuration.runtimesRunUrl}/api/runtimes/v1/runtime-checkpoints`,
        method: 'GET',
      });
      if (resp.success && resp.checkpoints) {
        return resp.checkpoints as CheckpointData[];
      }
      return [] as CheckpointData[];
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: 15000,
    enabled: !!user,
  });
}

/**
 * Hook to refresh the checkpoints list.
 */
export function useRefreshCheckpoints() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: agentQueryKeys.checkpoints.all(),
    });
  };
}

// ============================================================================
// Lifecycle Store (resume / pause local UI state)
// ============================================================================

export type AgentLifecycleRecord = {
  resumePending: boolean;
  pauseLockedForResumed: boolean;
};

export type LifecycleRunningAgent = AgentRuntimeData;

export const getAgentLifecycleKey = (runtimeKey: string) =>
  `datalayer:agent-durable:lifecycle:${runtimeKey}`;

type AgentLifecycleState = {
  byRuntimeKey: Record<string, AgentLifecycleRecord>;
  markResumePending: (runtimeKey: string) => void;
  markResumeFailed: (runtimeKey: string) => void;
  markResumeSettled: (runtimeKey: string) => void;
  clearRuntimeLifecycle: (runtimeKey: string) => void;
};

const DEFAULT_LIFECYCLE_RECORD: AgentLifecycleRecord = {
  resumePending: false,
  pauseLockedForResumed: false,
};

export const useAgentLifecycleStore = create<AgentLifecycleState>()(
  persist(
    (set, get) => ({
      byRuntimeKey: {},

      markResumePending: (runtimeKey: string) => {
        if (!runtimeKey) return;
        set(state => ({
          byRuntimeKey: {
            ...state.byRuntimeKey,
            [runtimeKey]: {
              ...DEFAULT_LIFECYCLE_RECORD,
              ...(state.byRuntimeKey[runtimeKey] ?? {}),
              resumePending: true,
            },
          },
        }));
      },

      markResumeFailed: (runtimeKey: string) => {
        if (!runtimeKey) return;
        set(state => ({
          byRuntimeKey: {
            ...state.byRuntimeKey,
            [runtimeKey]: {
              ...DEFAULT_LIFECYCLE_RECORD,
              ...(state.byRuntimeKey[runtimeKey] ?? {}),
              resumePending: false,
              pauseLockedForResumed: false,
            },
          },
        }));
      },

      markResumeSettled: (runtimeKey: string) => {
        if (!runtimeKey) return;
        set(state => ({
          byRuntimeKey: {
            ...state.byRuntimeKey,
            [runtimeKey]: {
              ...DEFAULT_LIFECYCLE_RECORD,
              ...(state.byRuntimeKey[runtimeKey] ?? {}),
              resumePending: false,
              pauseLockedForResumed: true,
            },
          },
        }));
      },

      clearRuntimeLifecycle: (runtimeKey: string) => {
        if (!runtimeKey) return;
        const next = { ...get().byRuntimeKey };
        delete next[runtimeKey];
        set({ byRuntimeKey: next });
      },
    }),
    {
      name: 'datalayer-agent-lifecycle',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ byRuntimeKey: state.byRuntimeKey }),
    },
  ),
);

export function useLifecycleRunningAgents() {
  return useAgentRuntimes();
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Agents REST API hook.
// ═══════════════════════════════════════════════════════════════════════════

export type RequestOptions = {
  signal?: AbortSignal;
  baseUrl?: string;
};

export type RoomType = 'notebook_persist' | 'notebook_memory' | 'doc_memory';

export const useAIAgents = (baseUrlOverride = 'api/ai-agents/v1') => {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const createAIAgent = (
    documentId: string,
    documentType: RoomType,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'POST',
      body: {
        document_id: documentId,
        document_type: documentType,
        runtime: {
          ingress,
          token,
          kernel_id: kernelId,
        },
      },
      signal,
    });
  };
  const getAIAgents = ({
    signal,
    baseUrl = baseUrlOverride,
  }: RequestOptions = {}) => {
    return requestDatalayer({
      url: URLExt.join(configuration.aiagentsRunUrl, baseUrl, 'agents'),
      method: 'GET',
      signal,
    });
  };
  const deleteAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'DELETE',
      signal,
    });
  };
  const getAIAgent = (
    documentId: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'GET',
      signal,
    });
  };
  const patchAIAgent = (
    documentId: string,
    ingress?: string,
    token?: string,
    kernelId?: string,
    { signal, baseUrl = baseUrlOverride }: RequestOptions = {},
  ) => {
    return requestDatalayer({
      url: URLExt.join(
        configuration.aiagentsRunUrl,
        baseUrl,
        'agents',
        documentId,
      ),
      method: 'PATCH',
      body: {
        runtime:
          ingress && token && kernelId
            ? {
                ingress,
                token,
                kernel_id: kernelId,
              }
            : null,
      },
      signal,
    });
  };
  return {
    createAIAgent,
    getAIAgents,
    deleteAIAgent,
    getAIAgent,
    patchAIAgent,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard data hooks (tool approvals, notifications, events)
// ═══════════════════════════════════════════════════════════════════════════

function useDashboardAuthToken(): string {
  const token = useIAMStore((s: any) => s.token);
  return token ?? '';
}

function useDashboardBaseUrl(): string {
  const config = useCoreStore((s: any) => s.configuration);
  return config?.aiagentsRunUrl ?? config?.iamRunUrl ?? '';
}

export function useToolApprovals(filters?: aiAgentsApi.ToolApprovalFilters) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['tool-approvals', filters],
    queryFn: () =>
      aiAgentsApi.toolApprovals.getToolApprovals(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function usePendingApprovalCount() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['tool-approvals', 'pending-count'],
    queryFn: () =>
      aiAgentsApi.toolApprovals.getPendingApprovalCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useApproveToolRequest() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      aiAgentsApi.toolApprovals.approveToolRequest(token, id, note, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useRejectToolRequest() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      aiAgentsApi.toolApprovals.rejectToolRequest(token, id, note, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useNotifications(filters?: aiAgentsApi.NotificationFilters) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', filters],
    queryFn: () =>
      aiAgentsApi.notifications.getNotifications(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useUnreadNotificationCount() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', 'unread-count'],
    queryFn: () => aiAgentsApi.notifications.getUnreadCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useMarkNotificationRead() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      aiAgentsApi.notifications.markNotificationRead(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => aiAgentsApi.notifications.markAllRead(token, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

export function useAgentEvents(params?: aiAgentsApi.ListAgentEventsParams) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-events', params],
    queryFn: () => aiAgentsApi.events.listEvents(token, params ?? {}, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAgentEvent(eventId?: string) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-events', eventId],
    queryFn: () =>
      aiAgentsApi.events.getEvent(token, eventId as string, baseUrl),
    enabled: !!token && !!eventId,
    staleTime: 10_000,
  });
}

export function useCreateAgentEvent() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: aiAgentsApi.CreateAgentEventRequest) =>
      aiAgentsApi.events.createEvent(token, payload, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useUpdateAgentEvent() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      payload,
    }: {
      eventId: string;
      payload: aiAgentsApi.UpdateAgentEventRequest;
    }) => aiAgentsApi.events.updateEvent(token, eventId, payload, baseUrl),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
      queryClient.invalidateQueries({
        queryKey: ['agent-events', variables.eventId],
      });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Catalog Store (formerly useAgentStore.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Centralised Zustand store for agents.
 *
 * Two collections are maintained:
 *
 * 1. **agentSpecs** – the static catalogue of available agent blueprints
 *    (from `@datalayer/agent-runtimes/lib/specs`).
 *    Populated once at import time; call `refreshSpecs()` to re-read.
 *
 * 2. **runningAgents** – live agent runtimes fetched from the runtimes
 *    service.  Updated via `setRunningAgents()` whenever the TanStack
 *    query refreshes.
 *
 * The store is consumed by `AgentAssignMenu` to show two action groups:
 * • **Running Agents** – already-running runtimes that can be re-attached
 * • **New Agents** – agent specs that can be instantiated
 */

export type AgentCatalogStoreState = {
  /** Static catalogue of agent blueprints. */
  agentSpecs: AgentSpec[];

  /** Live agent runtimes (running / starting). */
  runningAgents: AgentRuntimeData[];

  // ---- Mutators ----

  /** Re-read agent specs from the config. */
  refreshSpecs: () => void;

  /** Replace the running agents list (call from TanStack query effect). */
  setRunningAgents: (agents: AgentRuntimeData[]) => void;
};

export const useAgentCatalogStore = create<AgentCatalogStoreState>()(set => ({
  agentSpecs: listAgentSpecs(),
  runningAgents: [],

  refreshSpecs: () => set({ agentSpecs: listAgentSpecs() }),

  setRunningAgents: agents =>
    set(state => ({
      runningAgents: agents.map(agent => {
        if (agent.agentSpec) return agent;
        if (!agent.agent_spec_id) return agent;
        const spec = state.agentSpecs.find(s => s.id === agent.agent_spec_id);
        return spec ? { ...agent, agentSpec: spec } : agent;
      }),
    })),
}));
