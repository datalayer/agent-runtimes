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
  /** Account UID (user or organization) charged for runtime costs */
  billingEntityUid?: string;
  /** User account handle used for user home mount path. */
  userAccountHandle?: string;
  /** Account kind charged for runtime costs. */
  billingEntityType?: 'user' | 'organization' | 'team';
  /** Account handle charged for runtime costs. */
  billingEntityHandle?: string;
  /** Source organization UID for team-billed runtimes. */
  billingSourceOrganizationUid?: string;
  /** Source organization handle for team-billed runtimes. */
  billingSourceOrganizationHandle?: string;
  /**
   * Pod name (`runtime-<ULID>`) the Contents attachments were made for; the
   * runtime is created under it so the attachments name the right sandbox.
   */
  podName?: string;
  /**
   * Contents attachments to mount, created for `podName` before the runtime:
   * a Home Folder attachment mounts the caller's home folders, a Volume
   * attachment mounts its Volume. There is no other way to ask for a mount.
   */
  contentAttachmentUids?: string[];
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
