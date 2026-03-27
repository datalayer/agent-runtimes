/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AI Agent model
 */
import type { ServiceManager } from '@jupyterlab/services';
import type { AgentSpec } from './agentspecs';

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
 * Information about a connected agent runtime.
 */
export interface AgentConnection {
  /** Runtime pod name (unique identifier). */
  podName: string;
  /** Environment name. */
  environmentName: string;
  /** Base URL for the Jupyter server. */
  jupyterBaseUrl: string;
  /** Base URL for the agent-runtimes server. */
  agentBaseUrl: string;
  /** JupyterLab ServiceManager for the runtime. */
  serviceManager?: ServiceManager.IManager;
  /** Runtime status. */
  status: AgentStatus;
  /** Kernel ID if connected. */
  kernelId?: string;
  /** Agent ID. */
  agentId?: string;
  /** Full endpoint URL for the agent. */
  endpoint?: string;
  /** Whether the agent is ready to use. */
  isReady?: boolean;
}

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

/**
 * A persisted checkpoint record returned from the runtimes API.
 */
export interface CheckpointRecord {
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
  status_message?: string;
  updated_at: string;
}

export type CheckpointMode = 'criu' | 'light';

export type IAIAgent = {
  /**
   * ID of the document monitored by the agent.
   */
  documentId: string;
  /**
   * ID of the runtime connected to the agent.
   *
   * This is not the name of the remote pod but
   * the Simple Kernel ID of the process within it.
   */
  runtimeId?: string;
};

export default IAIAgent;
