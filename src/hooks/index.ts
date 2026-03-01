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
 * - `useKeyboardShortcuts` - Keyboard shortcut handling
 *
 * ## Transport-Specific Hooks
 * These hooks provide direct protocol access without the chat component system.
 * Use these for custom implementations or when you need fine-grained control.
 *
 * - `useAGUI` - AG-UI protocol (Pydantic AI's native protocol)
 * - `useA2A` - A2A protocol (Agent-to-Agent with JSON-RPC)
 * - `useAcp` - ACP protocol (Agent Client Protocol via WebSocket)
 * - `useVercelChat` - Vercel AI SDK chat protocol
 *
 * ## Datalayer-Specific Hooks
 * Hooks for Datalayer platform integration.
 *
 * - `useAIAgents` - Datalayer AI Agents REST API
 * - `useNotebookAIAgent` - Notebook-specific agent management
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
 * Keyboard shortcut hooks for chat UI.
 */
export {
  useKeyboardShortcuts,
  useChatKeyboardShortcuts,
  getShortcutDisplay,
  type KeyboardShortcut,
  type UseKeyboardShortcutsOptions,
} from './useKeyboardShortcuts';

// =============================================================================
// Transport-Specific Hooks (Direct Protocol Access)
// =============================================================================

/**
 * AG-UI protocol hook - Pydantic AI's native protocol.
 * Use for direct AG-UI communication without the chat component system.
 */
export { useAGUI } from './useAGUI';

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
export { useVercelChat } from './useVercelChat';

// =============================================================================
// Datalayer Platform Hooks
// =============================================================================

/**
 * Datalayer AI Agents REST API hook.
 */
export * from './useAgents';
export * from './useAgentRuntimes';
export * from './useAgentStore';
export * from './useNotebookAIAgent';
