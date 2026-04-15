/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Type definitions for the ChatBase component and its sub-components.
 *
 * @module types/chat
 */

import type { ReactNode } from 'react';
import type { ChatMessage, MessageHandler } from './messages';
import type { Protocol, ProtocolConfig } from './protocol';
import type { McpServerSelection } from './inference';
import type { MCPServerTool } from './mcp';
import type { AgentRuntimeConfig } from './config';
import type { FrontendToolDefinition } from './tools';
import type { PoweredByTagProps } from '../chat/display/PoweredByTag';

// ---------------------------------------------------------------------------
// Tool invocation hooks
// ---------------------------------------------------------------------------

/**
 * Context passed to tool-call pre-hooks.
 * Fires when a tool call starts executing (backend or frontend).
 */
export interface ToolCallStartContext {
  /** The tool name as declared by the agent */
  toolName: string;
  /** Unique identifier for this tool invocation */
  toolCallId: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/**
 * Context passed to tool-call post-hooks.
 * Fires when a tool result is received.
 */
export interface ToolCallCompleteContext {
  /** The tool name as declared by the agent */
  toolName: string;
  /** Unique identifier for this tool invocation */
  toolCallId: string;
  /** Arguments that were passed to the tool */
  args: Record<string, unknown>;
  /** The tool result (may be a string, object, or undefined on error) */
  result: unknown;
  /** Final status of the tool invocation */
  status: DisplayToolCallStatus;
  /** Error message, if the tool call failed */
  error?: string;
}

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

/**
 * View mode for the chat component.
 * - 'floating': Full-height floating panel (pinned to the right edge with offset)
 * - 'floating-small': Standard floating popup
 * - 'sidebar': Docked sidebar panel
 */
export type ChatViewMode = 'floating' | 'floating-small' | 'sidebar';

// ---------------------------------------------------------------------------
// Tool call types
// ---------------------------------------------------------------------------

/**
 * Tool call status for tool rendering
 */
export type DisplayToolCallStatus =
  | 'inProgress'
  | 'executing'
  | 'complete'
  | 'error';

/**
 * Response callback type for human-in-the-loop interactions
 */
export type RespondCallback = (result: unknown) => void;

/**
 * Tool call render context passed to renderToolResult
 */
export interface ToolCallRenderContext {
  /** Tool call ID */
  toolCallId: string;
  /** Tool name (e.g., "get_weather") */
  toolName: string;
  /** Alias for toolName */
  name: string;
  /** Tool arguments (may be incomplete during 'inProgress' status) */
  args: Record<string, unknown>;
  /** Tool result (only available when status is 'complete') */
  result?: unknown;
  /** Tool call status */
  status: DisplayToolCallStatus;
  /** Error message if status is 'error' */
  error?: string;
  /**
   * Callback to send response back to the agent (human-in-the-loop).
   * Only available when status is 'executing'.
   * Calling this resolves the tool call with the provided result.
   */
  respond?: RespondCallback;
}

/**
 * Render function for tool results
 */
export type RenderToolResult = (context: ToolCallRenderContext) => ReactNode;

/**
 * Internal type for tracking tool calls in messages
 */
export interface ToolCallMessage {
  id: string;
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: DisplayToolCallStatus;
  error?: string;
  /** Infrastructure/execution error message */
  executionError?: string;
  /** Code error details (Python exception) */
  codeError?: {
    name: string;
    value: string;
    traceback?: string;
  };
  /** Exit code when code called sys.exit() */
  exitCode?: number | null;
}

/**
 * Union type for all displayable items in the chat
 */
export type DisplayItem = ChatMessage | ToolCallMessage;

// ---------------------------------------------------------------------------
// Suggestion
// ---------------------------------------------------------------------------

/**
 * Suggestion item for quick actions
 */
export interface Suggestion {
  /** Display title for the suggestion */
  title: string;
  /** Message to send when clicked */
  message: string;
}

// ---------------------------------------------------------------------------
// Configuration types
// ---------------------------------------------------------------------------

/**
 * Avatar configuration
 */
export interface AvatarConfig {
  /** User avatar icon or image */
  userAvatar?: ReactNode;
  /** Assistant avatar icon or image */
  assistantAvatar?: ReactNode;
  /** System avatar icon or image */
  systemAvatar?: ReactNode;
  /** Avatar size in pixels */
  avatarSize?: number;
  /** User avatar background color */
  userAvatarBg?: string;
  /** Assistant avatar background color */
  assistantAvatarBg?: string;
  /** Show avatars */
  showAvatars?: boolean;
}

/**
 * Header button configuration
 */
export interface HeaderButtonsConfig {
  /** Show new chat button */
  showNewChat?: boolean;
  /** Show clear button */
  showClear?: boolean;
  /** Show settings button */
  showSettings?: boolean;
  /** Callback when new chat clicked */
  onNewChat?: () => void;
  /** Callback when clear clicked */
  onClear?: () => void;
  /** Callback when settings clicked */
  onSettings?: () => void;
}

/**
 * Empty state configuration
 */
export interface EmptyStateConfig {
  /** Custom empty state icon */
  icon?: ReactNode;
  /** Empty state title */
  title?: string;
  /** Empty state subtitle */
  subtitle?: string;
  /** Custom empty state renderer */
  render?: () => ReactNode;
}

// ---------------------------------------------------------------------------
// Model / Tool / MCP configuration
// ---------------------------------------------------------------------------

/**
 * Model configuration
 */
export interface ModelConfig {
  id: string;
  name: string;
  builtinTools?: string[];
  isAvailable?: boolean;
}

/**
 * MCP Server configuration from backend
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  url?: string;
  enabled: boolean;
  tools: MCPServerTool[];
  command?: string;
  args?: string[];
  requiredEnvVars?: string[];
  isAvailable?: boolean;
  transport?: string;
  isConfig?: boolean;
  isRunning?: boolean;
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ChatCommonProps — shared base for all Chat* wrapper components
// ---------------------------------------------------------------------------

/**
 * Common props shared by all Chat wrapper components
 * (Chat, ChatFloating, ChatSidebar, ChatStandalone, ChatPopupStandalone).
 *
 * These props represent the public API surface that consumers interact with.
 * Wrapper components forward most of them to ChatBase and translate others
 * (e.g. `showNewChatButton` → `headerButtons.showNewChat`).
 *
 * Each wrapper extends this interface with component-specific props
 * (e.g. `position`, `defaultOpen`, `width` for floating variants).
 *
 * Use `panelProps` as an escape hatch to pass any ChatBase prop not
 * directly surfaced in this interface.
 */
export interface ChatCommonProps {
  // ============ Protocol / Connection ============

