/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hooks for managing Agent Runtimes (running agent instances).
 *
 * Agent Runtimes are backed by the datalayer-runtimes service (K8s pods).
 * A project (space with variant="project") can have an agent runtime attached
 * via its `attachedAgentPodName` field.
 *
 * @module hooks/useAgentRuntimes
 */

import { useCache } from '@datalayer/core/lib/hooks';
import type { AgentSpec } from '../types';

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
    useRefreshAgentRuntimes: cache.useRefreshAgentRuntimes,
    queryKeys: cache.queryKeys,
  };
}

// ============================================================================
// Agent Runtimes Hooks (from datalayer-runtimes service)
// ============================================================================

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
 * Hook to refresh agent runtimes list.
 */
export function useRefreshAgentRuntimes() {
  const { useRefreshAgentRuntimes: hook } = useCache();
  return hook();
}
