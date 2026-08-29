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
 * - `useVercelAI` - Vercel AI SDK chat protocol, spoken to a runtime
 * - `useBrowserAgent` - the loop itself, running in the page
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
export {
  useSkills,
  useSkillActions,
  useAgentRuntimeLoadedSkills as useAgentLoadedSkills,
} from './useSkills';
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

// The browser harness. Same `useChat` helpers as `useVercelAI` — the branch is
// one transport, so every chat component downstream is shared.
export {
  useBrowserAgent,
  type UseBrowserAgentOptions,
} from './useBrowserAgent';

// =============================================================================
// Datalayer Platform Hooks
// =============================================================================

/**
 * Unified hook for managing agents — both ephemeral and durable.
 */
export {
  useAgentRuntimes,
  type AgentRuntimeConnectionOptions,
  type AgentRuntimeVariant,
  type RuntimeCreationTarget,
  type UseAgentOptions,
  type UseAgentReturn,
} from './useAgentRuntimes';

/**
 * Runtime query and mutation hooks.
 */
export {
  useAgentsRuntimes,
  useAgentRuntimesQuery,
  useAgentRuntimeByName,
  useCreateAgentRuntime,
  useDeleteAgentRuntime,
  useRefreshAgentRuntimes,
  agentQueryKeys,
  AGENT_QUERY_OPTIONS,
  useAgentLifecycleStore,
  getAgentLifecycleKey,
  markRuntimeDeleted,
  clearRuntimeDeleted,
} from './useAgentRuntimes';

/**
 * Central registry of ServiceManagers connected to agent sandbox pods.
 */
export {
  registerSandboxServiceManager,
  disposeSandboxServiceManagers,
} from '../services/sandboxServiceManagers';

/**
 * Agent-runtime WebSocket stream hook.
 */
export {
  useAgentRuntimeWebSocket,
  type UseAgentRuntimeWebSocketOptions,
} from './useAgentRuntimes';

/**
 * Agent catalog store, AI Agents REST API, and registry hooks.
 */
export {
  useAgentCatalogStore,
  type AgentCatalogStoreState,
} from './useAgentsCatalog';

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
  useAllAgentEvents,
  useAgentEvents,
  useAgentEvent,
  useCreateAgentEvent,
  useUpdateAgentEvent,
  useDeleteAgentEvent,
  useMarkEventRead,
  useMarkEventUnread,
} from './useNotifications';

export {
  useAIAgentsWebSocket,
  type UseAIAgentsWebSocketOptions,
  type UseAIAgentsWebSocketResult,
  type AIAgentsWebSocketCloseInfo,
  type AIAgentsWebSocketConnectionState,
} from './useAIAgentsWebSocket';

export {
  useProjects,
  useProject,
  useUpdateProject,
  useDeleteProject,
  useRefreshProjects,
  useProjectDefaultItems,
  type ProjectData,
} from './useProjects';

export {
  useOtelTotalTokens,
  fetchOtelTotalTokens,
  fetchOtelMetricTotal,
  fetchOtelMetricRows,
  toMetricValue,
} from './useMonitoring';

// Global top progress bar: a single shared store + a convenience hook so any
// view can drive the one app-wide progress bar.
export { useProgressStore, type ProgressState } from './useProgressStore';
export { useProgressTask } from './useProgressTask';

// Re-export core hooks so consumers can progressively migrate imports to
// agent-runtimes without splitting runtime/content and IAM hook sources.
export * from '@datalayer/core/lib/hooks';