  /**
   * Protocol type or full configuration.
   *
   * When a `Protocol` string is provided (e.g. `'vercel-ai'`), it is forwarded
   * to ChatBase. When a full `ProtocolConfig` object is provided, it is used
   * directly.
   *
   * @default 'vercel-ai'
   */
  protocol?: Protocol | ProtocolConfig;

  /**
   * Use Zustand store for state management instead of protocol endpoint.
   * @default true
   */
  useStore?: boolean;

  // ============ Display ============

  /** Chat title */
  title?: string;

  /** Description shown in empty state */
  description?: string;

  /** Show header */
  showHeader?: boolean;

  /** Show input area */
  showInput?: boolean;

  /** Custom class name */
  className?: string;

  /** Children to render in the messages area */
  children?: ReactNode;

  /** Custom brand icon for header / empty state */
  brandIcon?: ReactNode;

  /** Input placeholder */
  placeholder?: string;

  // ============ Header Buttons ============

  /** Show new chat button in header */
  showNewChatButton?: boolean;

  /** Show clear button in header */
  showClearButton?: boolean;

  /** Show settings button in header */
  showSettingsButton?: boolean;

  // ============ Powered By ============

  /** Show powered by tag */
  showPoweredBy?: boolean;

  /** Powered by tag props */
  poweredByProps?: Partial<PoweredByTagProps>;

  // ============ Callbacks ============

  /** Callback when settings is clicked */
  onSettingsClick?: () => void;

  /** Callback when new chat is triggered */
  onNewChat?: () => void;

  /** Callback when the component opens */
  onOpen?: () => void;

  /** Callback when the component closes */
  onClose?: () => void;

  // ============ Message Handling ============

  /**
   * Custom message handler.
   * When provided, uses this handler instead of protocol mode.
   */
  onSendMessage?: MessageHandler;

  /**
   * Enable streaming mode for custom message handler.
   * @default false
   */
  enableStreaming?: boolean;

  // ============ Model / Tool / Skill Selectors ============

  /** Show model selector */
  showModelSelector?: boolean;

  /** Show tools menu */
  showToolsMenu?: boolean;

  /** Show skills menu */
  showSkillsMenu?: boolean;

