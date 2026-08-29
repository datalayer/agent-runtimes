/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Type definitions for the ChatBase component and its sub-components.
 *
 * @module types/chat
 */

import type { ToolbarItem } from '@datalayer/primer-addons';
import type { ComponentType, ReactNode } from 'react';
import type { ICollaborationProvider } from '@datalayer/jupyter-react';
import type { ChatMessage, MessageHandler } from './messages';
import type { Protocol, ProtocolConfig } from './protocol';
import type { McpServerSelection } from './inference';
import type { MCPServerTool } from './mcp';
import type { AgentRuntimeConfig } from './config';
import type { SandboxWsStatus } from './sandbox';
import type { FrontendToolDefinition } from './tools';
import type { PoweredByTagProps } from '../chat/display/PoweredByTag';
import type { EphemeralRuntimeOverride } from '../chat/notebook/EphemeralNotebook';
import type { EphemeralDocumentCollaboration } from '../chat/document/EphemeralDocument';

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

/**
 * Companion "ephemeral surface" shown next to the chat.
 * - 'none': chat only, no companion surface
 * - 'notebook': in-memory Jupyter notebook
 * - 'document': in-memory Lexical rich-text document
 */
export type EphemeralSurfaceMode = 'none' | 'notebook' | 'document';

export type EphemeralNotebookToolbarComponent = ComponentType<any>;

// ---------------------------------------------------------------------------
// Tool call types
// ---------------------------------------------------------------------------

/**
 * Tool call status for tool rendering
 */
