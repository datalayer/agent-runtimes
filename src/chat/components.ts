/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Component exports for chat.
 *
 * @module components/chat/components
 */

export { ChatMessages, type ChatMessagesProps } from './elements/ChatMessages';
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
export { InputPrompt, type InputPromptProps } from './elements/InputPrompt';
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
  ToolApprovalDialog,
  useToolApprovalDialog,
  type ToolApprovalDialogProps,
} from './tools/ToolApprovalDialog';
export {
  ToolApprovalBanner,
  type ToolApprovalBannerProps,
  type PendingApproval,
} from './tools/ToolApprovalBanner';
export { PoweredByTag, type PoweredByTagProps } from './elements/PoweredByTag';
export {
  FloatingBrandButton,
  type FloatingBrandButtonProps,
} from './elements/FloatingBrandButton';

// Connection state header
export {
  ChatHeader,
  type ChatHeaderProps,
  type ConnectionState,
} from './elements/ChatHeader';

// Message part renderer (for AI SDK UIMessage parts)
export { MessagePart, type MessagePartProps } from './elements/MessagePart';

// Display components for message parts
export {
  TextPart,
  type TextPartProps,
  ReasoningPart,
  type ReasoningPartProps,
  ToolPart,
  type ToolPartProps,
  DynamicToolPart,
  type DynamicToolPartProps,
} from './parts';
// Display components for message parts
export { ToolCallDisplay, type ToolCallDisplayProps } from './tools';

// Chat component (transport-agnostic)
// Supports: 'acp', 'vercel-ai', 'ag-ui', 'a2a', 'vercel-ai-jupyter' transports
export { Chat, type ChatProps, type Transport, type Extension } from './Chat';

// Floating chat component for AG-UI examples
// Render pattern aligned with CopilotKit's useRenderToolCall
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

// Inline chat component for text selection AI assistance
export {
  ChatInline,
  type ChatInlineProps,
  type ChatInlineProtocolConfig,
} from './ChatInline';
export {
  OtelTokenUsageChart,
  type OtelTokenUsageChartProps,
} from '../context/OtelTokenUsageChart';