  /**
   * Show token usage bar.
   * @default true
   */
  showTokenUsage?: boolean;

  /** Indicate tools are accessed via Codemode meta-tools */
  codemodeEnabled?: boolean;

  /** Initial model ID to select (e.g., 'openai:gpt-4o-mini') */
  initialModel?: string;

  /**
   * Override the list of available models.
   * When provided, replaces models returned by the config endpoint.
   */
  availableModels?: ModelConfig[];

  /** MCP server selections to enable (others disabled) */
  mcpServers?: McpServerSelection[];

  /** Initial skill IDs to enable */
  initialSkills?: string[];

  // ============ Tool Rendering & Hooks ============

  /** Custom render function for tool results */
  renderToolResult?: RenderToolResult;

  /** Frontend tool definitions to register with the chat */
  frontendTools?: FrontendToolDefinition[];

  /** Pre-hook: fires when a tool call starts executing */
  onToolCallStart?: (context: ToolCallStartContext) => void;

  /** Post-hook: fires when a tool result is received */
  onToolCallComplete?: (context: ToolCallCompleteContext) => void;

  // ============ Suggestions ============

  /** Suggestions to show in empty state */
  suggestions?: Suggestion[];

  /**
   * Whether to auto-submit when a suggestion is clicked.
   * @default true
   */
  submitOnSuggestionClick?: boolean;

  /**
   * Hide assistant messages that follow a rendered tool call UI.
   * @default false
   */
  hideMessagesAfterToolUI?: boolean;

  // ============ History / Persistence ============

  /** Runtime ID for conversation persistence */
  runtimeId?: string;

  /** Endpoint URL for fetching conversation history */
  historyEndpoint?: string;

  /** Auth token for the agent runtime */
  authToken?: string;

  /** Auth token specifically for the history endpoint */
  historyAuthToken?: string;

  /**
   * A prompt to send after conversation history is loaded (sent once).
   */
  pendingPrompt?: string;

  // ============ Information ============

  /**
   * Show the information icon in the header.
   * @default false
   */
  showInformation?: boolean;

  /** Callback when the information icon is clicked */
  onInformationClick?: () => void;

  // ============ View Mode ============

  /** Current chat view mode for header segmented toggle */
  chatViewMode?: ChatViewMode;

  /** Callback when user switches chat view mode */
  onChatViewModeChange?: (mode: ChatViewMode) => void;

  // ============ External Data ============

  /** External context snapshot data for the token usage bar */
  contextSnapshot?: import('./context').ContextSnapshotData;

  /** External MCP toolsets status data */
  mcpStatusData?: import('./mcp').McpToolsetsStatusResponse | null;

  // ============ Header Content ============

  /** Custom header content (rendered below title row) */
  headerContent?: ReactNode;

  /** Custom header actions (rendered in title row, right side) */
  headerActions?: ReactNode;

  // ============ Misc ============

  /** Auto-focus the input on mount */
  autoFocus?: boolean;

  /** Callback for state updates */
  onStateUpdate?: (state: unknown) => void;

  /**
   * Additional ChatBase props (escape hatch).
   * Props set here are spread onto ChatBase as overrides.
   */
  panelProps?: Partial<ChatBaseProps>;
}

// ---------------------------------------------------------------------------
// ChatBase props
// ---------------------------------------------------------------------------

/**
 * ChatBase props
 */
export interface ChatBaseProps {
  /** Chat title */
  title?: string;

  /** Show header */
  showHeader?: boolean;

  /**
   * Show token usage bar (input/output token counts from the backend).
   * Rendered independently of showHeader, so usage is visible even without a title bar.
   * Requires the protocol to have enableConfigQuery=true and an agentId.
   * @default true
   */
  showTokenUsage?: boolean;

  /**
   * External context snapshot data for the token usage bar.
   * When provided, this overrides the built-in useContextSnapshot hook
   * (which is a no-op since the REST endpoint was removed).
   * Pass live data received from the monitoring WebSocket.
   */
  contextSnapshot?: import('./context').ContextSnapshotData;

  /**
   * External MCP toolsets status data for the MCP indicator.
   * When provided, the data is forwarded to the McpStatusIndicator
   * so it shows live status instead of "No MCP Server defined".
   */
  mcpStatusData?: import('./mcp').McpToolsetsStatusResponse | null;

  /** Show loading indicator */
  showLoadingIndicator?: boolean;

  /** Show error messages */
  showErrors?: boolean;

