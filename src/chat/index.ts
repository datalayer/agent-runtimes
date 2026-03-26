/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat - Next generation chat component for agent-runtimes.
 *
 * Features:
 * - Multiple transport support: AG-UI, A2A, ACP
 * - Hybrid tool execution (frontend/backend)
 * - Human-in-the-loop (HITL) tool approval
 * - Middleware pipeline for extensibility
 * - Extension registry for custom renderers
 * - Primer React UI components
 * - Zustand state management (NO provider required!)
 *
 * @module components/chat
 *
 * @example
 * ```tsx
 * import {
 *   useChatStore,
 *   ChatSidebar,
 *   useFrontendTool,
 *   DatalayerInferenceProvider,
 * } from './chat';
 *
 * // Setup inference provider (once at app init)
 * const provider = new DatalayerInferenceProvider({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.datalayer.io',
 * });
 * useChatStore.getState().setInferenceProvider(provider);
 *
 * function App() {
 *   return (
 *     <>
 *       <ToolRegistrar />
 *       <ChatSidebar title="Assistant" />
 *     </>
 *   );
 * }
 *
 * function ToolRegistrar() {
 *   useFrontendTool({
 *     name: 'greet',
 *     description: 'Greet a user',
 *     parameters: [{ name: 'name', type: 'string', required: true }],
 *     handler: async ({ name }) => ({ greeting: `Hello, ${name}!` }),
 *   });
 *   return null;
 * }
 * ```
 */

// Components - Chat elements
export { ChatMessages, type ChatMessagesProps } from './messages/ChatMessages';
export { ChatSidebar, type ChatSidebarProps } from './ChatSidebar';
export { ChatStandalone } from './ChatStandalone';
export { ChatBase } from './base/ChatBase';
export { InputPrompt, type InputPromptProps } from './prompt';
export { PoweredByTag, type PoweredByTagProps } from './elements/PoweredByTag';
export {
  FloatingBrandButton,
  type FloatingBrandButtonProps,
} from './elements/FloatingBrandButton';
export {
  ChatHeader,
  type ChatHeaderProps,
  type ConnectionState,
} from './elements/ChatHeader';

// Components - Message part renderers
export {
  MessagePart,
  type MessagePartProps,
  TextPart,
  type TextPartProps,
  ReasoningPart,
  type ReasoningPartProps,
  ToolPart,
  type ToolPartProps,
  DynamicToolPart,
  type DynamicToolPartProps,
} from './parts';

// Components - Tool UI
export { ToolCallDisplay, type ToolCallDisplayProps } from './tools';
export {
  ToolApprovalDialog,
  useToolApprovalDialog,
  type ToolApprovalDialogProps,
} from './tools/ToolApprovalDialog';
export {
  ToolApprovalBanner,
  type ToolApprovalBannerProps,
  type PendingApproval,
} from './tools/ToolApprovalBanner';

// Components - Transport-agnostic chat
export { Chat, type ChatProps } from './Chat';
export { ChatFloating, type ChatFloatingProps } from './ChatFloating';
export {
  ChatInline,
  type ChatInlineProps,
  type ChatInlineProtocolConfig,
} from './ChatInline';

// Components - Agent and context views (compatibility exports)
export { AgentDetails } from '../agents/AgentDetails';
export { OtelTokenUsageChart } from '../context/OtelTokenUsageChart';
export { ContextPanel } from '../context/ContextPanel';
export { ContextInspector } from '../context/ContextInspector';

// Types - chat configuration and rendering types
export type {
  Suggestion,
  ModelConfig,
  ChatViewMode,
  ProtocolConfig,
  RenderToolResult,
  MessageHandler,
} from '../types';
