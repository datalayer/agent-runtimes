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

// Types
export * from '../types';

// Store (primary state management - no provider needed!)
export {
  useChatStore,
  useChatMessages,
  useChatLoading,
  useChatStreaming,
  useChatError,
  useChatTools,
  useChatOpen,
  useChatConfig,
  useChatReady,
  useChatInferenceProvider,
  useChatExtensionRegistry,
  defaultChatConfig,
  type ChatStore,
  type ChatState,
  type ChatActions,
  type ChatConfig,
  type ToolCallState,
} from '../store';

// Hooks (re-exported from main hooks folder)
export {
  useChat,
  useFrontendTool,
  useBackendTool,
  ActionRegistrar,
  type UseChatReturn,
  type UseFrontendToolFn,
} from '../hooks';

// Inference Providers
export {
  BaseInferenceProvider,
  DatalayerInferenceProvider,
  SelfHostedInferenceProvider,
  type DatalayerInferenceConfig,
  type SelfHostedInferenceConfig,
} from '../inference';

// Protocol Adapters
export {
  BaseProtocolAdapter,
  AGUIAdapter,
  A2AAdapter,
  ACPAdapter,
  type AGUIAdapterConfig,
  type A2AAdapterConfig,
  type ACPAdapterConfig,
  type ACPSession,
  type ACPAgent,
  type ACPPendingPermission,
} from '../protocols';

// Tools
export { ToolExecutor, type ToolExecutionContext } from '../tools';

// Middleware
export {
  MiddlewarePipeline,
  createMiddleware,
  loggingMiddleware,
  createHITLMiddleware,
  type RequestContext,
  type ResponseContext,
} from '../middleware';

// Extensions
export {
  ExtensionRegistry,
  createMessageRenderer,
  createActivityRenderer,
  createA2UIRenderer,
  A2UIExtensionImpl,
  type A2UIMessage,
  type InternalExtensionType,
} from '../extensions';

// Components - Chat elements
export { ChatMessages, type ChatMessagesProps } from './messages/ChatMessages';
export { ChatSidebar, type ChatSidebarProps } from './ChatSidebar';
export {
  ChatStandalone,
  type ChatStandaloneProps,
  type MessageHandler,
} from './ChatStandalone';
export {
  ChatBase,
  type ChatBaseProps,
  type ProtocolConfig,
  type AgentRuntimeConfig,
  type AvatarConfig,
  type EmptyStateConfig,
  type HeaderButtonsConfig,
  type StreamingMessageOptions,
  type ChatViewMode,
} from './base/ChatBase';
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
export { Chat, type ChatProps, type Transport, type Extension } from './Chat';
export {
  ChatFloating,
  type ChatFloatingProps,
  type ToolCallRenderContext,
  type ToolCallStatus,
  type RenderToolResult,
  type RespondCallback,
  type Suggestion,
  type RemoteConfig,
  type ModelConfig,
  type BuiltinTool,
  type MCPServerConfig,
  type MCPServerTool,
  type ChatViewMode as ChatFloatingViewMode,
} from './ChatFloating';
export {
  ChatInline,
  type ChatInlineProps,
  type ChatInlineProtocolConfig,
} from './ChatInline';

// Components - Agent details & identity
export { AgentDetails, type AgentDetailsProps } from '../agents/AgentDetails';
export {
  AgentIdentity,
  IdentityCard,
  getTokenStatus,
  formatDuration,
  formatExpirationStatus,
  type AgentIdentityProps,
  type IdentityCardProps,
  type TokenStatus,
} from '../identity/AgentIdentity';

// Components - Context & observability
export {
  ContextUsage,
  type ContextUsageProps,
  type ContextDetailsResponse,
} from '../context/ContextUsage';
export {
  ContextDistribution,
  type ContextDistributionProps,
  type ContextSnapshotResponse,
} from '../context/ContextDistribution';
export { ContextPanel, type ContextPanelProps } from '../context/ContextPanel';
export {
  ContextInspector,
  type ContextInspectorProps,
  type FullContextResponse,
} from '../context/ContextInspector';
export {
  CostTracker,
  type CostTrackerProps,
  type CostUsageResponse,
} from '../context/CostTracker';
export {
  OtelTokenUsageChart,
  type OtelTokenUsageChartProps,
} from '../context/OtelTokenUsageChart';
export {
  fetchOtelMetricRows,
  fetchOtelMetricTotal,
  fetchOtelTotalTokens,
  useOtelTotalTokens,
  toMetricValue,
} from '../context/otelMetrics';

// Simple API request handler (merged from chat)
export { requestAPI } from '../api/handler';

// Keyboard shortcuts (re-exported from main hooks folder)
export {
  useKeyboardShortcuts,
  useChatKeyboardShortcuts,
  getShortcutDisplay,
  type KeyboardShortcut,
  type UseKeyboardShortcutsOptions,
} from '@datalayer/core/lib/hooks';
