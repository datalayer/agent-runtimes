/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AI Agent model
 */
import type { Agentspec } from './agentspecs';
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
  'secondary' | 'attention' | 'success' | 'severe' | 'accent' | 'danger';

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
 * Backend RuntimePod fields: pod_name, environment{name,title,cpu,memory,gpu,resources}, uid,
 * type, given_name, token, ingress, reservation_id, started_at, expired_at, burning_rate.
 *
 * We map `ingress` to `url` for consistency with the UI.
 */
export type AgentRuntimeData = {
  pod_name: string;
  id: string;
  name: string;
  environment: {
    name: string;
    title?: string;
    cpu?: string;
    memory?: string;
    gpu?: string;
    resources?: Record<string, string>;
  };
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
  agentSpec?: Agentspec;
  // ID of the agent spec used to create this runtime
  agent_spec_id?: string;
  // Account metadata charged for runtime usage
  billing_entity_uid?: string;
  billing_entity_type?: 'user' | 'organization' | 'team';
  billing_entity_handle?: string;
  /** Home folders the runtime mounts: the caller's own and their memberships. */
  home_folder_mounts?: RuntimeHomeFolderMount[];
  /** Contents attachments the runtime mounts, as recorded on its pod. */
  content_attachments?: RuntimeContentAttachment[];
};

/** One home folder a runtime mounts, at `~/{handle}`. */
export type RuntimeHomeFolderMount = {
  type: 'user' | 'organization' | 'team';
  uid: string;
  handle?: string;
  organization_handle?: string;
};

/**
 * A Contents attachment as the runtime reports it.
 *
 * `source_kind` is the kind of the attached source — `files` for the Home
 * Folder, `volume` for a Volume — which is what tells the two mounts apart.
 */
export type RuntimeContentAttachment = {
  uid?: string;
  source_uid?: string;
  source_kind?: string;
  delivery?: 'mount' | 'local-bridge' | 'materialize' | 'client' | 'environment';
  mount_path?: string | null;
  mode?: 'ro' | 'rw';
  required?: boolean;
  status?: string;
  provider_resource_id?: string | null;
};

// ---- Running Agents ----

export interface RunningAgent {
  /** Unique agent ID within the runtime */
  agentId: string;
  /** Pod name in Kubernetes */
  podName: string;
  /** Agent display name */
  name: string;
  /** Agentspec ID used to create the agent */
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
