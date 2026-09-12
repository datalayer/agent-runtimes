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
import { ServerConnection } from '@jupyterlab/services';
import type { IRuntimeOptions } from '../runtimes/apis';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useCoreStore, useDatalayer } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import { runtimesStore } from '../state';
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
  type AgentStreamSubagentPayload,
  type AgentStreamCompactionPayload,
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
import { disposeSandboxServiceManagers } from '../services/sandboxServiceManagers';
import { runtimeUrl, runtimesUrl } from '../runtimes/lifecycle';

import {
  legacyTargetOf,
  locationOf,
  runsInBrowser,
  toAgentRuntimeVariant,
  type AgentRuntimeVariant,
  type RuntimeCreationTarget,
} from '../runtimes/variants';

export type { AgentRuntimeVariant, RuntimeCreationTarget };

/** Existing runtime connection used by connect-mode consumers. */
export interface AgentRuntimeConnectionOptions {
  runtimeName: string;
  environmentName: string;
  serviceManager?: ServiceManager.IManager;
  jupyterBaseUrl?: string;
  kernelId?: string;
}

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
  /**
   * Where the agent's loop runs, and what runs it.
   *
   * - `cloud-pydanticai`: a runtime in the backend runtimes service
   * - `local-pydanticai`: a local agent-runtimes server
   * - `browser-vercelai`: the page itself — no runtime is created at all
   */
  variant?: AgentRuntimeVariant;
  /**
   * @deprecated Pass {@link UseAgentOptions.variant} instead.
   * `backend-services` is `cloud-pydanticai`, `local-agent-runtimes` is
   * `local-pydanticai`.
   */
  runtimeCreationTarget?: RuntimeCreationTarget;
  /** Explicit base URL for runtime create/list operations. */
  runtimeCreationBaseUrl?: string;
  /**
   * Existing runtime to connect to. When supplied, the hook owns the
   * connection bootstrap as well as agent creation.
   */
  runtimeConnection?: AgentRuntimeConnectionOptions;
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
  connectToRuntime: (options: AgentRuntimeConnectionOptions) => void;
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
  /**
   * Delete the current agent on the server and reset in-process runtime state
   * so a fresh runtime/agent can be launched.
   */
  teardown: () => Promise<void>;
  /** Whether agent creation is currently in progress */
  isCreating: boolean;

  // Status
  /** Whether everything is ready (runtime + agent) */
  isReady: boolean;
  /** Error if any */
  error: string | null;
  /** Effective variant: where the loop runs, and what runs it. */
  variant: AgentRuntimeVariant;
  /** @deprecated Read {@link UseAgentReturn.variant}. */
  runtimeCreationTarget: RuntimeCreationTarget;
  /** Effective base URL used for runtime create/list operations. */
  runtimeCreationBaseUrl: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Stable fallback to avoid new-reference on every render. */
const EMPTY_RUNTIMES: AgentRuntimeData[] = [];

/**
 * What a browser agent has instead of a runtime.
 *
 * Every field that names a host is empty because there is no host: the loop
 * runs in this page, so there is no pod, no Jupyter server and no agent
 * service to address. It is ready because nothing has to happen first.
 *
 * Frozen and shared rather than built per call, so a host comparing the value
 * it got back sees the same object each time.
 */
