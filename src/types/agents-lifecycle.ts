/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Types for agent lifecycle management — runtime creation/connection
 * and the local pause/resume UI state store.
 *
 * @module types/agents-lifecycle
 */

import type { AgentRuntimeData } from './agents';

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
// Lifecycle Store (local pause/resume UI state)
// ═══════════════════════════════════════════════════════════════════════════

export type AgentLifecycleRecord = {
  resumePending: boolean;
  pauseLockedForResumed: boolean;
};

export type AgentLifecycleState = {
  byRuntimeKey: Record<string, AgentLifecycleRecord>;
  markResumePending: (runtimeKey: string) => void;
  markResumeFailed: (runtimeKey: string) => void;
  markResumeSettled: (runtimeKey: string) => void;
  clearRuntimeLifecycle: (runtimeKey: string) => void;
};
