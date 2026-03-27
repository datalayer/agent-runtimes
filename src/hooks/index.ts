/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hooks for agent-runtimes.
 *
 * This module exports hooks organized by their purpose:
 *
 * ## Chat Component System Hooks
 * These hooks work with the Zustand-based chat component system.
 * Use these when building with `<Chat />`, `<ChatSidebar />`, etc.
 *
 * - `useChat` - Main chat hook for messages, streaming, and state
 * - `useFrontendTool`, `useBackendTool` - Tool registration hooks
 *
 * ## Transport-Specific Hooks
 * These hooks provide direct protocol access without the chat component system.
 * Use these for custom implementations or when you need fine-grained control.
 *
 * - `useAgUi` - AG-UI protocol (Pydantic AI's native protocol)
 * - `useA2A` - A2A protocol (Agent-to-Agent with JSON-RPC)
 * - `useAcp` - ACP protocol (Agent Client Protocol via WebSocket)
 * - `useVercelAI` - Vercel AI SDK chat protocol
 *
 * ## Datalayer-Specific Hooks
 * Hooks for Datalayer platform integration.
 *
 * - `useAgentsService` - Datalayer AI Agents REST API
 * - `useNotebookAgents` - Notebook-specific agent management
 *
 * @module hooks
 */

// =============================================================================
// Chat Component System Hooks
// =============================================================================

/**
 * Main chat hook for the chat component system (Zustand-based).
 * Use with `<Chat />`, `<ChatSidebar />`, `<ChatFloating />`, etc.
 */
export { useChat, type UseChatReturn } from './useChat';

/**
 * Tool registration hooks for the chat component system.
 */
export {
  useFrontendTool,
  useBackendTool,
  useRegisteredTools,
  useTool,
  usePendingToolCalls,
  ActionRegistrar,
  type UseFrontendToolFn,
} from './useTools';

/**
 * ChatBase infrastructure hooks.
 */
export { useConfig } from './useConfig';
export { useSkills } from './useSkills';
export { useContextSnapshot } from './useContextSnapshot';
export { useSandbox } from './useSandbox';

// =============================================================================
// Transport-Specific Hooks (Direct Protocol Access)
// =============================================================================

/**
 * AG-UI protocol hook - Pydantic AI's native protocol.
 * Use for direct AG-UI communication without the chat component system.
 */
export { useAgUi } from './useAgUi';

/**
 * A2A protocol hook - Agent-to-Agent with JSON-RPC 2.0.
 * Use for direct A2A communication without the chat component system.
 */
export { useA2A } from './useA2A';

/**
 * ACP protocol hook - Agent Client Protocol via WebSocket.
 * Use for direct ACP communication without the chat component system.
 */
export * from './useAcp';

/**
 * Vercel AI SDK chat hook - HTTP/SSE streaming.
 * Use for direct Vercel AI communication without the chat component system.
 */
export { useVercelAI } from './useVercelAI';

// =============================================================================
// Datalayer Platform Hooks
// =============================================================================

/**
 * Unified hook for managing agents — both ephemeral and durable.
 */
export { useAgents } from './useAgents';

/**
 * Runtime query and mutation hooks.
 */
export {
  useAgentsRuntimes,
  useAgentRuntimes,
  useAgentRuntimeByPodName,
  useCreateAgentRuntime,
  useDeleteAgentRuntime,
  useRefreshAgentRuntimes,
  agentQueryKeys,
  AGENT_QUERY_OPTIONS,
  useAgentLifecycleStore,
  getAgentLifecycleKey,
} from './useAgents';

/**
 * Agent catalog store, AI Agents REST API, and registry hooks.
 */
export {
  useAgentCatalogStore,
  type AgentCatalogStoreState,
} from './useAgentsCatalog';

/**
 * Agent registry hook.
 */
export { useAgentRegistry } from './useAgentsRegistry';

/**
 * Agents Service REST API (deprecated).
 */
export { useAgentsService, useNotebookAgents } from './useAgentsService';

/**
 * Focused hooks split by responsibility.
 */
export {
  useCheckpoints,
  useCheckpointsQuery,
  useRefreshCheckpoints,
  useDeletePausedAgentRuntime,
  useResumePausedAgentRuntime,
  usePauseAgent,
  useResumeAgent,
  useCheckpointAgent,
  useTerminateAgent,
  useAgentLifecycle,
  type CheckpointData,
  type PauseAgentParams,
  type ResumeAgentParams,
  type CheckpointAgentParams,
  type TerminateAgentParams,
  type AgentLifecycleOptions,
  type AgentLifecycleReturn,
} from './useCheckpoints';

export {
  useToolApprovals,
  useToolApprovalsQuery,
  usePendingApprovalCount,
  useApproveToolRequest,
  useRejectToolRequest,
} from './useToolApprovals';

export {
  useNotifications,
  useFilteredNotifications,
  useUnreadNotificationCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useAgentEvents,
  useAgentEvent,
  useCreateAgentEvent,
  useUpdateAgentEvent,
} from './useNotifications';

export {
  useOtelTotalTokens,
  fetchOtelTotalTokens,
  fetchOtelMetricTotal,
  fetchOtelMetricRows,
  toMetricValue,
} from './useMonitoring';