  /** Show input area */
  showInput?: boolean;

  /** Show model selector (for protocols that support it) */
  showModelSelector?: boolean;

  /** Show tools menu (for protocols that support it) */
  showToolsMenu?: boolean;

  /** Show skills menu (for protocols that support it) */
  showSkillsMenu?: boolean;

  /** Indicate tools are accessed via Codemode meta-tools */
  codemodeEnabled?: boolean;

  /** Initial model ID to select (e.g., 'openai:gpt-4o-mini') */
  initialModel?: string;

  /**
   * Override the list of available models.
   * When provided, this list replaces the models returned by the config endpoint.
   * Use this to restrict the model selector to a specific subset of models.
   */
  availableModels?: ModelConfig[];

  /** MCP servers to enable (others will be disabled) */
  mcpServers?: McpServerSelection[];

  /** Initial skill IDs to enable */
  initialSkills?: string[];

  /** Custom class name */
  className?: string;

  /** Custom loading state */
  loadingState?: React.ReactNode;

  /** Header actions */
  headerActions?: React.ReactNode;

  /**
   * Current chat view mode.
   * When provided, a segmented view-mode toggle is rendered in the header
   * with icons for each mode: floating (popup), floating-small (compact), sidebar (docked).
   */
  chatViewMode?: ChatViewMode;

  /**
   * Callback when the user clicks a different view mode in the header toggle.
   */
  onChatViewModeChange?: (mode: ChatViewMode) => void;

  // ============ Mode Selection ============

  /**
   * Use Zustand store for state management.
   * When true, uses the shared store. When false with protocol, uses protocol mode.
   * @default true
   */
  useStore?: boolean;

  /**
   * Protocol configuration for connecting to backend.
   * When provided and useStore is false, enables protocol mode.
   *
   * Accepts either a full `ProtocolConfig` object or a simple `Protocol` string
   * (e.g. `'vercel-ai'`). When a string is provided, it is used as the protocol
   * type and combined with other props (endpoint, agentRuntimeConfig) to build
   * the full configuration.
   *
   * @default 'vercel-ai'
   */
  protocol?: Protocol | ProtocolConfig;

  /**
   * Simplified agent runtime configuration.
   * A convenience wrapper that creates a ProtocolConfig internally.
   * When provided, will automatically set useStore=false and configure protocol mode.
   *
   * @example
   * ```tsx
   * <ChatBase
   *   agentRuntimeConfig={{
   *     url: 'http://localhost:8765',
   *     agentId: 'my-agent',
   *     authToken: 'my-token',
   *   }}
   * />
   * ```
   */
  agentRuntimeConfig?: AgentRuntimeConfig;

  /**
   * Custom message handler (for props-based mode).
   * When provided, uses custom handler instead of store or protocol.
   * Supports streaming via options callbacks.
   */
  onSendMessage?: MessageHandler;

  /**
   * Enable streaming mode for custom message handler.
   * When true, will provide streaming callbacks to onSendMessage.
   * @default false
   */
  enableStreaming?: boolean;

  // ============ Extended Props for UI Customization ============

  /** Custom brand icon for header */
  brandIcon?: ReactNode;

  /** Avatar configuration */
  avatarConfig?: AvatarConfig;

  /** Header buttons configuration */
  headerButtons?: HeaderButtonsConfig;

  /** Show powered by tag */
  showPoweredBy?: boolean;

  /** Powered by tag props */
  poweredByProps?: Partial<PoweredByTagProps>;

  /** Empty state configuration */
  emptyState?: EmptyStateConfig;

  /** Tool result renderer for tool calls */
  renderToolResult?: RenderToolResult;

  /** Custom footer content (rendered above input) */
  footerContent?: ReactNode;

  /**
   * Show the information icon in the header.
   * When clicked, fires onInformationClick.
   * @default false
   */
  showInformation?: boolean;

  /** Callback when the information icon is clicked */
  onInformationClick?: () => void;

  /** Custom header content (rendered below title row) */
  headerContent?: ReactNode;

  /** Children to render in the messages area (for custom content) */
  children?: ReactNode;

  /** Border radius for the panel container */
  borderRadius?: string | number;

  /** Panel background color */
  backgroundColor?: string;

  /** Border style */
  border?: string;

  /** Box shadow */
  boxShadow?: string;

  /** Compact mode (reduced padding) */
  compact?: boolean;

  /** Input placeholder override */
  placeholder?: string;