const BROWSER_AGENT_CONNECTION: AgentConnection = Object.freeze({
  runtimeName: '',
  environmentName: '',
  jupyterBaseUrl: '',
  agentBaseUrl: '',
  status: 'ready' as AgentStatus,
  isReady: true,
});

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
    detail: (runtimeName: string) =>
      [...agentQueryKeys.agentRuntimes.details(), runtimeName] as const,
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
 * Session tombstones for runtime pods deleted from this client.
 *
 * After a DELETE succeeds, the control plane can keep returning the pod
 * (status \"running\") for a few seconds. Without a tombstone, the immediate
 * list refetch re-adds the dead pod to the query cache (and re-seeds the
 * per-pod detail cache), so consumers rebuild Jupyter `ServiceManager`s
 * against the dead ingress — producing endless CORS `/api/kernels` errors.
 *
 * Entries expire after a TTL so a pod that legitimately reappears later
 * (e.g. resumed from a checkpoint under the same pod name) is not hidden
 * forever; resume/create mutations also clear the tombstone eagerly.
 */
const DELETED_POD_TOMBSTONE_TTL_MS = 5 * 60 * 1000;
const deletedRuntimeTombstones = new Map<string, number>();

/** Mark a runtime pod as deleted by this client (tombstone). */
export function markRuntimeDeleted(runtimeName: string): void {
  const normalized = String(runtimeName || '').trim();
  if (normalized) {
    deletedRuntimeTombstones.set(normalized, Date.now());
    // Centralized teardown: dispose every ServiceManager any surface opened
    // against this pod's sandbox so their kernelspecs/sessions/users pollers
    // stop immediately instead of waiting for query-cache propagation.
    disposeSandboxServiceManagers(normalized);
  }
}

/** Clear a deleted-pod tombstone (pod legitimately exists again). */
export function clearRuntimeDeleted(runtimeName: string): void {
  deletedRuntimeTombstones.delete(String(runtimeName || '').trim());
}

/** Statuses that imply a live pod the client would connect to. */
const LIVE_RUNTIME_STATUSES = new Set<AgentStatus>([
  'running',
  'resumed',
  'starting',
  'resuming',
]);

/**
 * True when a runtime record is a stale control-plane echo of a pod this
 * client already deleted: tombstoned, within TTL, and claiming a live status.
 * Checkpoint-synthesised `paused` records pass through (no live pod to poll).
 */
function isStaleDeletedRuntime(runtime: AgentRuntimeData): boolean {
  const runtimeName = String((runtime as any)?.runtime_name || '').trim();
  const deletedAt = deletedRuntimeTombstones.get(runtimeName);
  if (deletedAt === undefined) {
    return false;
  }
  if (Date.now() - deletedAt > DELETED_POD_TOMBSTONE_TTL_MS) {
    deletedRuntimeTombstones.delete(runtimeName);
    return false;
  }
  return LIVE_RUNTIME_STATUSES.has(runtime.status as AgentStatus);
}

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

export interface AgentSandboxConnectionInfo {
  baseUrl: string;
  agentId?: string;
  agentBaseUrl?: string;
  runtimeEnvironment?: RuntimeEnvironmentDetails;
}

export interface RuntimeEnvironmentDetails {
  environmentName?: string;
  environmentTitle?: string;
  cpu?: string;
  memory?: string;
  gpu?: string;
}

const RUNTIME_ENVIRONMENT_META_KEY = '__datalayerRuntimeEnvironmentDetails';

type RuntimeEnvironmentCarrier = {
  [RUNTIME_ENVIRONMENT_META_KEY]?: RuntimeEnvironmentDetails;
};

type SandboxStatusResponse = {
  variant?: string;
  sandbox_running?: boolean;
  jupyter_url?: string | null;
  jupyter_token?: string | null;
  token?: string | null;
  environment?: {
    name?: string | null;
    title?: string | null;
    cpu?: string | number | null;
    memory?: string | number | null;
    gpu?: string | number | null;
    resources?: {
      cpu?: string | number | null;
      memory?: string | number | null;
      gpu?: string | number | null;
      gpu_count?: string | number | null;
      gpu_type?: string | null;
      gpu_memory?: string | null;
      'nvidia.com/gpu'?: string | number | null;
    } | null;
  } | null;
  sandbox?: {
    jupyter_url?: string | null;
    jupyter_token?: string | null;
    token?: string | null;
  } | null;
};

type SandboxEnvironmentResources = NonNullable<
  NonNullable<SandboxStatusResponse['environment']>['resources']
>;

function resolveSandboxIngress(payload: SandboxStatusResponse): string {
  const direct = String(payload.jupyter_url || '').trim();
  if (direct) {
    return direct;
  }
  const nested = String(payload.sandbox?.jupyter_url || '').trim();
  if (nested) {
    return nested;
  }
  return '';
}

function resolveSandboxToken(payload: SandboxStatusResponse): string {
  const direct = String(payload.jupyter_token || payload.token || '').trim();
  if (direct) {
    return direct;
  }
  return String(
    payload.sandbox?.jupyter_token || payload.sandbox?.token || '',
  ).trim();
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function resolveGpuLabel(
  resources: SandboxEnvironmentResources | null | undefined,
): string | undefined {
  if (!resources) {
    return undefined;
  }
  const gpuCount =
    toOptionalString(resources.gpu) ||
    toOptionalString(resources.gpu_count) ||
    toOptionalString(resources['nvidia.com/gpu']);
  const gpuType = toOptionalString(resources.gpu_type);
  const gpuMemory = toOptionalString(resources.gpu_memory);
  const parts = [gpuCount, gpuType, gpuMemory].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function resolveRuntimeEnvironmentDetails(
  payload: SandboxStatusResponse | null,
  seed?: RuntimeEnvironmentDetails,
): RuntimeEnvironmentDetails | undefined {
  const environment = payload?.environment;
  const resources = environment?.resources;
  const environmentName =
    toOptionalString(seed?.environmentName) ||
    toOptionalString(environment?.name);
  const environmentTitle =
    toOptionalString(seed?.environmentTitle) ||
    toOptionalString(environment?.title);
  const cpu =
    toOptionalString(seed?.cpu) ||
    toOptionalString(environment?.cpu) ||
    toOptionalString(resources?.cpu);
  const memory =
    toOptionalString(seed?.memory) ||
    toOptionalString(environment?.memory) ||
    toOptionalString(resources?.memory);
  const gpu =
    toOptionalString(seed?.gpu) ||
    toOptionalString(environment?.gpu) ||
    resolveGpuLabel(resources);

  if (!environmentName && !environmentTitle && !cpu && !memory && !gpu) {
    return undefined;
  }

  return {
    environmentName,
    environmentTitle,
    cpu,
    memory,
    gpu,
  };
}

export function getServiceManagerRuntimeEnvironmentDetails(
  manager: ServiceManager.IManager | null | undefined,
): RuntimeEnvironmentDetails | undefined {
  if (!manager) {
    return undefined;
  }
  const carrier = manager as ServiceManager.IManager &
    RuntimeEnvironmentCarrier;
  return carrier[RUNTIME_ENVIRONMENT_META_KEY];
}

function isInternalHost(value: string): boolean {
  const host = String(value || '')
    .trim()
    .toLowerCase();
  return host === '127.0.0.1' || host === '0.0.0.0' || host === 'localhost';
}

/**
 * Connect a Jupyter ServiceManager to an already-running agent sandbox.
 *
 * This is the preferred cloud path when an agent runtime already exists:
 * resolve sandbox status from the agent API, then bind directly to the
 * returned Jupyter ingress URL/token instead of creating a new runtime.
 */
export async function createServiceManagerFromAgentSandbox(
  info: AgentSandboxConnectionInfo,
  authToken?: string,
): Promise<ServiceManager.IManager> {
  const fallbackIngress = String(info.baseUrl || '').trim();
  if (!fallbackIngress) {
    throw new Error('Cloud agent sandbox base URL is missing.');
  }

  let resolvedIngress = fallbackIngress;
  let tokenFromStatus = '';
  let payloadFromStatus: SandboxStatusResponse | null = null;

  const agentBaseUrl = String(info.agentBaseUrl || '')
    .trim()
    .replace(/\/$/, '');
  const agentId = String(info.agentId || '').trim();
  const bearer = String(authToken || '').trim();
  if (agentBaseUrl && agentId && bearer) {
    const statusCandidates = [
      `${agentBaseUrl}/api/v1/runtime/status?agent_id=${encodeURIComponent(agentId)}`,
    ];
    for (const statusUrl of statusCandidates) {
      try {
        const response = await fetch(statusUrl, {
          headers: {
            Authorization: `Bearer ${bearer}`,
          },
        });
        if (!response.ok) {
          continue;
        }
        const payload = (await response
          .json()
          .catch(() => null)) as SandboxStatusResponse | null;
        if (!payload) {
          continue;
        }
        payloadFromStatus = payload;
        const ingressFromStatus = resolveSandboxIngress(payload);
        if (ingressFromStatus) {
          try {
            const parsed = new URL(ingressFromStatus);
            // Cloud sandboxes can report an internal localhost URL in runtime
            // status; do not override the known cloud ingress with that host.
            if (!isInternalHost(parsed.hostname)) {
              resolvedIngress = ingressFromStatus;
            }
          } catch {
            resolvedIngress = ingressFromStatus;
          }
        }
        tokenFromStatus = resolveSandboxToken(payload);
        break;
      } catch {
        // Keep fallback ingress/token when status endpoint is unavailable.
      }
    }
  }

  let ingress = resolvedIngress.replace(/\/$/, '');
  let tokenFromIngress = '';
  try {
    const parsed = new URL(resolvedIngress);
    tokenFromIngress = String(
      parsed.searchParams.get('token') ||
        parsed.searchParams.get('jupyter_token') ||
        '',
    ).trim();
    parsed.searchParams.delete('token');
    parsed.searchParams.delete('jupyter_token');
    ingress = parsed.toString().replace(/\/$/, '');
  } catch {
    // Keep raw ingress when URL parsing fails.
  }

  const serverSettings = ServerConnection.makeSettings({
    baseUrl: ingress,
    wsUrl: ingress.replace(/^http/, 'ws'),
    token: tokenFromIngress || tokenFromStatus || authToken || '',
    appendToken: true,
  });
  const manager = new ServiceManager({ serverSettings });
  await manager.ready;
  const runtimeEnvironment = resolveRuntimeEnvironmentDetails(
    payloadFromStatus,
    info.runtimeEnvironment,
  );
  if (runtimeEnvironment) {
    const carrier = manager as ServiceManager.IManager &
      RuntimeEnvironmentCarrier;
    carrier[RUNTIME_ENVIRONMENT_META_KEY] = runtimeEnvironment;
  }
  return manager;
}

/**
 * Map a raw backend runtime record to AgentRuntimeData.
 */
function toAgentRuntimeData(raw: Record<string, any>): AgentRuntimeData {
  const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
  const normalizedStatus: AgentStatus = RUNTIME_STATUS_MAP[status] ?? 'running';
  const environment = raw.environment as
    | {
        name?: string;
        title?: string;
        cpu?: string;
        memory?: string;
        gpu?: string;
        resources?: Record<string, string>;
      }
    | undefined;
  return {
    ...raw,
    environment: {
      name: String(environment?.name || '').trim(),
      title: String(environment?.title || '').trim() || undefined,
      cpu: String(environment?.cpu || '').trim() || undefined,
      memory: String(environment?.memory || '').trim() || undefined,
      gpu: String(environment?.gpu || '').trim() || undefined,
      resources: environment?.resources,
    },
    status: normalizedStatus,
    name: raw.given_name || raw.runtime_name,
    id: raw.runtime_name,
    url: raw.ingress,
    messageCount: 0,
    agent_spec_id: raw.agent_spec_id || undefined,
    content_attachments: Array.isArray(raw.content_attachments)
      ? raw.content_attachments
      : [],
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
 *   agentConfig: { model: 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0' },
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
    variant: variantOption,
    runtimeCreationTarget,
    runtimeCreationBaseUrl,
    runtimeConnection,
  } = options;

  // Both vocabularies funnel into one value here, so no branch below has to
  // remember that the old names exist.
  const variant = toAgentRuntimeVariant(variantOption ?? runtimeCreationTarget);

  const { configuration } = useCoreStore();

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
  /*
   * Whether the "is one already running?" question has been answered.
   *
   * State rather than a ref: the auto-start effect has to re-run when it
   * flips, and a ref changing does not re-run anything.
   */
  const [lookedForExisting, setLookedForExisting] = useState(false);
  const hasCreatedAgentRef = useRef(false);
  const lastRuntimeRef = useRef<string | null>(null);
  const creatingRef = useRef(false);
  const agentConfigRef = useRef(agentConfig);
  agentConfigRef.current = agentConfig;

  // Specs use the backend lifecycle only when this hook owns a cloud runtime.
  // A local agent-runtimes server is already running, so it remains connect
  // mode even when agent creation references a spec — and a browser agent has
  // no runtime to own at all.
  const hasSpec = !!agentSpecId && locationOf(variant) === 'cloud';

  const runtimeConnectionKey = runtimeConnection
    ? [
        runtimeConnection.runtimeName,
        runtimeConnection.environmentName,
        runtimeConnection.jupyterBaseUrl ||
          runtimeConnection.serviceManager?.serverSettings.baseUrl ||
          '',
        runtimeConnection.kernelId || '',
      ].join(':')
    : null;

  const resolvedRuntimeCreationBaseUrl = useMemo(() => {
    if (runtimeCreationBaseUrl) {
      return runtimeCreationBaseUrl;
    }
    // A browser agent reaches no runtime service; the empty string keeps the
    // return shape without naming a host nothing will call.
    if (runsInBrowser(variant)) {
      return '';
    }
    if (locationOf(variant) === 'local') {
      return (
        import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL ||
        'http://localhost:8765'
      );
    }
    return (
      configuration?.runtimesUrl ||
      import.meta.env.VITE_DATALAYER_AGENT_RUNTIMES_URL ||
      'https://r1.datalayer.run'
    );
  }, [configuration?.runtimesUrl, runtimeCreationBaseUrl, variant]);

  // ─── Auth helpers ─────────────────────────────────────────────────

  const getAuthHeaders = useCallback(async () => {
    try {
      const { iamStore, coreStore } = await import('@datalayer/core/lib/state');
      const token = iamStore.getState().token || '';
      const config = coreStore.getState().configuration;
      const aiAgentsUrl = config?.aiAgentsUrl || '';
      const runtimesUrl = resolvedRuntimeCreationBaseUrl;
      return { token, aiAgentsUrl, runtimesUrl };
    } catch {
      return { token: '', aiAgentsUrl: '', runtimesUrl: '' };
    }
  }, [resolvedRuntimeCreationBaseUrl]);

  // ─── Connect to a supplied runtime ─────────────────────────────────

  useEffect(() => {
    if (!runtimeConnection || !runtimeConnectionKey) {
      return;
    }

    const currentConnectionKey = runtime
      ? [
          runtime.runtimeName,
          runtime.environmentName,
          runtime.jupyterBaseUrl || '',
          runtime.kernelId || '',
        ].join(':')
      : null;
    if (currentConnectionKey === runtimeConnectionKey) {
      return;
    }

    hasCreatedAgentRef.current = false;
    storeConnectAgent(runtimeConnection);
  }, [runtimeConnection, runtimeConnectionKey, runtime, storeConnectAgent]);

  // ─── Launch Runtime ─────────────────────────────────────────────────

  const launchRuntime = useCallback(
    async (runtimeOptions?: IRuntimeOptions) => {
      if (runsInBrowser(variant)) {
        // Nothing to launch: the loop runs in this page. Resolving rather than
        // throwing keeps one launch button correct for every variant — a host
        // that calls this because a person pressed the button gets a runtime
        // that is already, truthfully, ready.
        return BROWSER_AGENT_CONNECTION;
      }
      if (hasSpec) {
        setLifecycleStatus('launching');
        setLifecycleError(null);
        try {
          const preferredRuntimeName =
            (typeof agentConfig?.name === 'string' && agentConfig.name) ||
            (typeof agentSpec?.name === 'string' && agentSpec.name) ||
            `${agentSpecId}`;

          const safeName = preferredRuntimeName
            .replace(/\//g, '-')
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 63);

          const conn = await storeLaunchAgent(
            runtimeOptions
              ? {
                  ...runtimeOptions,
                  runtimesUrl: resolvedRuntimeCreationBaseUrl,
                }
              : {
                  environmentName: 'ai-agents-env',
                  creditsLimit: 10,
                  givenName: safeName,
                  runtimesUrl: resolvedRuntimeCreationBaseUrl,
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
        return storeLaunchAgent({
          ...runtimeOptions,
          runtimesUrl: resolvedRuntimeCreationBaseUrl,
        });
      }
    },
    [
      agentConfig?.name,
      agentSpec?.name,
      agentSpecId,
      hasSpec,
      resolvedRuntimeCreationBaseUrl,
      storeLaunchAgent,
      variant,
    ],
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
            (hasSpec && agentSpecId ? agentSpecId : runtime?.runtimeName),
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

  // ─── Teardown ───────────────────────────────────────────────────────

  const teardown = useCallback(async () => {
    const agentId = runtime?.agentId;
    const agentBaseUrl = runtime?.agentBaseUrl;
    if (agentId && agentBaseUrl) {
      try {
        const { token } = await getAuthHeaders();
        await fetch(
          `${agentBaseUrl}/api/v1/agents/${encodeURIComponent(agentId)}`,
          {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
      } catch {
        // Best-effort teardown: ignore network / 404 errors.
      }
    }
    // Reset in-process runtime state so a fresh agent can be launched.
    hasCreatedAgentRef.current = false;
    hasAutoStarted.current = false;
    setLifecycleStatus('idle');
    setLifecycleError(null);
    agentRuntimeStore.getState().reset();
  }, [runtime?.agentId, runtime?.agentBaseUrl, getAuthHeaders]);

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
    const currentRuntime = runtime?.runtimeName || null;
    if (!currentRuntime) {
      lastRuntimeRef.current = null;
      return;
    }
    if (lastRuntimeRef.current && lastRuntimeRef.current !== currentRuntime) {
      hasCreatedAgentRef.current = false;
    }
    lastRuntimeRef.current = currentRuntime;
  }, [runtime?.runtimeName]);

  // ─── Bootstrap: connect to existing runtime on initial load ─────────

  useEffect(() => {
    /*
     * Runs whether or not this host asked for an auto-start.
     *
     * `autoStart` used to short-circuit it, which made looking and launching
     * mutually exclusive when they are meant to be sequential: a host that
     * wanted a runtime always got a *new* one, and an agent for the same spec
     * already running in the cloud was ignored and paid for twice. Switching
     * examples showed it as an error — the launch had not landed yet, and
     * nothing had thought to reuse the runtime that was right there.
     *
     * The auto-start below waits for this to finish, so the order is: look,
     * then launch if there was nothing to find.
     */
    if (!hasSpec || runtime || lifecycleStatus !== 'idle') {
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        const { token, runtimesUrl } = await getAuthHeaders();
        if (!token) {
          return;
        }
        const { listRuntimes } = await import('../api/runtimes/runtimes');
        const runtimesResponse = await listRuntimes(token, runtimesUrl);
        const runtimes = runtimesResponse.runtimes || [];
        const aiAgentRuntimes = runtimes.filter(rt => {
          if (rt.environment?.name !== 'ai-agents-env') {
            return false;
          }
          if (!agentSpecId) {
            return true;
          }
          const runtimeAgentspecId = (rt as { agent_spec_id?: string })
            .agent_spec_id;
          return runtimeAgentspecId === agentSpecId;
        });

        const latestRuntime = aiAgentRuntimes.slice().sort((a, b) => {
          const aTs = Number(a.started_at || 0);
          const bTs = Number(b.started_at || 0);
          return bTs - aTs;
        })[0];

        if (
          cancelled ||
          !latestRuntime?.runtime_name ||
          !latestRuntime?.ingress
        ) {
          return;
        }

        storeConnectAgent({
          runtimeName: latestRuntime.runtime_name,
          environmentName: latestRuntime.environment.name,
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
      } finally {
        // Either way. A lookup that failed must not hold the launch back for
        // ever — the point of looking is to avoid a second runtime, not to
        // make the first one conditional on the listing endpoint.
        if (!cancelled) {
          setLookedForExisting(true);
        }
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
      // Only once the lookup above has reported. Launching in parallel would
      // race it: two runtimes for one spec, and whichever answered last wins.
      lookedForExisting &&
      !runtime &&
      !hasAutoStarted.current &&
      lifecycleStatus === 'idle'
    ) {
      hasAutoStarted.current = true;
      launchRuntime();
    }
  }, [
    hasSpec,
    autoStart,
    lookedForExisting,
    runtime,
    lifecycleStatus,
    launchRuntime,
  ]);

  // ─── Sync store errors ─────────────────────────────────────────────

  useEffect(() => {
    if (storeError && hasSpec && lifecycleStatus !== 'error') {
      setLifecycleError(storeError);
      setLifecycleStatus('error');
    }
  }, [storeError, hasSpec, lifecycleStatus]);

  // ─── Derived state ─────────────────────────────────────────────────

  // A browser agent is ready the moment the page is: there is no runtime to
  // start, so a host that waits on `isReady` before showing its chat would
  // otherwise wait forever for something that is never going to happen.
  const inBrowser = runsInBrowser(variant);

  const status: AgentStatus = inBrowser
    ? 'ready'
    : hasSpec
      ? lifecycleStatus
      : (baseStatus as AgentStatus);
  const error = inBrowser
    ? null
    : hasSpec
      ? lifecycleError || storeError
      : storeError;
  const isReady = inBrowser
    ? true
    : hasSpec
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
    teardown,
    isCreating,

    // Status
    isReady,
    error,
    variant,
    // Derived rather than passed through: a caller that gave neither option
    // still gets a truthful legacy value, and one that gave a variant gets its
    // nearest old name instead of `undefined`.
    runtimeCreationTarget: legacyTargetOf(variant),
    runtimeCreationBaseUrl: resolvedRuntimeCreationBaseUrl,
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
export function useAgentRuntimesQuery(
  scope?: {
    selectedUserUid?: string;
    selectedOrganizationUid?: string;
    selectedTeamUid?: string;
    selectedAgentUid?: string;
  },
  queryOptions?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
) {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const { user } = useIAMStore();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: [
      ...agentQueryKeys.agentRuntimes.lists(),
      scope?.selectedUserUid || '',
      scope?.selectedOrganizationUid || '',
      scope?.selectedTeamUid || '',
      scope?.selectedAgentUid || '',
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (scope?.selectedUserUid) {
        params.set('selected_user_uid', scope.selectedUserUid);
      }
      if (scope?.selectedOrganizationUid) {
        params.set('selected_organization_uid', scope.selectedOrganizationUid);
      }
      if (scope?.selectedTeamUid) {
        params.set('selected_team_uid', scope.selectedTeamUid);
      }
      if (scope?.selectedAgentUid) {
        params.set('selected_agent_uid', scope.selectedAgentUid);
      }
      const query = params.toString();
      const resp = await requestDatalayer({
        url: `${runtimesUrl(configuration.runtimesUrl)}${query ? `?${query}` : ''}`,
        method: 'GET',
      });
      if (resp.success && resp.runtimes) {
        const agentRuntimes = (resp.runtimes as Record<string, any>[])
          .filter(rt => rt.environment?.name === 'ai-agents-env')
          .map(toAgentRuntimeData)
          // Drop stale echoes of pods deleted from this client so consumers
          // never reconnect a ServiceManager to a dead ingress (CORS spam).
          .filter(runtime => !isStaleDeletedRuntime(runtime));
        agentRuntimes.forEach((runtime: AgentRuntimeData) => {
          queryClient.setQueryData(
            agentQueryKeys.agentRuntimes.detail(runtime.runtime_name),
            runtime,
          );
        });
        return agentRuntimes;
      }
      return [];
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: queryOptions?.refetchInterval ?? 10000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: (queryOptions?.enabled ?? true) && !!user,
  });
}

/**
 * Hook to fetch a single agent runtime by name.
 */
export function useAgentRuntimeByName(runtimeName: string | undefined) {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  // The query is disabled without a name, but the URL is built before the
  // guard runs, so it needs one either way.
  const name = runtimeName ?? '';

  return useQuery({
    queryKey: agentQueryKeys.agentRuntimes.detail(name),
    queryFn: async () => {
      const resp = await requestDatalayer({
        url: runtimeUrl(configuration.runtimesUrl, name),
        method: 'GET',
      });
      if (resp.runtime) {
        const runtime = toAgentRuntimeData(resp.runtime as Record<string, any>);
        if (isStaleDeletedRuntime(runtime)) {
          // Stale echo of a pod deleted from this client — surface as an
          // error so the poll stops and consumers tear the connection down.
          throw new Error('Agent runtime deleted');
        }
        return runtime;
      }
      throw new Error('Failed to fetch agent runtime');
    },
    ...AGENT_QUERY_OPTIONS,
    refetchInterval: query => {
      if (query.state.error) return false;
      return 5000;
    },
    retry: false,
    enabled: !!runtimeName,
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
      const contentAttachmentUids = (data.contentAttachmentUids ?? [])
        .map(uid => String(uid || '').trim())
        .filter(Boolean);
      return requestDatalayer({
        url: runtimesUrl(configuration.runtimesUrl),
        method: 'POST',
        body: {
          environment: {
            name: data.environmentName || 'ai-agents-env',
          },
          given_name: data.givenName || 'Agent',
          credits_limit: data.creditsLimit || 10,
          type: data.type || 'notebook',
          editor_variant: data.editorVariant || 'none',
          enable_codemode: data.enableCodemode ?? false,
          agent_spec_id: data.agentSpecId || undefined,
          agent_spec: data.agentSpec || undefined,
          user_account_handle: data.userAccountHandle || undefined,
          billing_entity_uid: data.billingEntityUid || undefined,
          billing_entity_type: data.billingEntityType || undefined,
          billing_entity_handle: data.billingEntityHandle || undefined,
          billing_source_organization_uid:
            data.billingSourceOrganizationUid || undefined,
          billing_source_organization_handle:
            data.billingSourceOrganizationHandle || undefined,
          runtime_name: data.runtimeName || undefined,
          content_attachment_uids: contentAttachmentUids.length
            ? contentAttachmentUids
            : undefined,
        },
      });
    },
    onSuccess: resp => {
      if (resp.success && resp.runtime) {
        const mapped = toAgentRuntimeData(resp.runtime as Record<string, any>);
        // A fresh runtime legitimately exists — drop any stale tombstone.
        clearRuntimeDeleted(mapped.runtime_name);
        queryClient.setQueryData(
          agentQueryKeys.agentRuntimes.detail(mapped.runtime_name),
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
 * Hook to stop an agent runtime — running or paused.
 *
 * One hook, because there is one endpoint: `DELETE /runtimes/{runtimeName}` reaps
 * the pod when there is one and the checkpoint records when there is not, so a
 * caller that wants the runtime gone does not have to know which it is.
 */
export function useDeleteAgentRuntime() {
  const { configuration } = useCoreStore();
  const { requestDatalayer } = useDatalayer({ notifyOnError: false });
  const queryClient = useQueryClient();

  const getErrorStatus = (error: unknown): number | undefined => {
    if (!error || typeof error !== 'object') {
      return undefined;
    }
    const response = (error as { response?: { status?: number } }).response;
    return typeof response?.status === 'number' ? response.status : undefined;
  };

  const getErrorText = (error: unknown): string => {
    if (!error || typeof error !== 'object') {
      return '';
    }
    const responseData = (
      error as {
        response?: { data?: { detail?: string; message?: string } };
        message?: string;
      }
    ).response?.data;
    return String(
      responseData?.detail ||
        responseData?.message ||
        (error as { message?: string }).message ||
        '',
    ).toLowerCase();
  };

  return useMutation({
    mutationFn: async (runtimeName: string) => {
      try {
        return await requestDatalayer({
          url: runtimeUrl(configuration.runtimesUrl, runtimeName),
          method: 'DELETE',
        });
      } catch (error) {
        const status = getErrorStatus(error);
        const message = getErrorText(error);
        const maybeAlreadyDeleted =
          status === 404 ||
          message.includes('no reservation') ||
          message.includes('unknown reservation') ||
          message.includes('not found');

        if (!maybeAlreadyDeleted) {
          throw error;
        }

        // The backend can return an IAM reservation error even after the pod
        // has already been deleted successfully. Confirm state by checking if
        // the runtime detail endpoint still exists.
        try {
          await requestDatalayer({
            url: runtimeUrl(configuration.runtimesUrl, runtimeName),
            method: 'GET',
          });
          // Runtime still exists: propagate original DELETE failure.
          throw error;
        } catch (checkError) {
          const checkStatus = getErrorStatus(checkError);
          if (checkStatus === 404) {
            return { success: true, recovered: true } as const;
          }
          throw error;
        }
      }
    },
    onSuccess: (_data, runtimeName) => {
      // Tombstone the pod so refetches that still echo it from the control
      // plane (deletion lag) do not re-add it to the caches below.
      markRuntimeDeleted(runtimeName);
      // Prune the pod from the runtimes store immediately so the remote service
      // managers dispose right away and stop polling the now-dead pod ingress
      // (otherwise `/api/kernels` requests keep firing until the next
      // `refreshRuntimes()` poll tick, producing CORS errors).
      runtimesStore.getState().removeRuntime(runtimeName);
      queryClient.setQueriesData(
        { queryKey: agentQueryKeys.agentRuntimes.lists() },
        (current: AgentRuntimeData[] | undefined) => {
          if (!Array.isArray(current)) {
            return current;
          }
          return current.filter(
            runtime => runtime.runtime_name !== runtimeName,
          );
        },
      );
      queryClient.cancelQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(runtimeName),
      });
      queryClient.removeQueries({
        queryKey: agentQueryKeys.agentRuntimes.detail(runtimeName),
      });
      queryClient.invalidateQueries({
        queryKey: agentQueryKeys.agentRuntimes.lists(),
      });
      queryClient.refetchQueries({
        queryKey: agentQueryKeys.agentRuntimes.lists(),
        type: 'active',
      });
      // Stopping also removes any checkpoint records, so a paused agent does
      // not linger in the checkpoint views after it is gone.
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
  /**
   * Stop a runtime, running or paused.
   *
   * `beforeStop` runs first, for callers that must tear a connection down
   * before the pod goes away.
   */
  stopRuntimeByName: (
    runtimeName: string,
    options?: { beforeStop?: () => void | Promise<void> },
  ) => Promise<unknown>;
  createRuntime: (
    data: CreateAgentRuntimeRequest,
  ) => Promise<CreateRuntimeApiResponse>;
}

/**
 * Consolidated runtime list and mutations.
 */
export function useAgentsRuntimes(
  scope?: {
    selectedUserUid?: string;
    selectedOrganizationUid?: string;
    selectedTeamUid?: string;
    selectedAgentUid?: string;
  },
  queryOptions?: {
    enabled?: boolean;
    refetchInterval?: number | false;
  },
): UseAgentsRuntimesReturn {
  const runtimesQuery = useAgentRuntimesQuery(scope, queryOptions);
  const createRuntimeMutation = useCreateAgentRuntime();
  const deleteRuntimeMutation = useDeleteAgentRuntime();
  const refreshRuntimes = useRefreshAgentRuntimes();

  const stopRuntimeByName = useCallback(
    async (
      runtimeName: string,
      options?: { beforeStop?: () => void | Promise<void> },
    ) => {
      const normalizedRuntimeName = String(runtimeName || '').trim();
      if (!normalizedRuntimeName) {
        return;
      }
      if (options?.beforeStop) {
        await options.beforeStop();
      }
      return deleteRuntimeMutation.mutateAsync(normalizedRuntimeName);
    },
    [deleteRuntimeMutation],
  );

  return useMemo(
    () => ({
      runtimes: runtimesQuery.data ?? EMPTY_RUNTIMES,
      isRuntimesLoading: runtimesQuery.isLoading,
      isRuntimesError: runtimesQuery.isError,
      runtimesError: runtimesQuery.error,
      refetchRuntimes: () => runtimesQuery.refetch(),
      refreshRuntimes,
      stopRuntimeByName,
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
      stopRuntimeByName,
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

        if (parsed.type === 'agent.subagent') {
          state.appendSubagentEvent(
            parsed.payload as unknown as AgentStreamSubagentPayload,
          );
          return;
        }

        if (parsed.type === 'agent.compaction') {
          state.setCompaction(
            parsed.payload as unknown as AgentStreamCompactionPayload,
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
