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
export * from './types';

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
} from './store';

// Hooks (re-exported from main hooks folder)
export {
  useChat,
  useFrontendTool,
  useBackendTool,
  ActionRegistrar,
  type UseChatReturn,
  type UseFrontendToolFn,
} from '../../hooks';

// Inference Providers
export {
  BaseInferenceProvider,
  DatalayerInferenceProvider,
  SelfHostedInferenceProvider,
  type DatalayerInferenceConfig,
  type SelfHostedInferenceConfig,
} from './inference';

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
} from './protocols';

// Tools
export { ToolExecutor, type ToolExecutionContext } from './tools';

// Middleware
export {
  MiddlewarePipeline,
  createMiddleware,
  loggingMiddleware,
  createHITLMiddleware,
  type RequestContext,
  type ResponseContext,
} from './middleware';

// Extensions
export {
  ExtensionRegistry,
  createMessageRenderer,
  createActivityRenderer,
  createA2UIRenderer,
  A2UIExtensionImpl,
  type A2UIMessage,
  type InternalExtensionType,
} from './extensions';

// Components
export {
  ChatMessages,
  ChatSidebar,
  ChatStandalone,
  ChatBase,
  InputPrompt,
  ToolApprovalDialog,
  useToolApprovalDialog,
  PoweredByTag,
  FloatingBrandButton,
  ChatHeader,
  MessagePart,
  TextPart,
  ReasoningPart,
  ToolPart,
  DynamicToolPart,
  ToolCallDisplay,
  Chat,
  ChatFloating,
  AgentDetails,
  AgentIdentity,
  IdentityCard,
  getTokenStatus,
  formatDuration,
  formatExpirationStatus,
  type ChatMessagesProps,
  type ChatSidebarProps,
  type ChatStandaloneProps,
  type MessageHandler,
  type ChatBaseProps,
  type ProtocolConfig,
  type AgentRuntimeConfig,
  type AvatarConfig,
  type EmptyStateConfig,
  type HeaderButtonsConfig,
  type StreamingMessageOptions,
  type ChatViewMode,
  type InputPromptProps,
  type ToolApprovalDialogProps,
  type PoweredByTagProps,
  type FloatingBrandButtonProps,
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
  type AgentDetailsProps,
  type AgentIdentityProps,
  type IdentityCardProps,
  type TokenStatus,
  // Merged from chat
  type ChatHeaderProps,
  type ConnectionState,
  type MessagePartProps,
  type TextPartProps,
  type ReasoningPartProps,
  type ToolPartProps,
  type DynamicToolPartProps,
  type ToolCallDisplayProps,
  // Unified chat types (supports: 'acp', 'ag-ui', 'a2a', 'vercel-ai', 'vercel-ai-jupyter' transports)
  type ChatProps,
  type Transport,
  type Extension,
} from './components';

// Simple API request handler (merged from chat)
export { requestAPI } from './handler';

// Keyboard shortcuts (re-exported from main hooks folder)
export {
  useKeyboardShortcuts,
  useChatKeyboardShortcuts,
  getShortcutDisplay,
  type KeyboardShortcut,
  type UseKeyboardShortcutsOptions,
} from '../../hooks';