  /** Description shown in empty state (protocol mode) */
  description?: string;

  /** Callback for state updates (for shared state) */
  onStateUpdate?: (state: unknown) => void;

  /** Callback when new chat is triggered */
  onNewChat?: () => void;

  /** Callback when messages are cleared */
  onClear?: () => void;

  /** Callback when messages change (for tracking message count) */
  onMessagesChange?: (messages: ChatMessage[]) => void;

  /** Auto-focus the input on mount */
  autoFocus?: boolean;

  /**
   * Suggestions to show in empty state.
   * When clicked, the suggestion message is sent to the chat.
   */
  suggestions?: Suggestion[];

  /**
   * Whether to automatically submit the message when a suggestion is clicked.
   * @default true
   */
  submitOnSuggestionClick?: boolean;

  /**
   * Whether to hide assistant messages that follow a rendered tool call UI.
   * When true, assistant messages after tool UI are hidden to avoid duplicate information.
   * @default false
   */
  hideMessagesAfterToolUI?: boolean;

  /**
   * Trigger to refocus the input field.
   * When this value changes, the input will be focused.
   * Useful for refocusing after view mode changes.
   */
  focusTrigger?: number;

  /**
   * Frontend tools to register with the agent.
   * These tools execute in the browser and their results are sent back to the agent.
   */
  frontendTools?: FrontendToolDefinition[];

  // ============ Identity/Authorization Support ============

  /**
   * Callback when the agent requests authorization for an external service.
   * This is called when a tool needs OAuth access to a service like GitHub.
   *
   * @param provider - The OAuth provider name (e.g., 'github', 'google')
   * @param scopes - The requested OAuth scopes
   * @param context - Additional context about why authorization is needed
   * @returns Promise resolving to the access token, or null if user cancels
   *
   * @example
   * ```tsx
   * <ChatBase
   *   onAuthorizationRequired={async (provider, scopes, context) => {
   *     // Show UI to user to authorize
   *     const token = await showAuthDialog(provider, scopes);
   *     return token;
   *   }}
   * />
   * ```
   */
  onAuthorizationRequired?: (
    provider: string,
    scopes: string[],
    context?: { toolName?: string; reason?: string },
  ) => Promise<string | null>;

  /**
   * Connected identities to pass to agent tools.
   * When provided, access tokens for these identities are automatically
   * included in tool calls that need them.
   *
   * @example
   * ```tsx
   * const { identities, getAccessToken } = useIdentity();
   * <ChatBase connectedIdentities={identities} />
   * ```
   */
  connectedIdentities?: Array<{
    provider: string;
    userId?: string;
    accessToken?: string;
  }>;

  /**
   * Runtime ID for conversation persistence.
   * When provided, messages are fetched from the server API on page reload
   * and prevents message mixing between different agent runtimes.
   */
  runtimeId?: string;

  /**
   * Endpoint URL for fetching conversation history.
   * When runtimeId is provided, this endpoint is called to fetch
   * the conversation history on mount.
   * If not provided, defaults to `{protocol.endpoint}/api/v1/history`.
   */
  historyEndpoint?: string;

  /**
   * Auth token for the history endpoint.
   * If not provided, uses the protocol's authToken.
   */
  historyAuthToken?: string;

  /**
   * A prompt to append and send after the conversation history is loaded.
   * The message is shown in the chat and sent to the agent exactly once.
   */
  pendingPrompt?: string;

  // ============ Tool Invocation Hooks ============

  /**
   * Pre-hook: fires when a tool call starts executing.
   * Called for both backend and frontend tools.
   *
   * @example
   * ```tsx
   * <Chat
   *   onToolCallStart={({ toolName, args }) => {
   *     console.log(`Tool ${toolName} started`, args);
   *   }}
   * />
   * ```
   */
  onToolCallStart?: (context: ToolCallStartContext) => void;

  /**
   * Post-hook: fires when a tool result is received.
   * Called for both backend and frontend tools.
   * Use this to react to specific tool outcomes (e.g. update UI state
   * when a `load_skill` tool completes).
   *
   * @example
   * ```tsx
   * <Chat
   *   onToolCallComplete={({ toolName, result, status }) => {
   *     if (toolName === 'load_skill' && status === 'complete') {
   *       // Update skills sidebar from load_skill result
   *       updateSkillsFromResult(result);
   *     }
   *   }}
   * />
   * ```
   */
  onToolCallComplete?: (context: ToolCallCompleteContext) => void;
}
