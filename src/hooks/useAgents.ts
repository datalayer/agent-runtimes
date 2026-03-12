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

// Imports for useAgentRuntimes hooks
import { useCache } from '@datalayer/core/lib/hooks';

// Imports for useAIAgents hook
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { URLExt } from '@jupyterlab/coreutils';

// Imports for useAgentCatalogStore
import { create } from 'zustand';
import { listAgentSpecs } from '../specs';
import type { AgentSpec } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// Types (formerly agents/types.ts)
// ═══════════════════════════════════════════════════════════════════════════

// Re-export core runtime types from @datalayer/core
export type {
  IRuntimeLocation,
  IRuntimeType,
  IRuntimeCapabilities,
  IRuntimePod,
  IRuntimeDesc,
} from '@datalayer/core/lib/models';

export type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';

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
  | 'resuming'
  | 'error'
  | 'disconnected';

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
  serviceManager: ServiceManager.IManager;
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
  status: string;
  status_message?: string;
  updated_at: string;
}

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
    serviceManager: ServiceManager.IManager;
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

  // Durable-specific local state
  const [durableStatus, setDurableStatus] = useState<AgentStatus>('idle');
  const [durableError, setDurableError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [checkpointRecords, setCheckpointRecords] = useState<
    CheckpointRecord[]
  >([]);
  const hasAutoStarted = useRef(false);
  const hasCreatedAgentRef = useRef(false);
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
          return await storeCreateAgent({ name: agentSpecId, ...mergedConfig });
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
    ? durableStatus === 'ready' && !!runtime?.isReady
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
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Runtimes hooks (formerly useAgentRuntimes.ts)
// ═══════════════════════════════════════════════════════════════════════════

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
  status: 'starting' | 'running' | 'paused' | 'terminated' | 'archived';
  messageCount: number;
  // Backend returns 'ingress', mapped to 'url' in useCache
  ingress?: string;
  url?: string;
  token?: string;
  // Agent specification with suggestions for chat UI (enriched by useAgentCatalogStore)
  agentSpec?: AgentSpec;
  // ID of the agent spec used to create this runtime
  agent_spec_id?: string;
};

/**
 * Hook to access all agent runtime operations from the centralized cache.
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
  const cache = useCache();

  return {
    useAgentRuntime: cache.useAgentRuntime,
    useAgentRuntimes: cache.useAgentRuntimes,
    useCreateAgentRuntime: cache.useCreateAgentRuntime,
    useDeleteAgentRuntime: cache.useDeleteAgentRuntime,
    useDeletePausedAgentRuntime: cache.useDeletePausedAgentRuntime,
    useRefreshAgentRuntimes: cache.useRefreshAgentRuntimes,
    queryKeys: cache.queryKeys,
  };
}

/**
 * Hook to fetch user's agent runtimes (running agent instances).
 * Used by the sidebar to show running/paused/terminated agents.
 */
export function useAgentRuntimes() {
  const { useAgentRuntimes: hook } = useCache();
  return hook();
}

/**
 * Hook to fetch a single agent runtime by pod name.
 */
export function useAgentRuntimeByPodName(podName: string | undefined) {
  const { useAgentRuntime: hook } = useCache();
  return hook(podName);
}

/**
 * Hook to create a new agent runtime.
 */
export function useCreateAgentRuntime() {
  const { useCreateAgentRuntime: hook } = useCache();
  return hook();
}

/**
 * Hook to delete an agent runtime.
 */
export function useDeleteAgentRuntime() {
  const { useDeleteAgentRuntime: hook } = useCache();
  return hook();
}

/**
 * Hook to delete a paused agent runtime (removes Solr checkpoint records).
 */
export function useDeletePausedAgentRuntime() {
  const { useDeletePausedAgentRuntime: hook } = useCache();
  return hook();
}

/**
 * Hook to refresh agent runtimes list.
 */
export function useRefreshAgentRuntimes() {
  const { useRefreshAgentRuntimes: hook } = useCache();
  return hook();
}

// ═══════════════════════════════════════════════════════════════════════════
// AI Agents REST API hook (formerly useAgents.tsx)
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

  /** Live agent runtimes (paused). */
  pausedAgents: AgentRuntimeData[];

  // ---- Mutators ----

  /** Re-read agent specs from the config. */
  refreshSpecs: () => void;

  /** Replace the running agents list (call from TanStack query effect). */
  setRunningAgents: (agents: AgentRuntimeData[]) => void;

  /** Replace the paused agents list (call from TanStack query effect). */
  setPausedAgents: (agents: AgentRuntimeData[]) => void;
};

export const useAgentCatalogStore = create<AgentCatalogStoreState>()(set => ({
  agentSpecs: listAgentSpecs('datalayer-ai/'),
  runningAgents: [],
  pausedAgents: [],

  refreshSpecs: () => set({ agentSpecs: listAgentSpecs('datalayer-ai/') }),

  setRunningAgents: agents =>
    set(state => ({
      runningAgents: agents.map(agent => {
        if (agent.agentSpec) return agent;
        if (!agent.agent_spec_id) return agent;
        const spec = state.agentSpecs.find(s => s.id === agent.agent_spec_id);
        return spec ? { ...agent, agentSpec: spec } : agent;
      }),
    })),

  setPausedAgents: agents =>
    set(state => ({
      pausedAgents: agents.map(agent => {
        if (agent.agentSpec) return agent;
        if (!agent.agent_spec_id) return agent;
        const spec = state.agentSpecs.find(s => s.id === agent.agent_spec_id);
        return spec ? { ...agent, agentSpec: spec } : agent;
      }),
    })),
}));
