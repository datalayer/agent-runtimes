/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Unified hook for managing agent runtimes.
 *
 * Combines agent lifecycle management (ephemeral/durable),
 * runtime catalog (React Query CRUD), lifecycle/catalog stores,
 * the AI Agents REST API, and the agent-runtime WebSocket stream.
 *
 * @module hooks/useAgentRuntimes
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import {
  agentRuntimeStore,
  useAgentRuntimeStore,
  useAgentRuntimeConnection,
  useAgentRuntimeStatus,
  useAgentRuntimeError,
  useAgentRuntimeIsLaunching,
} from '../stores/agentRuntimeStore';
import {
  parseAgentStreamMessage,
  type AgentStreamSnapshotPayload,
} from '../types/stream';
import { DEFAULT_AGENT_CONFIG } from '../types/config';
import type { AgentConfig } from '../types/config';
import type { AgentConnection } from '../types/connection';
import type { AgentStatus, AgentRuntimeData } from '../types/agents';
import type {
  CreateAgentRuntimeRequest,
  AgentLifecycleRecord,
  AgentLifecycleState,
  CreateRuntimeApiResponse,
} from '../types/agents-lifecycle';
import { ServiceManager } from '@jupyterlab/services/lib/manager';

/**
 * Options for the useAgents hook.
 */
export interface UseAgentOptions {
  /** Agent spec ID — when provided, enables full lifecycle management (launch, pause, resume, terminate) */
  agentSpecId?: string;
  /** Agent configuration */
  agentConfig?: AgentConfig;
  /** Auto-create agent when runtime connects (default: true) */
  autoCreateAgent?: boolean;
  /** Auto-start runtime on mount (default: false) */
  autoStart?: boolean;
  /** Full agent spec object (persisted with checkpoints) */
  agentSpec?: Record<string, any>;
}

/**
 * Return type for the useAgents hook.
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

  // Status
  /** Whether everything is ready (runtime + agent) */
  isReady: boolean;
  /** Error if any */
  error: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Stable fallback to avoid new-reference on every render. */
const EMPTY_RUNTIMES: AgentRuntimeData[] = [];