export type DisplayToolCallStatus =
  'inProgress' | 'executing' | 'complete' | 'error';

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

  /** Chat subtitle (rendered under the title in the header) */
  subtitle?: string;

  /** Description shown in empty state */
  description?: string;

  /** Show header */
  showHeader?: boolean;

  /** Show input area */
  showInput?: boolean;

  /** Keep input visible but disabled */
  disableInputPrompt?: boolean;

  /**
   * Whether the chat can be used at all.
   *
   * Different from `launching`, which says "not yet": this says "not here".
   * A sandbox with no agent behind it — code running in the browser, or an
   * anonymous Jupyter server — has nothing to chat with, and the honest answer
   * is to show the chat as it will look and say why it is off, rather than
   * hide it and leave the person wondering where it went.
   *
   * The input and the selectors go dead; the header stays readable.
   */
  disabled?: boolean;

  /**
   * Why the chat is off, in the person's terms — "No agent in browser mode".
   *
   * Shown in the header beside the title, because that is where someone looks
   * when a control does not respond. Ignored unless `disabled` is true.
   */
  disableReason?: string;

  /**
   * Whether the underlying agent runtime is still launching. When true, the
   * chat shell is rendered with the input and controls disabled and a spinner
   * overlay is shown, so the plain chat view appears as soon as the agent
   * starts being created and stays interactive-disabled until it is ready.
   */
  launching?: boolean;

  /**
   * Optional message shown next to the spinner while `launching` is true.
   */
  launchingMessage?: ReactNode;

  /**
   * Optional overlay rendered above the chat surface (messages + input).
   * Use this to show a gating UI such as a sign-in form for anonymous users
   * while keeping the chat visible and its controls disabled behind it.
   */
  overlay?: ReactNode;

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

  /**
   * Callback fired when the user toggles codemode from the Tools menu.
   * When omitted, the toggle renders in read-only mode.
   */
  onToggleCodemode?: (enabled: boolean) => void | Promise<void>;

  /** Initial model ID to select (e.g., 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0') */
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

  /**
   * Show an in-memory "ephemeral notebook" next to the chat, toggled from the
   * input footer. The notebook model lives purely in memory (never persisted)
   * and its frontend tools are registered while visible. @default true
   */
  enableEphemeralNotebook?: boolean;

  /**
   * Enable the in-memory "ephemeral document" (Lexical rich-text) companion
   * surface. When enabled it appears as an option in the companion-surface
   * segmented control alongside the notebook. @default false
   */
  enableEphemeralDocument?: boolean;

  /**
   * Initial companion surface shown next to the chat. Defaults to 'notebook'
   * when `enableEphemeralNotebook` is true, otherwise 'none'.
   */
  initialEphemeralSurfaceMode?: EphemeralSurfaceMode;

  /** Controlled callback for companion surface mode changes. */
  onEphemeralSurfaceModeChange?: (mode: EphemeralSurfaceMode) => void;

  /** Initial open state of the ephemeral notebook. @default true */
  initialEphemeralNotebookOpen?: boolean;

  /** Controlled callback for ephemeral notebook open-state changes. */
  onEphemeralNotebookOpenChange?: (open: boolean) => void;

  /** Collapse chat panel while keeping the ephemeral notebook visible. */
  collapsed?: boolean;

  /** Callback to reopen chat panel from collapsed notebook mode. */
  onExpandFromCollapsed?: () => void;

  /**
   * Optional toolbar component used by the ephemeral notebook.
   * Defaults to the toolbar from `@datalayer/jupyter-react` when omitted.
   */
  ephemeralNotebookToolbar?: EphemeralNotebookToolbarComponent;

  /**
   * Items added to the toolbar of the ephemeral notebook, e.g. the status of
   * the sandbox it runs on. Merged with the items of the toolbar and ordered
   * by the `order` of each item.
   */
  ephemeralNotebookToolbarExtraItems?: ToolbarItem[];

  /**
   * Items added to the toolbar of the ephemeral document, the same way as
   * {@link ChatProps.ephemeralNotebookToolbarExtraItems} for the notebook.
   */
  ephemeralDocumentToolbarExtraItems?: ToolbarItem[];

  /**
   * Optional real-time collaboration provider for the ephemeral notebook.
   * When supplied, the notebook joins a shared collaborative room so its state
   * transits over RTC (e.g. between an Agent Node and the SaaS UI) instead of
   * the tunnel. The caller owns the provider lifecycle.
   */
  ephemeralNotebookCollaborationProvider?: ICollaborationProvider;

  /**
   * Explicit collaboration room / document id for the ephemeral notebook. When
   * set it becomes the notebook id directly so multiple peers (e.g. an Agent
   * Node and the SaaS UI) share the same collaborative room and tool scope.
   */
  ephemeralNotebookCollaborationDocumentId?: string;

  /**
   * Optional real-time collaboration configuration for the ephemeral document
   * (Lexical). When supplied the document joins a shared Loro room over
   * WebSocket so its rich-text state transits over RTC (e.g. between an Agent
   * Node and the SaaS UI). Its `roomId` also becomes the document id so all
   * peers share the same collaborative room and lexical tool scope.
   */
  ephemeralDocumentCollaboration?: EphemeralDocumentCollaboration;

  /**
   * Explicit runtime endpoint for the ephemeral notebook kernel. When set, the
   * notebook binds its kernel to this endpoint directly instead of resolving a
   * pod from the user's runtimes list — used to reach an Agent Node's Jupyter
   * server through the runtimes tunnel HTTP/WebSocket proxy.
   */
  ephemeralRuntimeOverride?: EphemeralRuntimeOverride;

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

  /** Optional legacy endpoint URL for fetching conversation history */
  historyEndpoint?: string;

  /** Auth token for the agent runtime */
  authToken?: string;

  /** Optional auth token for the legacy history endpoint */
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

  /** External codemode status data (e.g. from WebSocket stream). */
  codemodeStatusData?: import('./stream').CodemodeStatusData | null;

  /** Optional sandbox status override for immediate UI updates. */
  sandboxStatusData?: SandboxWsStatus | null;

  /** Horizontal placement for the header kernel indicator. @default 'left' */
  kernelIndicatorPlacement?: 'left' | 'center' | 'right';

  /**
   * Live kernel connection of the companion notebook/document sandbox.
   * When provided, it is forwarded to the chat header's `<KernelIndicator>`
   * so the indicator reflects the surface's runtime.
   */
  kernel?:
    import('@jupyterlab/services/lib/kernel/kernel').IKernelConnection | null;

  /**
   * Optional environment name displayed in the chat header's kernel
   * indicator details (e.g. the agent's local sandbox name). Defaults to
   * the indicator's own "browser-runtime" placeholder when omitted.
   */
  kernelEnvironmentName?: string;

  /** Optional CPU info displayed in the chat header's kernel indicator. */
  kernelCpu?: string;

  /** Optional memory info displayed in the chat header's kernel indicator. */
  kernelMemory?: string;

  /** Optional GPU info displayed in the chat header's kernel indicator. */
  kernelGpu?: string;

  /** Optional theme variant override for companion notebook/document surfaces. */
  themeVariant?: string;

  /** Optional color mode override for companion notebook/document surfaces. */
  colorMode?: 'light' | 'dark' | 'auto';

  /**
   * Disable ChatBase's internal JupyterReactTheme wrapper.
   * Use this when the host page already provides a JupyterReactTheme boundary.
   * @default false
   */
  disableInternalJupyterTheme?: boolean;

  // ============ Tool Approval Banner ============

  /**
   * Whether to render the top-of-chat tool approval banner when there are
   * pending approvals. @default true
   */
  showToolApprovalBanner?: boolean;

  /** Pending tool approval requests to render in the top banner. */
  pendingApprovals?: import('../chat/tools').PendingApproval[];

  /** Called when the user approves a pending request. */
  onApproveApproval?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;

  /** Called when the user rejects a pending request. */
  onRejectApproval?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;

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
  /**
   * Hands an imperative send function to the host, once the chat is able to
   * send.
   *
   * `pendingPrompt` deliberately sends a given text only once, which makes it
   * unusable as a live input channel: a user asking the same question twice
   * would be ignored the second time. A host that owns the input box — the LOOP
   * workspace, whose prompt is the shell — needs a channel with no such memory.
   *
   * Called again with `null` when the chat can no longer send.
   */
  onSendReady?: (
    controls: { send: (message: string) => void; stop: () => void } | null,
  ) => void;

  /**
   * Reports whether the chat is streaming a reply, so a host that owns the
   * input box can show the spinner and the stop button where the user is
   * actually looking.
   */
  onLoadingChange?: (isLoading: boolean) => void;

  /** Chat title */
  title?: string;

  /** Chat subtitle (rendered under the title in the header) */
  subtitle?: string;

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

  /**
   * External codemode status data. When provided, it is forwarded to
   * AgentDetails so the info panel can render a live codemode status
   * without waiting for the global WebSocket stream.
   */
  codemodeStatusData?: import('./stream').CodemodeStatusData | null;

  /**
   * External sandbox status data for the sandbox indicator.
   * When provided, this data is preferred over the indicator's local
   * WebSocket state, which allows optimistic variant updates.
   */
  sandboxStatusData?: SandboxWsStatus | null;

  /** Show loading indicator */
  showLoadingIndicator?: boolean;

  /** Show error messages */
  showErrors?: boolean;

  /** Show input area */
  showInput?: boolean;

  /** Keep input visible but disabled */
  disableInputPrompt?: boolean;

  /**
   * Whether the chat can be used at all — see `ChatCommonProps.disabled`.
   *
   * `launching` says "not yet"; this says "not here". A sandbox with no agent
   * behind it has nothing to chat with.
   */
  disabled?: boolean;

  /** Why the chat is off, shown in the header. Ignored unless `disabled`. */
  disableReason?: string;

  /**
   * Whether the underlying agent runtime is still launching. When true, the
   * chat shell renders with input and controls disabled and a spinner overlay.
   */
  launching?: boolean;

  /** Optional message shown next to the spinner while `launching` is true. */
  launchingMessage?: React.ReactNode;

  /**
   * Whether to auto-connect the chat protocol adapter on mount. Defaults to
   * `true`. Set to `false` to render the chat shell (header, disabled input,
   * companion notebook/document, launching overlay) without opening a protocol
   * connection — e.g. while the agent runtime endpoint is still being created.
   */
  autoConnect?: boolean;

  /**
   * Optional overlay rendered above the chat surface (messages + input).
   * Use this to show a gating UI such as a sign-in form for anonymous users
   * while keeping the chat visible and its controls disabled behind it.
   */
  overlay?: React.ReactNode;

  /** Show model selector (for protocols that support it) */
  showModelSelector?: boolean;

  /** Show tools menu (for protocols that support it) */
  showToolsMenu?: boolean;

  /** Show skills menu (for protocols that support it) */
  showSkillsMenu?: boolean;

  /** Indicate tools are accessed via Codemode meta-tools */
  codemodeEnabled?: boolean;

  /**
   * Callback fired when the user toggles codemode from the Tools menu.
   * When omitted, the toggle renders in read-only mode.
   */
  onToggleCodemode?: (enabled: boolean) => void | Promise<void>;

  /** Initial model ID to select (e.g., 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0') */
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

  /** Notebook kernel indicator state override for the chat header. */
  kernelIndicatorState?: import('@datalayer/jupyter-react').ExecutionState;

  /** Horizontal placement for the header kernel indicator. @default 'left' */
  kernelIndicatorPlacement?: 'left' | 'center' | 'right';

  /**
   * Live notebook kernel connection. When provided, the chat header
   * renders the same `<KernelIndicator>` as the notebook toolbar so
   * the colour and tooltip remain in sync with the notebook runtime.
   */
  kernel?:
    import('@jupyterlab/services/lib/kernel/kernel').IKernelConnection | null;

  /**
   * Disable ChatBase's internal JupyterReactTheme wrapper.
   * Use this when the host page already provides a JupyterReactTheme boundary.
   * @default false
   */
  disableInternalJupyterTheme?: boolean;

  /** Optional environment name displayed in kernel indicator details. */
  kernelEnvironmentName?: string;

  /** Optional CPU info displayed in kernel indicator details. */
  kernelCpu?: string;

  /** Optional memory info displayed in kernel indicator details. */
  kernelMemory?: string;

  /** Optional GPU info displayed in kernel indicator details. */
  kernelGpu?: string;

  /** Optional theme variant override for companion notebook/document surfaces. */
  themeVariant?: string;

  /** Optional color mode override for companion notebook/document surfaces. */
  colorMode?: 'light' | 'dark' | 'auto';

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

  // ============ Ephemeral Notebook ============

  /**
   * Enable the "Ephemeral Notebook" feature. When true, a toggle is rendered in
   * the input footer that shows/hides an in-memory notebook next to the chat.
   * The notebook model lives purely in memory (never persisted) and is backed
   * by a sandbox kernel. While visible, its frontend tools are registered so
   * the agent can drive the notebook cells. @default true
   */
  enableEphemeralNotebook?: boolean;

  /**
   * Enable the in-memory "ephemeral document" (Lexical rich-text) companion
   * surface. When enabled it appears as an option in the companion-surface
   * segmented control alongside the notebook. @default false
   */
  enableEphemeralDocument?: boolean;

  /**
   * Initial companion surface shown next to the chat. Defaults to 'notebook'
   * when `enableEphemeralNotebook` is true, otherwise 'none'.
   */
  initialEphemeralSurfaceMode?: EphemeralSurfaceMode;

  /** Controlled callback for companion surface mode changes. */
  onEphemeralSurfaceModeChange?: (mode: EphemeralSurfaceMode) => void;

  /**
   * Initial open state of the ephemeral notebook toggle. Only relevant when
   * `enableEphemeralNotebook` is true. @default true
   */
  initialEphemeralNotebookOpen?: boolean;

  /** Controlled callback for ephemeral notebook open-state changes. */
  onEphemeralNotebookOpenChange?: (open: boolean) => void;

  /** Collapse chat panel while keeping the ephemeral notebook visible. */
  collapsed?: boolean;

  /** Callback to reopen chat panel from collapsed notebook mode. */
  onExpandFromCollapsed?: () => void;

  /**
   * Optional toolbar component used by the ephemeral notebook.
   * Defaults to the toolbar from `@datalayer/jupyter-react` when omitted.
   */
  ephemeralNotebookToolbar?: EphemeralNotebookToolbarComponent;

  /**
   * Items added to the toolbar of the ephemeral notebook, e.g. the status of
   * the sandbox it runs on. Merged with the items of the toolbar and ordered
   * by the `order` of each item.
   */
  ephemeralNotebookToolbarExtraItems?: ToolbarItem[];

  /**
   * Items added to the toolbar of the ephemeral document, the same way as
   * {@link ChatProps.ephemeralNotebookToolbarExtraItems} for the notebook.
   */
  ephemeralDocumentToolbarExtraItems?: ToolbarItem[];

  /**
   * Optional real-time collaboration provider for the ephemeral notebook.
   * When supplied, the notebook joins a shared collaborative room so its state
   * transits over RTC (e.g. between an Agent Node and the SaaS UI) instead of
   * the tunnel. The caller owns the provider lifecycle.
   */
  ephemeralNotebookCollaborationProvider?: ICollaborationProvider;

  /**
   * Explicit collaboration room / document id for the ephemeral notebook. When
   * set it becomes the notebook id directly so multiple peers (e.g. an Agent
   * Node and the SaaS UI) share the same collaborative room and tool scope.
   */
  ephemeralNotebookCollaborationDocumentId?: string;

  /**
   * Optional real-time collaboration configuration for the ephemeral document
   * (Lexical). When supplied the document joins a shared Loro room over
   * WebSocket so its rich-text state transits over RTC (e.g. between an Agent
   * Node and the SaaS UI). Its `roomId` also becomes the document id so all
   * peers share the same collaborative room and lexical tool scope.
   */
  ephemeralDocumentCollaboration?: EphemeralDocumentCollaboration;

  /**
   * Explicit runtime endpoint for the ephemeral notebook kernel. When set, the
   * notebook binds its kernel to this endpoint directly instead of resolving a
   * pod from the user's runtimes list — used to reach an Agent Node's Jupyter
   * server through the runtimes tunnel HTTP/WebSocket proxy.
   */
  ephemeralRuntimeOverride?: EphemeralRuntimeOverride;

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
   * When provided, messages are restored from websocket snapshot data on
   * reload and prevents message mixing between different agent runtimes.
   */
  runtimeId?: string;

  /**
   * Optional legacy endpoint URL for history backfill.
   * History loading is websocket-first; this field is kept for
   * compatibility with custom integrations.
   */
  historyEndpoint?: string;

  /**
   * Optional auth token for the legacy history endpoint.
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

  // ============ Tool Approval Banner ============

  /**
   * Whether to render the top-of-chat tool approval banner (and its review
   * dialog) when `pendingApprovals` is non-empty. The banner/dialog render
   * only when approvals are actually pending; this flag lets integrators opt
   * out entirely.
   * @default true
   */
  showToolApprovalBanner?: boolean;

  /**
   * Pending tool approval requests to render in the built-in banner.
   * Typically sourced from the approvals websocket in the hosting app.
   */
  pendingApprovals?: import('../chat/tools').PendingApproval[];

  /**
   * Called when the user approves a pending request (from banner "Approve All"
   * or from the review dialog).
   */
  onApproveApproval?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;

  /**
   * Called when the user rejects a pending request from the review dialog.
   */
  onRejectApproval?: (
    approvalId: string,
    note?: string,
  ) => void | Promise<boolean | void>;
}
