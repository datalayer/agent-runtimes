/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Unified hook for managing agents.
 *
 * Combines agent lifecycle management (ephemeral/durable),
 * runtime catalog (React Query CRUD), lifecycle/catalog stores,
 * and the AI Agents REST API.
 *
 * @module hooks/useAgents
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  useAgentStore,
  useAgentRuntime,
  useAgentStatus,
  useAgentError,
  useIsLaunching,
} from '../state/substates/AgentState';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import type {
  AgentStatus,
  AgentConnection,
  AgentConfig,
  AgentRuntimeData,
} from '../types/agents';
export type { AgentRuntimeData } from '../types/agents';
import { DEFAULT_AGENT_CONFIG } from '../types/agents';

// ═══════════════════════════════════════════════════════════════════════════
// Runtime Types
// ═══════════════════════════════════════════════════════════════════════════

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
  /** Full agent spec payload to propagate to backend services */
  agentSpec?: Record<string, any>;
};

export type CreateRuntimeApiResponse = {
  success?: boolean;
  runtime?: AgentRuntimeData;
};

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

/**
 * Normalize a raw backend status or phase string to a canonical AgentStatus.
 *
 * The backend may send the lifecycle state as either `status` or `phase`
 * (they mean the same thing). Pass both; the explicit `status` wins.
 */
function normalizeStatus(status?: string, phase?: string): AgentStatus {
  const raw = status || phase;
  if (!raw) return 'running';
  switch (raw.toLowerCase()) {
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
    default:
      return 'running';
  }
}

/**
 * Map a raw backend runtime record to AgentRuntimeData.
 */
function toAgentRuntimeData(raw: Record<string, any>): AgentRuntimeData {
  return {
    ...raw,
    status: normalizeStatus(raw.status, raw.phase),
    name: raw.given_name || raw.pod_name,
    id: raw.pod_name,
    url: raw.ingress,
    messageCount: 0,
    agent_spec_id: raw.agent_spec_id || undefined,
  } as AgentRuntimeData;
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

        const resolvedStatus = normalizeStatus(
          (latestRuntime as Record<string, any>).status,
          (latestRuntime as Record<string, any>).phase,
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
 * runtimes synthesised from Solr checkpoint records (with ``phase="Paused"``).
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
  const runtimesQuery = useAgentRuntimes();
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

// Re-export catalog hooks for consumers that import from useAgents
export {
  useAIAgents,
  useNotebookAgents,
  useAgentRegistry,
  type RequestOptions,
  type RoomType,
} from './useAgentsCatalog';