/** Default query options for all agent runtime queries. */
export const AGENT_QUERY_OPTIONS = {
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

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const RUNTIME_STATUS_MAP: Record<string, AgentStatus> = {
  resume: 'resumed',
  resumed: 'resumed',
  resuming: 'resuming',
  pausing: 'pausing',
  paused: 'paused',
  starting: 'starting',
  pending: 'starting',
  launching: 'starting',
  terminated: 'terminated',
  archived: 'archived',
  running: 'running',
};

/**
 * Map a raw backend runtime record to AgentRuntimeData.
 */
function toAgentRuntimeData(raw: Record<string, any>): AgentRuntimeData {
  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const normalizedStatus: AgentStatus = RUNTIME_STATUS_MAP[status] ?? 'running';
  return {
    ...raw,
    status: normalizedStatus,
    name: raw.given_name || raw.pod_name,
    id: raw.pod_name,
    url: raw.ingress,
    messageCount: 0,
    agent_spec_id: raw.agent_spec_id || undefined,
  } as AgentRuntimeData;
}

// ═══════════════════════════════════════════════════════════════════════════
// useAgentshook
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for managing agent runtimes.
 *
 * Works in two modes:
 * - **Connect** (no `agentSpecId`): connect to an existing runtime and auto-create agent
 * - **Lifecycle** (with `agentSpecId`): full lifecycle — launch, pause, resume, terminate
 *
 * @param options - Configuration options
 * @returns Complete agent state and controls
 *
 * @example
 * ```tsx
 * // Connect mode — attach to an existing runtime
 * const { isReady, endpoint, connectToRuntime } = useAgents({
 *   autoCreateAgent: true,
 *   agentConfig: { model: 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0' },
 * });
 *
 * // Lifecycle mode — full lifecycle with agentSpecId
 * const { isReady, endpoint, launchRuntime } = useAgents({
 *   agentSpecId: 'my-agent-spec',
 *   autoStart: true,
 *   agentConfig: { name: 'my-agent', transport: 'ag-ui' },
 * });
 * ```
 */
export function useAgentRuntimes(
  options: UseAgentOptions = {},
): UseAgentReturn {
  const {
    agentSpecId,
    agentConfig,
    autoCreateAgent = true,
    autoStart = false,
    agentSpec,
  } = options;

  // Base store state
  const runtime = useAgentRuntimeConnection();
  const baseStatus = useAgentRuntimeStatus();
  const storeError = useAgentRuntimeError();
  const isLaunching = useAgentRuntimeIsLaunching();

  // Store actions
  const storeLaunchAgent = useAgentRuntimeStore(state => state.launchAgent);
  const storeConnectAgent = useAgentRuntimeStore(state => state.connectAgent);
  const storeCreateAgent = useAgentRuntimeStore(state => state.createAgent);
  const storeDisconnect = useAgentRuntimeStore(state => state.disconnect);

  // Lifecycle local state
  const [lifecycleStatus, setLifecycleStatus] = useState<AgentStatus>('idle');
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const hasAutoStarted = useRef(false);
  const hasCreatedAgentRef = useRef(false);
  const lastRuntimePodRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;

  // Whether we're managing a full agent lifecycle (agentSpecId provided)
  const hasSpec = !!agentSpecId;

  // ─── Auth helpers ─────────────────────────────────────────────────

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
      if (hasSpec) {
        setLifecycleStatus('launching');
        setLifecycleError(null);
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
          setLifecycleStatus('ready');
          return conn;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setLifecycleError(msg);
          setLifecycleStatus('error');
          throw err;
        }
      } else {
        if (!runtimeOptions) {
          throw new Error('Runtime options are required in connect mode');
        }
        return storeLaunchAgent(runtimeOptions);
      }
    },
    [agentSpecId, hasSpec, storeLaunchAgent],
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
            specDefaults.protocol =
              agentSpec.protocol as AgentConfig['protocol'];
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
            (hasSpec && agentSpecId ? agentSpecId : runtime?.podName),
        };

        return await storeCreateAgent(mergedConfig);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (hasSpec) {
          setLifecycleError(msg);
          setLifecycleStatus('error');
        }
        throw err;
      } finally {
        creatingRef.current = false;
        setIsCreating(false);
      }
    },
    [agentSpecId, agentConfig, agentSpec, hasSpec, runtime, storeCreateAgent],
  );

  // ─── Auto-create agent when runtime is ready (connect mode) ───────

  useEffect(() => {
    if (
      !hasSpec &&
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
  }, [hasSpec, autoCreateAgent, runtime, baseStatus, storeCreateAgent]);

  // ─── Auto-create agent when runtime is ready (lifecycle mode) ──────

  useEffect(() => {
    if (
      hasSpec &&
      autoCreateAgent &&
      runtime &&
      (lifecycleStatus === 'ready' || lifecycleStatus === 'resumed') &&
      !runtime.isReady &&
      !hasCreatedAgentRef.current
    ) {
      hasCreatedAgentRef.current = true;
      createAgent(agentConfigRef.current).catch(err => {
        console.error('[useAgents] Failed to auto-create agent:', err);
        const message = err instanceof Error ? err.message : String(err);
        setLifecycleError(message);
        setLifecycleStatus('error');
        hasCreatedAgentRef.current = false;
      });
    }
  }, [hasSpec, autoCreateAgent, runtime, lifecycleStatus, createAgent]);

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

  // ─── Bootstrap: connect to existing runtime on initial load ─────────

  useEffect(() => {
    if (!hasSpec || runtime || autoStart || lifecycleStatus !== 'idle') {
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

        const latestRuntimeRecord = latestRuntime as { status?: unknown };
        const latestRuntimeStatus =
          typeof latestRuntimeRecord.status === 'string'
            ? latestRuntimeRecord.status.toLowerCase()
            : '';
        const normalizedLatestStatus: AgentStatus =
          RUNTIME_STATUS_MAP[latestRuntimeStatus] ?? 'running';
        const resolvedStatus: AgentStatus =
          normalizedLatestStatus === 'paused'
            ? 'paused'
            : normalizedLatestStatus === 'resuming' ||
                normalizedLatestStatus === 'resumed'
              ? 'resumed'
              : 'running';
        if (resolvedStatus === 'paused') {
          setLifecycleStatus('paused');
        } else if (resolvedStatus === 'resumed') {
          setLifecycleStatus('resumed');
        } else {
          setLifecycleStatus('ready');
        }
      } catch (err) {
        console.warn('[useAgents] Failed to find existing runtime:', err);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    hasSpec,
    runtime,
    autoStart,
    lifecycleStatus,
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

  // ─── Auto-start (lifecycle mode) ──────────────────────────────────

  useEffect(() => {
    if (
      hasSpec &&
      autoStart &&
      !hasAutoStarted.current &&
      lifecycleStatus === 'idle'
    ) {
      hasAutoStarted.current = true;
      launchRuntime();
    }
  }, [hasSpec, autoStart, lifecycleStatus, launchRuntime]);

  // ─── Sync store errors ─────────────────────────────────────────────

  useEffect(() => {
    if (storeError && hasSpec && lifecycleStatus !== 'error') {
      setLifecycleError(storeError);
      setLifecycleStatus('error');
    }
  }, [storeError, hasSpec, lifecycleStatus]);

  // ─── Derived state ─────────────────────────────────────────────────

  const status: AgentStatus = hasSpec
    ? lifecycleStatus
    : (baseStatus as AgentStatus);
  const error = hasSpec ? lifecycleError || storeError : storeError;
  const isReady = hasSpec
    ? (lifecycleStatus === 'ready' || lifecycleStatus === 'resumed') &&
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

    // Status
    isReady,
    error,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Runtime Catalog Hooks (React Query)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook to fetch user's agent runtimes (running agent instances).
 *
 * The backend returns active runtimes from the operator **plus** paused
 * runtimes synthesised from Solr checkpoint records (with ``status="paused"``).
 */
export function useAgentRuntimesQuery() {
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
        const agentRuntimes = (resp.runtimes as Record<string, any>[])
          .filter(rt => rt.environment_name === 'ai-agents-env')
          .map(toAgentRuntimeData);
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
        return toAgentRuntimeData(resp.runtime as Record<string, any>);
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
          agent_spec: data.agentSpec || undefined,
        },
      });
    },
    onSuccess: resp => {
      if (resp.success && resp.runtime) {
        const mapped = toAgentRuntimeData(resp.runtime as Record<string, any>);
        queryClient.setQueryData(
          agentQueryKeys.agentRuntimes.detail(mapped.pod_name),
          mapped,
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
 * Hook to refresh agent runtimes list.
 */
export function useRefreshAgentRuntimes() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: agentQueryKeys.agentRuntimes.all(),
    });
  }, [queryClient]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle Store (resume / pause local UI state)
// ═══════════════════════════════════════════════════════════════════════════

export const getAgentLifecycleKey = (runtimeKey: string) =>
  `datalayer:agent-durable:lifecycle:${runtimeKey}`;

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

// ═══════════════════════════════════════════════════════════════════════════
// Consolidated Runtime Composite
// ═══════════════════════════════════════════════════════════════════════════

export interface UseAgentsRuntimesReturn {
  runtimes: AgentRuntimeData[];
  isRuntimesLoading: boolean;
  isRuntimesError: boolean;
  runtimesError: unknown;
  refetchRuntimes: () => Promise<{ data?: AgentRuntimeData[] }>;
  refreshRuntimes: () => void;
  deleteRuntimeByPod: (podName: string) => Promise<unknown>;
  createRuntime: (
    data: CreateAgentRuntimeRequest,
  ) => Promise<CreateRuntimeApiResponse>;
}

/**
 * Consolidated runtime list and mutations.
 */
export function useAgentsRuntimes(): UseAgentsRuntimesReturn {
  const runtimesQuery = useAgentRuntimesQuery();
  const createRuntimeMutation = useCreateAgentRuntime();
  const deleteRuntimeMutation = useDeleteAgentRuntime();
  const refreshRuntimes = useRefreshAgentRuntimes();

  return useMemo(
    () => ({
      runtimes: runtimesQuery.data ?? EMPTY_RUNTIMES,
      isRuntimesLoading: runtimesQuery.isLoading,
      isRuntimesError: runtimesQuery.isError,
      runtimesError: runtimesQuery.error,
      refetchRuntimes: () => runtimesQuery.refetch(),
      refreshRuntimes,
      deleteRuntimeByPod: async (podName: string) =>
        deleteRuntimeMutation.mutateAsync(podName),
      createRuntime: async (data: CreateAgentRuntimeRequest) =>
        createRuntimeMutation.mutateAsync(data),
    }),
    [
      runtimesQuery.data,
      runtimesQuery.isLoading,
      runtimesQuery.isError,
      runtimesQuery.error,
      runtimesQuery.refetch,
      refreshRuntimes,
      createRuntimeMutation,
      deleteRuntimeMutation,
    ],
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent-Runtime WebSocket Hook
// ═══════════════════════════════════════════════════════════════════════════

export interface UseAgentRuntimeWebSocketOptions {
  /** Enable/disable the connection. Defaults to `true`. */
  enabled?: boolean;
  /**
   * Base URL of the agent-runtime server
   * (e.g. `http://localhost:8765`). The WS path is appended automatically.
   */
  baseUrl: string;
  /** Auth token passed as `?token=` query parameter. */
  authToken?: string;
  /** Optional `agent_id` query parameter to scope the stream. */
  agentId?: string;
  /** Auto-reconnect on unexpected disconnects. Defaults to `true`. */
  autoReconnect?: boolean;
  /** Delay between reconnection attempts (ms). Defaults to 3 000. */
  reconnectDelayMs?: number | ((attempt: number) => number);
  /** Maximum reconnect attempts. Unbounded by default. */
  maxReconnectAttempts?: number;
  /** Additional callback fired for every incoming WS message. */
  onMessage?: (msg: { type?: string; payload?: unknown; raw: unknown }) => void;
}

const DEFAULT_WS_PATH = '/api/v1/tool-approvals/ws';
const DEFAULT_RECONNECT_DELAY_MS = 3_000;

/**
 * Connect to the agent-runtime monitoring WebSocket.
 *
 * The hook writes all incoming data into the `useAgentRuntimeStore` Zustand
 * store. Components that need approvals, MCP status, context snapshots, or
 * full-context data simply read from the store.
 *
 * Mount this hook **once** near the top of your component tree (e.g. in
 * the example root or in `ChatBase`). All other components read from the
 * store — no extra WebSocket connections needed.
 */
export function useAgentRuntimeWebSocket(
  options: UseAgentRuntimeWebSocketOptions,
): void {
  const {
    enabled = true,
    baseUrl,
    authToken,
    agentId,
    autoReconnect = true,
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
    maxReconnectAttempts,
  } = options;

  const onMessageRef = useRef(options.onMessage);
  onMessageRef.current = options.onMessage;

  useEffect(() => {
    if (!enabled || !baseUrl) {
      agentRuntimeStore.getState().setWsState('closed');
      return;
    }

    let disposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function buildWsUrl(): string {
      const httpUrl = `${baseUrl}${DEFAULT_WS_PATH}`;
      const url = new URL(httpUrl.replace(/^http/, 'ws'));
      if (authToken) {
        url.searchParams.set('token', authToken);
      }
      if (agentId) {
        url.searchParams.set('agent_id', agentId);
      }
      return url.toString();
    }

    function connect() {
      if (disposed) return;

      const wsUrl = buildWsUrl();
      agentRuntimeStore.getState().setWsState('connecting');

      const ws = new WebSocket(wsUrl);
      agentRuntimeStore.getState().setWs(ws, agentId);

      ws.onopen = () => {
        reconnectAttempts = 0;
        agentRuntimeStore.getState().setWsState('connected');
      };

      ws.onmessage = (ev: MessageEvent) => {
        let raw: unknown;
        try {
          raw = JSON.parse(String(ev.data));
        } catch {
          return;
        }

        const parsed = parseAgentStreamMessage(raw);
        onMessageRef.current?.({
          type: parsed?.type,
          payload: parsed?.payload,
          raw,
        });

        if (!parsed) return;

        const state = agentRuntimeStore.getState();

        if (parsed.type === 'agent.snapshot') {
          state.applySnapshot(
            parsed.payload as unknown as AgentStreamSnapshotPayload,
          );
          return;
        }
      };

      ws.onclose = () => {
        agentRuntimeStore.getState().setWs(null, agentId);
        agentRuntimeStore.getState().setWsState('closed');

        if (disposed || !autoReconnect) return;

        reconnectAttempts += 1;
        if (
          typeof maxReconnectAttempts === 'number' &&
          reconnectAttempts > maxReconnectAttempts
        ) {
          return;
        }

        const delay =
          typeof reconnectDelayMs === 'function'
            ? reconnectDelayMs(reconnectAttempts)
            : reconnectDelayMs;
        reconnectTimer = setTimeout(connect, Math.max(0, delay));
      };

      ws.onerror = () => {
        if (
          ws.readyState === WebSocket.CONNECTING ||
          ws.readyState === WebSocket.OPEN
        ) {
          ws.close();
        }
      };
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      agentRuntimeStore.getState().setWs(null, agentId);
      agentRuntimeStore.getState().resetWs();
    };
  }, [
    enabled,
    baseUrl,
    authToken,
    agentId,
    autoReconnect,
    reconnectDelayMs,
    maxReconnectAttempts,
  ]);
}
