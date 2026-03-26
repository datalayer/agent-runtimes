/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Types for agent lifecycle management — runtime creation/connection,
 * hook options/returns, and the local pause/resume UI state store.
 *
 * @module types/agents-lifecycle
 */

import type { ServiceManager } from '@jupyterlab/services';
import type { IRuntimeOptions } from '@datalayer/core/lib/stateful/runtimes/apis';
import type {
  AgentStatus,
  AgentConnection,
  AgentConfig,
  AgentRuntimeData,
} from './agents';

// ═══════════════════════════════════════════════════════════════════════════
// Runtime API Request / Response
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
// useAgents hook Options / Return
// ═══════════════════════════════════════════════════════════════════════════

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
// Lifecycle Store (local pause/resume UI state)
// ═══════════════════════════════════════════════════════════════════════════

export type AgentLifecycleRecord = {
  resumePending: boolean;
  pauseLockedForResumed: boolean;
};

export type LifecycleRunningAgent = AgentRuntimeData;

export type AgentLifecycleState = {
  byRuntimeKey: Record<string, AgentLifecycleRecord>;
  markResumePending: (runtimeKey: string) => void;
  markResumeFailed: (runtimeKey: string) => void;
  markResumeSettled: (runtimeKey: string) => void;
  clearRuntimeLifecycle: (runtimeKey: string) => void;
};

// ═══════════════════════════════════════════════════════════════════════════
// useAgentsRuntimes composite return
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
