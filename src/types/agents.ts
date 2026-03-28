/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AI Agent model
 */
import type { AgentSpec } from './agentspecs';
import type { AgentConnection } from './connection';

export type AgentLibrary = 'pydantic-ai' | 'langchain' | 'google-adk';

/**
 * Unified agent status covering runtime lifecycle and UI lifecycle.
 */
export type AgentStatus =
  | 'idle'
  | 'initializing'
  | 'launching'
  | 'connecting'
  | 'starting'
  | 'ready'
  | 'running'
  | 'paused'
  | 'pausing'
  | 'resumed'
  | 'resuming'
  | 'terminated'
  | 'archived'
  | 'error'
  | 'disconnected';

/** Shared Primer Label variants for agent statuses. */
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
    starting: 'attention',
    ready: 'success',
    running: 'success',
    pausing: 'attention',
    paused: 'severe',
    resumed: 'accent',
    resuming: 'accent',
    terminated: 'danger',
    archived: 'secondary',
    error: 'danger',
    disconnected: 'secondary',
  };

/**
 * Complete state for an agent runtime in the Zustand store.
 */
export interface AgentRuntimeState {
  /** Runtime connection including agent info (null if not connected). */
  runtime: AgentConnection | null;
  /** Current status. */
  status: AgentStatus;
  /** Error message if any. */
  error: string | null;
  /** Whether the runtime is launching. */
  isLaunching: boolean;
  /** Whether the agent is ready. */
  isReady: boolean;
}

/**
 * Agent Runtime data type (mapped from runtimes service).
 *
 * Backend RuntimePod fields: pod_name, environment_name, environment_title, uid,
 * type, given_name, token, ingress, reservation_id, started_at, expired_at, burning_rate.
 *
 * We map `ingress` to `url` for consistency with the UI.
 */
export type AgentRuntimeData = {
  pod_name: string;
  id: string;
  name: string;
  environment_name: string;
  environment_title?: string;
  given_name: string;
  type: string;
  started_at?: string;
  expired_at?: string;
  burning_rate?: number;
  status: AgentStatus;
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

// ---- Running Agents ----

export interface RunningAgent {
  /** Unique agent ID within the runtime */
  agentId: string;
  /** Pod name in Kubernetes */
  podName: string;
  /** Agent display name */
  name: string;
  /** AgentSpec ID used to create the agent */
  specId?: string;
  /** Current agent status */
  status: AgentStatus;
  /** Model being used */
  model: string;
  /** When the agent was created */
  createdAt: string;
  /** Number of completed turns */
  turnCount: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Estimated cost in USD */
  totalCostUsd: number;
  /** Whether DBOS durability is enabled */
  durableEnabled: boolean;
}
