/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Main ChatBase component.
 * Provides a full chat interface with messages and input.
 * This is the base component used by all other chat container components.
 *
 * Supports multiple modes:
 * 1. Store mode: Uses Zustand store for state management (default)
 * 2. Protocol mode: Connects to backend via AG-UI, A2A, ACP, or Vercel AI protocols
 * 3. Custom mode: Uses onSendMessage prop for custom message handling
 *
 * @module components/chat/components/ChatBase
 */

import { useContext } from 'react';
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Heading,
  Text,
  Spinner,
  IconButton,
  Textarea,
  Button,
  ActionMenu,
  ActionList,
  LabelGroup,
  Label,
  ToggleSwitch,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  AlertIcon,
  PlusIcon,
  TrashIcon,
  GearIcon,
  PersonIcon,
  PaperAirplaneIcon,
  SquareCircleIcon,
  ToolsIcon,
  AiModelIcon,
  BriefcaseIcon,
  CircleIcon,
  SquareFillIcon,
} from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
  QueryClientContext,
} from '@tanstack/react-query';
import { Streamdown } from 'streamdown';
import { PoweredByTag, type PoweredByTagProps } from '../elements/PoweredByTag';
import { requestAPI } from '../../handler';
import { useChatStore } from '../../store/chatStore';
import { useConversationStore } from '../../store/conversationStore';
import type { ChatMessage, ContentPart } from '../../types/message';
import {
  generateMessageId,
  createUserMessage,
  createAssistantMessage,
} from '../../types/message';
import type {
  TransportType,
  ProtocolAdapterConfig,
  ProtocolEvent,
} from '../../types/protocol';
import type { McpServerSelection } from '../../types/inference';
import {
  AGUIAdapter,
  A2AAdapter,
  VercelAIAdapter,
  ACPAdapter,
  type BaseProtocolAdapter,
} from '../../protocols';
import type { FrontendToolDefinition } from '../../types/tool';
import { ToolCallDisplay } from '../display/ToolCallDisplay';
import type { BuiltinTool as BuiltinToolType } from '../../../../types';
import type { MCPServerConfig as MCPServerConfigType } from '../../../AgentConfiguration';

// Singleton QueryClient for ChatBase instances without external QueryClientProvider
const internalQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Primer's default portal root ID
const PRIMER_PORTAL_ROOT_ID = '__primerPortalRoot__';

/**
 * Hook to ensure Primer's default portal root has a high z-index.
 * This ensures dropdown menus appear above floating chat panels.
 */
function useHighZIndexPortal() {
  useEffect(() => {
    // Set up a MutationObserver to watch for the portal root being added
    const setPortalZIndex = () => {
      const portalRoot = document.getElementById(PRIMER_PORTAL_ROOT_ID);
      if (portalRoot) {
        portalRoot.style.zIndex = '9999';
        return true;
      }
      return false;
    };

    // Try immediately
    if (setPortalZIndex()) {
      return;
    }

    // If not found yet, observe for it
    const observer = new MutationObserver(() => {
      if (setPortalZIndex()) {
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);
}

/**
 * Tool call status for tool rendering
 */
export type ToolCallStatus = 'inProgress' | 'executing' | 'complete' | 'error';

/**
 * Response callback type for human-in-the-loop interactions
 */
export type RespondCallback = (result: unknown) => void;

/**
 * Suggestion item for quick actions
 */
export interface Suggestion {
  /** Display title for the suggestion */
  title: string;
  /** Message to send when clicked */
  message: string;
}

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
  status: ToolCallStatus;
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
interface ToolCallMessage {
  id: string;
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
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
type DisplayItem = ChatMessage | ToolCallMessage;

/**
 * Check if an item is a tool call message
 */
function isToolCallMessage(item: DisplayItem): item is ToolCallMessage {
  return 'type' in item && item.type === 'tool-call';
}

/**
 * Extract text content from a ChatMessage
 */
function getMessageText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  // Array of ContentPart - extract text parts
  return (message.content as ContentPart[])
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map(part => part.text)
    .join('');
}

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

/**
 * Streaming options for custom message handler.
 * Enables streaming response support with chunk callbacks.
 */
export interface StreamingMessageOptions {
  /** Callback for each chunk of streamed content */
  onChunk?: (chunk: string) => void;
  /** Callback when streaming is complete */
  onComplete?: (fullResponse: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Custom message handler type for props-based mode.
 * Supports both simple and streaming response patterns.
 */
export type MessageHandler = (
  message: string,
  messages: ChatMessage[],
  options?: StreamingMessageOptions,
) => Promise<string | void>;

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
 * Builtin tool configuration (re-exported from types.ts)
 */
export type BuiltinTool = BuiltinToolType;

/**
 * MCP Server Tool configuration
 */
export interface MCPServerTool {
  name: string;
  description: string;
  enabled: boolean;
  inputSchema?: Record<string, unknown>;
}

/**
 * MCP Server configuration from backend
 */
/**
 * MCP Server configuration (re-exported from AgentConfiguration)
 */
export type MCPServerConfig = MCPServerConfigType;

/**
 * Remote configuration from server
 */
export interface RemoteConfig {
  models: ModelConfig[];
  builtinTools: BuiltinTool[];
  mcpServers?: MCPServerConfig[];
}

/**
 * Protocol configuration for ChatBase
 */
export interface ProtocolConfig {
  /** Protocol/transport type */
  type: TransportType;
  /** Endpoint URL */
  endpoint: string;
  /** Authentication token */
  authToken?: string;
  /** Agent ID */
  agentId?: string;
  /** Enable config query for models and tools */
  enableConfigQuery?: boolean;
  /** Config endpoint URL for non-Jupyter protocols (if not set, uses Jupyter requestAPI) */
  configEndpoint?: string;
  /** Additional protocol options */
  options?: Record<string, unknown>;
}

/**
 * Simplified configuration for connecting to an agent runtime server.
 * This is a convenience wrapper over the more detailed ProtocolConfig.
 */
export interface AgentRuntimeConfig {
  /** URL of the agent runtime server (e.g., 'http://localhost:8765') */
  url: string;
  /** Optional agent ID to connect to */
  agentId?: string;
  /** Optional authentication token */
  authToken?: string;
  /** Protocol type to use (defaults to 'ag-ui') */
  protocol?: TransportType;
}

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
   */
  protocol?: ProtocolConfig;

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
   * and prevents message mixing between different agent spaces.
   */
  runtimeId?: string;

  /**
   * Endpoint URL for fetching conversation history.
   * When runtimeId is provided, this endpoint is called to fetch
   * the conversation history on mount.
   * If not provided, defaults to `{protocol.endpoint}/history`.
   */
  historyEndpoint?: string;

  /**
   * Auth token for the history endpoint.
   * If not provided, uses the protocol's authToken.
   */
  historyAuthToken?: string;
}

/**
 * Create protocol adapter based on configuration
 */
function createProtocolAdapter(
  config: ProtocolConfig,
): BaseProtocolAdapter | null {
  const adapterConfig: ProtocolAdapterConfig = {
    type: config.type,
    baseUrl: config.endpoint,
    authToken: config.authToken,
    agentId: config.agentId,
    ...config.options,
  };

  switch (config.type) {
    case 'ag-ui':
      return new AGUIAdapter(adapterConfig);
    case 'a2a':
      return new A2AAdapter(adapterConfig);
    case 'vercel-ai':
      return new VercelAIAdapter(adapterConfig);
    case 'acp':
      return new ACPAdapter(adapterConfig);
    default:
      console.warn(`[ChatBase] Unknown protocol type: ${config.type}`);
      return null;
  }
}

/**
 * Skill information from backend
 */
interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  has_scripts?: boolean;
  has_resources?: boolean;
}

/**
 * Skills response from backend
 */
interface SkillsResponse {
  skills: SkillInfo[];
  total: number;
  skills_path?: string;
}

/**
 * Hook to safely use query when QueryClient is available
 * Returns null if no QueryClientProvider is present
 */
function useConfigQuery(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  // If no QueryClient is available, return a mock result
  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryFn: async () => {
      // If configEndpoint is provided, use direct fetch (for FastAPI)
      if (configEndpoint) {
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        const response = await fetch(configEndpoint, { headers });
        if (!response.ok) {
          throw new Error(`Config fetch failed: ${response.statusText}`);
        }
        return response.json() as Promise<RemoteConfig>;
      }
      // Otherwise use Jupyter requestAPI
      return requestAPI<RemoteConfig>('configure');
    },
    queryKey: ['models', configEndpoint || 'jupyter'],
    enabled,
    retry: 1,
  });
}

/**
 * Hook to fetch available skills from backend
 */
function useSkillsQuery(
  enabled: boolean,
  baseEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  // If no QueryClient is available, return a mock result
  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({ data: undefined }),
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryFn: async () => {
      if (!baseEndpoint) {
        return { skills: [], total: 0 };
      }
      // Derive skills endpoint from config endpoint
      const skillsEndpoint = baseEndpoint.replace('/configure', '/skills');
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(skillsEndpoint, { headers });
      if (!response.ok) {
        throw new Error(`Skills fetch failed: ${response.statusText}`);
      }
      return response.json() as Promise<SkillsResponse>;
    },
    queryKey: ['skills', baseEndpoint || 'jupyter'],
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

/**
 * Response from the context-snapshot API.
 * Contains cumulative token usage tracked by the agent server.
 */
interface ContextSnapshotData {
  totalTokens: number;
  contextWindow: number;
  sumResponseInputTokens: number;
  sumResponseOutputTokens: number;
  systemPromptTokens: number;
  userMessageTokens: number;
  assistantMessageTokens: number;
  toolTokens: number;
  turnUsage?: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolCalls: number;
    toolNames: string[];
    durationSeconds: number;
  } | null;
  sessionUsage?: {
    inputTokens: number;
    outputTokens: number;
    requests: number;
    toolCalls: number;
    turns: number;
    durationSeconds: number;
  } | null;
  error?: string;
}

/**
 * Format token count for compact display
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

/**
 * Derive the API base URL from a configEndpoint.
 * configEndpoint may look like:
 *   "http://host:port/api/v1/config"     (from agentRuntimeConfig)
 *   "http://host:port/api/v1/configure"   (from Chat component)
 * We strip the trailing path segment to get "http://host:port/api/v1".
 */
function getApiBaseFromConfig(configEndpoint: string): string {
  return configEndpoint.replace(/\/(config|configure)\/?$/, '');
}

/**
 * Hook to poll agent context-snapshot from the backend.
 * Returns cumulative token usage (input/output breakdown) tracked by the agent server.
 * Uses the same endpoint as codeai: GET /api/v1/configure/agents/{agentId}/context-snapshot
 */
function useContextSnapshotQuery(
  enabled: boolean,
  configEndpoint?: string,
  agentId?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  if (!queryClient) {
    return { data: undefined, isLoading: false, isError: false, error: null };
  }

  const snapshotUrl =
    configEndpoint && agentId
      ? `${getApiBaseFromConfig(configEndpoint)}/configure/agents/${encodeURIComponent(agentId)}/context-snapshot`
      : undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = useQuery<ContextSnapshotData>({
    queryKey: ['context-snapshot-header', agentId, snapshotUrl],
    queryFn: async () => {
      if (!snapshotUrl) {
        throw new Error('No context-snapshot URL available');
      }
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(snapshotUrl, { headers });
      if (!response.ok) {
        throw new Error(
          `Context snapshot fetch failed: ${response.statusText}`,
        );
      }
      return response.json();
    },
    enabled: enabled && !!snapshotUrl,
    // Poll every 10 seconds, but stop polling once the query has errored (e.g. runtime terminated)
    refetchInterval: query => (query.state.status === 'error' ? false : 10_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });

  return result;
}

/**
 * Sandbox status from the backend
 */
interface SandboxStatusData {
  available: boolean;
  sandbox_running?: boolean;
  is_executing?: boolean;
  variant?: string;
}

/**
 * Hook to poll sandbox execution status from the backend.
 * Returns whether a sandbox is available and if code is currently executing.
 */
function useSandboxStatusQuery(
  enabled: boolean,
  configEndpoint?: string,
  authToken?: string,
) {
  const queryClient = useContext(QueryClientContext);

  if (!queryClient) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: () => Promise.resolve({} as any),
    };
  }

  const statusUrl = configEndpoint
    ? `${getApiBaseFromConfig(configEndpoint)}/configure/sandbox-status`
    : undefined;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const result = useQuery<SandboxStatusData>({
    queryKey: ['sandbox-status', statusUrl],
    queryFn: async () => {
      if (!statusUrl) {
        throw new Error('No sandbox status URL available');
      }
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(statusUrl, { headers });
      if (!response.ok) {
        throw new Error(`Sandbox status fetch failed: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: enabled && !!statusUrl,
    refetchInterval: query => (query.state.status === 'error' ? false : 2_000),
    refetchOnMount: 'always',
    staleTime: 0,
    retry: 1,
  });

  return result;
}

/**
 * ChatBase component - Universal chat panel supporting store, protocol, and custom modes
 */
export function ChatBase({
  title,
  showHeader = false,
  showTokenUsage = true,
  showLoadingIndicator = true,
  showErrors = true,
  showInput = true,
  showModelSelector = false,
  showToolsMenu = false,
  showSkillsMenu = false,
  codemodeEnabled = false,
  initialModel,
  availableModels,
  mcpServers,
  initialSkills,
  className,
  loadingState,
  headerActions,
  // Mode selection
  useStore: useStoreMode = true,
  protocol: protocolProp,
  agentRuntimeConfig,
  onSendMessage,
  enableStreaming = false,
  // Extended props
  brandIcon,
  avatarConfig,
  headerButtons,
  showPoweredBy = false,
  poweredByProps,
  emptyState,
  renderToolResult,
  footerContent,
  headerContent,
  children,
  borderRadius,
  backgroundColor,
  border,
  boxShadow,
  compact = false,
  placeholder,
  description = 'Start a conversation with the AI agent.',
  onStateUpdate,
  onNewChat,
  onClear,
  onMessagesChange,
  autoFocus = false,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  focusTrigger,
  frontendTools,
  // Identity/Authorization props
  onAuthorizationRequired,
  connectedIdentities,
  // Conversation persistence
  runtimeId,
  historyEndpoint,
  historyAuthToken,
}: ChatBaseProps) {
  // Convert agentRuntimeConfig to protocol if provided
  const protocol: ProtocolConfig | undefined = agentRuntimeConfig
    ? {
        type: agentRuntimeConfig.protocol || 'ag-ui',
        endpoint: agentRuntimeConfig.url,
        authToken: agentRuntimeConfig.authToken,
        agentId: agentRuntimeConfig.agentId,
        enableConfigQuery: true,
        configEndpoint: `${agentRuntimeConfig.url}/api/v1/config`,
      }
    : protocolProp;

  // If agentRuntimeConfig is provided, force protocol mode
  const effectiveUseStoreMode = agentRuntimeConfig ? false : useStoreMode;

  // Check if QueryClientProvider is already available
  const existingQueryClient = useContext(QueryClientContext);

  // If no QueryClient is available, wrap with our internal provider
  if (!existingQueryClient) {
    return (
      <QueryClientProvider client={internalQueryClient}>
        <ChatBaseInner
          title={title}
          showHeader={showHeader}
          showTokenUsage={showTokenUsage}
          showLoadingIndicator={showLoadingIndicator}
          showErrors={showErrors}
          showInput={showInput}
          showModelSelector={showModelSelector}
          showToolsMenu={showToolsMenu}
          showSkillsMenu={showSkillsMenu}
          codemodeEnabled={codemodeEnabled}
          initialModel={initialModel}
          availableModels={availableModels}
          mcpServers={mcpServers}
          initialSkills={initialSkills}
          className={className}
          loadingState={loadingState}
          headerActions={headerActions}
          useStore={effectiveUseStoreMode}
          protocol={protocol}
          onSendMessage={onSendMessage}
          enableStreaming={enableStreaming}
          brandIcon={brandIcon}
          avatarConfig={avatarConfig}
          headerButtons={headerButtons}
          showPoweredBy={showPoweredBy}
          poweredByProps={poweredByProps}
          emptyState={emptyState}
          renderToolResult={renderToolResult}
          footerContent={footerContent}
          headerContent={headerContent}
          children={children}
          borderRadius={borderRadius}
          backgroundColor={backgroundColor}
          border={border}
          boxShadow={boxShadow}
          compact={compact}
          placeholder={placeholder}
          description={description}
          onStateUpdate={onStateUpdate}
          onNewChat={onNewChat}
          onClear={onClear}
          onMessagesChange={onMessagesChange}
          autoFocus={autoFocus}
          suggestions={suggestions}
          submitOnSuggestionClick={submitOnSuggestionClick}
          hideMessagesAfterToolUI={hideMessagesAfterToolUI}
          focusTrigger={focusTrigger}
          frontendTools={frontendTools}
          onAuthorizationRequired={onAuthorizationRequired}
          connectedIdentities={connectedIdentities}
          runtimeId={runtimeId}
          historyEndpoint={historyEndpoint}
          historyAuthToken={historyAuthToken}
        />
      </QueryClientProvider>
    );
  }

  // QueryClient already available, render inner component directly
  return (
    <ChatBaseInner
      title={title}
      showHeader={showHeader}
      showTokenUsage={showTokenUsage}
      showLoadingIndicator={showLoadingIndicator}
      showErrors={showErrors}
      showInput={showInput}
      showModelSelector={showModelSelector}
      showToolsMenu={showToolsMenu}
      showSkillsMenu={showSkillsMenu}
      codemodeEnabled={codemodeEnabled}
      initialModel={initialModel}
      availableModels={availableModels}
      mcpServers={mcpServers}
      initialSkills={initialSkills}
      className={className}
      loadingState={loadingState}
      headerActions={headerActions}
      useStore={effectiveUseStoreMode}
      protocol={protocol}
      onSendMessage={onSendMessage}
      enableStreaming={enableStreaming}
      brandIcon={brandIcon}
      avatarConfig={avatarConfig}
      headerButtons={headerButtons}
      showPoweredBy={showPoweredBy}
      poweredByProps={poweredByProps}
      emptyState={emptyState}
      renderToolResult={renderToolResult}
      footerContent={footerContent}
      headerContent={headerContent}
      children={children}
      borderRadius={borderRadius}
      backgroundColor={backgroundColor}
      border={border}
      boxShadow={boxShadow}
      compact={compact}
      placeholder={placeholder}
      description={description}
      onStateUpdate={onStateUpdate}
      onNewChat={onNewChat}
      onClear={onClear}
      onMessagesChange={onMessagesChange}
      autoFocus={autoFocus}
      suggestions={suggestions}
      submitOnSuggestionClick={submitOnSuggestionClick}
      hideMessagesAfterToolUI={hideMessagesAfterToolUI}
      focusTrigger={focusTrigger}
      frontendTools={frontendTools}
      onAuthorizationRequired={onAuthorizationRequired}
      connectedIdentities={connectedIdentities}
      runtimeId={runtimeId}
      historyEndpoint={historyEndpoint}
      historyAuthToken={historyAuthToken}
    />
  );
}

/**
 * Inner ChatBase component - contains all the actual logic
 */
function ChatBaseInner({
  title,
  showHeader = false,
  showTokenUsage = true,
  showLoadingIndicator = true,
  showErrors = true,
  showInput = true,
  showModelSelector = false,
  showToolsMenu = false,
  showSkillsMenu = false,
  codemodeEnabled = false,
  initialModel,
  availableModels,
  mcpServers,
  initialSkills,
  className,
  loadingState,
  headerActions,
  // Mode selection
  useStore: useStoreMode = true,
  protocol,
  onSendMessage,
  enableStreaming = false,
  // Extended props
  brandIcon,
  avatarConfig,
  headerButtons,
  showPoweredBy = false,
  poweredByProps,
  emptyState,
  renderToolResult,
  footerContent,
  headerContent,
  children,
  borderRadius,
  backgroundColor,
  border,
  boxShadow,
  compact = false,
  placeholder,
  description = 'Start a conversation with the AI agent.',
  onStateUpdate,
  onNewChat,
  onClear,
  onMessagesChange,
  autoFocus = false,
  suggestions,
  submitOnSuggestionClick = true,
  hideMessagesAfterToolUI = false,
  focusTrigger,
  frontendTools,
  // Identity/Authorization props
  onAuthorizationRequired,
  connectedIdentities,
  // Conversation persistence
  runtimeId,
  historyEndpoint,
  historyAuthToken,
}: ChatBaseProps) {
  // Ensure Primer's default portal has high z-index for ActionMenu overlays
  useHighZIndexPortal();

  // Store (optional for message persistence)
  const clearStoreMessages = useChatStore(state => state.clearMessages);

  // Check if protocol is A2A (doesn't support per-request model override)
  const isA2AProtocol = protocol?.type === 'a2a';

  // Component state
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [input, setInput] = useState('');

  // Model and tools state
  const [selectedModel, setSelectedModel] = useState<string>('');
  // enabledTools tracks which MCP server tools are enabled
  // Format: Map<serverId, Set<toolName>>
  const [enabledMcpTools, setEnabledMcpTools] = useState<
    Map<string, Set<string>>
  >(new Map());
  // Note: legacy _enabledTools for backend-defined tools from config query
  // Frontend tools are passed via frontendTools prop
  const [_enabledTools, setEnabledTools] = useState<string[]>([]);
  // Skills state - tracks which skills are enabled
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());

  // Config query (for protocols that support it)
  // Safely handles missing QueryClientProvider
  const configQuery = useConfigQuery(
    Boolean(protocol?.enableConfigQuery),
    protocol?.configEndpoint,
    protocol?.authToken,
  );

  // Skills query (for protocols that support it)
  const skillsQuery = useSkillsQuery(
    Boolean(protocol?.enableConfigQuery) && showSkillsMenu,
    protocol?.configEndpoint,
    protocol?.authToken,
  );

  // Context snapshot query — polls agent-level cumulative token usage (input/output breakdown)
  // Gated by showTokenUsage (not showHeader), so usage is visible even without a title bar.
  const contextSnapshotQuery = useContextSnapshotQuery(
    Boolean(protocol?.enableConfigQuery) && showTokenUsage,
    protocol?.configEndpoint,
    protocol?.agentId,
    protocol?.authToken,
  );
  const agentUsage = contextSnapshotQuery.data;

  // Sandbox status query — polls sandbox execution state for the header indicator.
  // Only active when codemode is enabled and there's a config endpoint.
  const sandboxStatusQuery = useSandboxStatusQuery(
    Boolean(protocol?.enableConfigQuery) && codemodeEnabled && showHeader,
    protocol?.configEndpoint,
    protocol?.authToken,
  );
  const sandboxStatus = sandboxStatusQuery.data;

  // Refs
  const adapterRef = useRef<BaseProtocolAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const toolCallsRef = useRef<Map<string, ToolCallMessage>>(new Map());
  const currentAssistantMessageRef = useRef<ChatMessage | null>(null);
  const threadIdRef = useRef<string>(generateMessageId());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Use a ref for connectedIdentities to avoid infinite loops in useCallback
  // (the array reference changes on every render even if contents are the same)
  const connectedIdentitiesRef = useRef(connectedIdentities);
  connectedIdentitiesRef.current = connectedIdentities;

  const isServerSelected = useCallback(
    (server: { id: string; isConfig?: boolean }) => {
      if (!mcpServers) return true;
      const origin = server.isConfig === false ? 'catalog' : 'config';
      return mcpServers.some(s => s.id === server.id && s.origin === origin);
    },
    [mcpServers],
  );

  // Auto-focus input on mount
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Small delay to ensure the component is fully rendered
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [autoFocus]);

  // Refocus input when focusTrigger changes
  useEffect(() => {
    if (focusTrigger !== undefined && focusTrigger > 0 && inputRef.current) {
      // Small delay to ensure any layout changes have completed
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [focusTrigger]);

  // Track previous loading state to detect when loading completes
  const wasLoadingRef = useRef(false);

  // Refocus input when loading completes
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && inputRef.current) {
      // Small delay to ensure the input is fully enabled
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timeoutId);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      // Reset height to auto to get proper scrollHeight
      textarea.style.height = 'auto';
      // Set height to scrollHeight, capped at maxHeight (120px)
      const maxHeight = 120;
      const minHeight = 40;
      const newHeight = Math.min(
        Math.max(textarea.scrollHeight, minHeight),
        maxHeight,
      );
      textarea.style.height = `${newHeight}px`;
      // Add overflow if content exceeds maxHeight
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, []);

  // Adjust textarea height when input changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Ensure textarea has a minimum height on mount
  useEffect(() => {
    const timer = setTimeout(adjustTextareaHeight, 0);
    return () => clearTimeout(timer);
  }, [adjustTextareaHeight]);

  // Initialize model and tools when config is available
  useEffect(() => {
    if ((configQuery.data || availableModels) && !selectedModel) {
      // Use availableModels override if provided, otherwise use config models
      const modelsList = availableModels || configQuery.data?.models || [];
      // Use initialModel if provided, otherwise select first available model
      if (initialModel) {
        // Check if the initial model exists in the models list
        const modelExists = modelsList.some(m => m.id === initialModel);
        if (modelExists) {
          setSelectedModel(initialModel);
        } else {
          // Fallback to first available model if initialModel not found
          const firstAvailableModel = modelsList.find(
            m => m.isAvailable !== false,
          );
          const firstModel = firstAvailableModel || modelsList[0];
          if (firstModel) {
            setSelectedModel(firstModel.id);
          }
        }
      } else {
        // No initialModel provided, select first available model
        const firstAvailableModel = modelsList.find(
          m => m.isAvailable !== false,
        );
        const firstModel = firstAvailableModel || modelsList[0];
        if (firstModel) {
          setSelectedModel(firstModel.id);
        }
      }

      const allToolIds =
        configQuery.data?.builtinTools?.map(tool => tool.id) || [];
      setEnabledTools(allToolIds);

      // Initialize MCP server tools
      if (configQuery.data?.mcpServers) {
        const newEnabledMcpTools = new Map<string, Set<string>>();
        for (const server of configQuery.data.mcpServers) {
          if (server.isAvailable && server.enabled) {
            // If mcpServers is provided, only enable those servers
            // If not provided, enable all available servers
            const shouldEnableServer = isServerSelected(server);

            if (shouldEnableServer) {
              const enabledToolNames = new Set(
                server.tools.filter(t => t.enabled).map(t => t.name),
              );
              newEnabledMcpTools.set(server.id, enabledToolNames);
            }
          }
        }
        setEnabledMcpTools(newEnabledMcpTools);
      }
    }
  }, [
    configQuery.data,
    selectedModel,
    initialModel,
    availableModels,
    mcpServers,
    isServerSelected,
  ]);

  // Update enabled MCP servers when mcpServers prop changes (e.g., server removed)
  useEffect(() => {
    if (!configQuery.data?.mcpServers || !mcpServers) return;

    setEnabledMcpTools(prev => {
      const newMap = new Map<string, Set<string>>();

      // Only keep servers that are in mcpServers
      for (const server of configQuery.data?.mcpServers ?? []) {
        if (isServerSelected(server) && prev.has(server.id)) {
          // Keep existing tool selection for this server
          newMap.set(server.id, prev.get(server.id)!);
        } else if (
          isServerSelected(server) &&
          server.isAvailable &&
          server.enabled
        ) {
          // Newly added server - enable all tools
          const enabledToolNames = new Set(
            server.tools.filter(t => t.enabled).map(t => t.name),
          );
          newMap.set(server.id, enabledToolNames);
        }
        // Servers not in mcpServers are excluded
      }

      return newMap;
    });
  }, [mcpServers, configQuery.data?.mcpServers, isServerSelected]);

  // Initialize enabled skills from initialSkills prop
  useEffect(() => {
    if (initialSkills && initialSkills.length > 0) {
      setEnabledSkills(new Set(initialSkills));
    }
  }, [initialSkills]);

  // Helper to toggle MCP tool enabled state
  const toggleMcpTool = useCallback((serverId: string, toolName: string) => {
    setEnabledMcpTools(prev => {
      const newMap = new Map(prev);
      const serverTools = new Set(prev.get(serverId) || []);
      if (serverTools.has(toolName)) {
        serverTools.delete(toolName);
      } else {
        serverTools.add(toolName);
      }
      newMap.set(serverId, serverTools);
      return newMap;
    });
  }, []);

  // Helper to toggle all tools for a MCP server
  const toggleAllMcpServerTools = useCallback(
    (serverId: string, allToolNames: string[], enable: boolean) => {
      setEnabledMcpTools(prev => {
        const newMap = new Map(prev);
        if (enable) {
          newMap.set(serverId, new Set(allToolNames));
        } else {
          newMap.set(serverId, new Set());
        }
        return newMap;
      });
    },
    [],
  );

  // Helper to toggle skill enabled state
  const toggleSkill = useCallback((skillId: string) => {
    setEnabledSkills(prev => {
      const newSet = new Set(prev);
      if (newSet.has(skillId)) {
        newSet.delete(skillId);
      } else {
        newSet.add(skillId);
      }
      return newSet;
    });
  }, []);

  // Helper to toggle all skills
  const toggleAllSkills = useCallback(
    (allSkillIds: string[], enable: boolean) => {
      setEnabledSkills(enable ? new Set(allSkillIds) : new Set());
    },
    [],
  );

  // Get all enabled MCP tool names (for sending with requests)
  // Only counts tools from servers that are in mcpServers (if provided)
  const getEnabledMcpToolNames = useCallback((): string[] => {
    const toolNames: string[] = [];
    enabledMcpTools.forEach((tools, serverId) => {
      // Filter by mcpServers if provided
      if (!mcpServers || mcpServers.some(s => s.id === serverId)) {
        tools.forEach(toolName => toolNames.push(toolName));
      }
    });
    return toolNames;
  }, [enabledMcpTools, mcpServers]);

  // Get all enabled skill IDs (for sending with requests)
  const getEnabledSkillIds = useCallback((): string[] => {
    return Array.from(enabledSkills);
  }, [enabledSkills]);

  // Load messages from store on mount when useStoreMode is enabled
  useEffect(() => {
    if (useStoreMode) {
      const storeMessages = useChatStore.getState().messages;
      if (storeMessages.length > 0) {
        setDisplayItems(storeMessages);
      }
    }
  }, [useStoreMode]);

  // Track previous runtimeId to detect changes
  const prevRuntimeIdRef = useRef<string | undefined>(undefined);

  // Clear displayItems and load messages when runtimeId changes
  // This ensures each agent space has isolated conversation history
  useEffect(() => {
    // If runtimeId changed, clear displayItems first
    if (runtimeId !== prevRuntimeIdRef.current) {
      prevRuntimeIdRef.current = runtimeId;

      // Clear current display items when switching runtime
      setDisplayItems([]);
      toolCallsRef.current.clear();

      // If no runtimeId, nothing more to do
      if (!runtimeId) return;
    } else {
      // runtimeId didn't change, skip
      return;
    }

    const store = useConversationStore.getState();

    // Check if we need to fetch (not already fetched and not currently fetching)
    if (!store.needsFetch(runtimeId)) {
      // Already fetched - load from in-memory store
      const storedMessages = store.getMessages(runtimeId);
      if (storedMessages.length > 0) {
        setDisplayItems(storedMessages);
      }
      return;
    }

    // Mark as fetching to prevent duplicate requests
    store.setFetching(runtimeId, true);

    // Build the history endpoint URL
    const endpoint =
      historyEndpoint ||
      (protocol?.endpoint ? `${protocol.endpoint}/history` : null);

    if (!endpoint) {
      console.warn(
        '[ChatBase] No history endpoint available for runtimeId:',
        runtimeId,
      );
      store.markFetched(runtimeId);
      return;
    }

    // Fetch conversation history from server
    const fetchHistory = async () => {
      try {
        const authToken = historyAuthToken || protocol?.authToken;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }

        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(
            `Failed to fetch history: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        const messages: ChatMessage[] = data.messages || [];

        // Store in memory and update display
        if (messages.length > 0) {
          store.setMessages(runtimeId, messages);
          setDisplayItems(messages);
        }

        store.markFetched(runtimeId);
      } catch (err) {
        console.error('[ChatBase] Failed to fetch conversation history:', err);
        store.markFetched(runtimeId);
      }
    };

    fetchHistory();
  }, [
    runtimeId,
    historyEndpoint,
    historyAuthToken,
    protocol?.endpoint,
    protocol?.authToken,
  ]);

  // Keep in-memory store in sync with displayItems (for session persistence)
  useEffect(() => {
    if (runtimeId && displayItems.length > 0) {
      // Filter to only save ChatMessage items (not tool call items)
      const messagesToSave = displayItems.filter(
        (item): item is ChatMessage => !isToolCallMessage(item),
      );
      if (messagesToSave.length > 0) {
        useConversationStore.getState().setMessages(runtimeId, messagesToSave);
      }
    }
  }, [runtimeId, displayItems]);

  // Derived state
  const messages = displayItems.filter(
    (item): item is ChatMessage => !isToolCallMessage(item),
  );
  const ready = true;

  // Track previous message count to avoid unnecessary callbacks
  const prevMessageCountRef = useRef(0);

  // Notify parent when messages change (only when count actually changes)
  useEffect(() => {
    const currentCount = messages.length;
    if (currentCount !== prevMessageCountRef.current) {
      prevMessageCountRef.current = currentCount;
      onMessagesChange?.(messages);
    }
  }, [displayItems, onMessagesChange]); // Use displayItems instead of messages to avoid infinite loop

  // Padding based on compact mode
  const padding = compact ? 2 : 3;

  // Default avatar config
  const defaultAvatarConfig: AvatarConfig = {
    userAvatar: <PersonIcon size={16} />,
    assistantAvatar: <AiAgentIcon colored size={16} />,
    showAvatars: true,
    avatarSize: 32,
    userAvatarBg: 'neutral.muted',
    assistantAvatarBg: 'accent.emphasis',
    ...avatarConfig,
  };

  // Initialize protocol adapter
  useEffect(() => {
    if (!protocol) return;

    const adapter = createProtocolAdapter(protocol);
    if (!adapter) return;

    adapterRef.current = adapter;

    // Subscribe to protocol events
    unsubscribeRef.current = adapter.subscribe((event: ProtocolEvent) => {
      switch (event.type) {
        case 'message':
          // Update or create assistant message
          if (event.message) {
            const incomingId = event.message.id;
            const currentId = currentAssistantMessageRef.current?.id;
            const isNewMessage =
              !currentId || (incomingId && incomingId !== currentId);

            if (currentAssistantMessageRef.current && !isNewMessage) {
              // Update existing message (same ID)
              setDisplayItems(prev => {
                const newItems = [...prev];
                const idx = newItems.findIndex(
                  item =>
                    !isToolCallMessage(item) &&
                    item.id === currentAssistantMessageRef.current?.id,
                );
                if (idx >= 0 && !isToolCallMessage(newItems[idx])) {
                  newItems[idx] = {
                    ...(newItems[idx] as ChatMessage),
                    content: event.message?.content ?? '',
                  };
                }
                return newItems;
              });
              // Update message in store
              if (useStoreMode && currentAssistantMessageRef.current) {
                useChatStore
                  .getState()
                  .updateMessage(currentAssistantMessageRef.current.id, {
                    content: event.message?.content ?? '',
                  });
              }
            } else {
              // Create new assistant message (new ID or first message)
              const content = event.message.content;
              const contentStr =
                typeof content === 'string' ? content : (content ?? '');
              const newMessage = createAssistantMessage(
                typeof contentStr === 'string' ? contentStr : '',
              );
              newMessage.id = event.message.id || newMessage.id;
              currentAssistantMessageRef.current = newMessage;
              setDisplayItems(prev => [...prev, newMessage]);
              // Add message to store
              if (useStoreMode) {
                useChatStore.getState().addMessage(newMessage);
              }
            }
          }
          break;

        case 'tool-call':
          // Handle tool call start or update
          if (event.toolCall) {
            const toolCallId = event.toolCall.toolCallId || generateMessageId();
            const toolName = event.toolCall.toolName;
            const args = event.toolCall.args || {};

            // Check if this tool call already exists (update args)
            if (toolCallsRef.current.has(toolCallId)) {
              const existingToolCall = toolCallsRef.current.get(toolCallId);
              if (existingToolCall) {
                // Merge new args with existing (update from TOOL_CALL_END)
                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  args: {
                    ...existingToolCall.args,
                    ...args,
                  },
                };
                toolCallsRef.current.set(toolCallId, updatedToolCall);

                // Always update displayItems (default ToolCallDisplay will be used if no custom renderer)
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) && item.toolCallId === toolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );

                // Check if this is a frontend tool and we have complete args
                // Execute the tool handler if available
                const frontendTool = frontendTools?.find(
                  t => t.name === toolName,
                );
                const toolHandler = frontendTool?.handler;
                if (toolHandler && Object.keys(args).length > 0) {
                  // Execute frontend tool
                  (async () => {
                    try {
                      const result = await toolHandler(updatedToolCall.args);

                      // Send result back to adapter
                      if (adapterRef.current) {
                        await adapterRef.current.sendToolResult(toolCallId, {
                          toolCallId,
                          success: true,
                          result,
                        });
                      }

                      // Update tool call with result
                      const completedToolCall: ToolCallMessage = {
                        ...updatedToolCall,
                        result,
                        status: 'complete',
                      };
                      toolCallsRef.current.set(toolCallId, completedToolCall);
                      setDisplayItems(prev =>
                        prev.map(item =>
                          isToolCallMessage(item) &&
                          item.toolCallId === toolCallId
                            ? completedToolCall
                            : item,
                        ),
                      );
                    } catch (err) {
                      console.error(
                        '[ChatBase] Frontend tool execution error:',
                        err,
                      );
                      const errorToolCall: ToolCallMessage = {
                        ...updatedToolCall,
                        status: 'error',
                        error: (err as Error).message,
                      };
                      toolCallsRef.current.set(toolCallId, errorToolCall);
                      setDisplayItems(prev =>
                        prev.map(item =>
                          isToolCallMessage(item) &&
                          item.toolCallId === toolCallId
                            ? errorToolCall
                            : item,
                        ),
                      );
                    }
                  })();
                }
              }
            } else {
              // New tool call - add it
              const toolCallMsg: ToolCallMessage = {
                id: `tool-${toolCallId}`,
                type: 'tool-call',
                toolCallId,
                toolName,
                args,
                status: 'executing',
              };
              toolCallsRef.current.set(toolCallId, toolCallMsg);

              // Always add to displayItems (default ToolCallDisplay will be used if no custom renderer)
              setDisplayItems(prev => [...prev, toolCallMsg]);

              // Execute frontend tool if available and args are present
              const frontendTool = frontendTools?.find(
                t => t.name === toolName,
              );
              const toolHandler = frontendTool?.handler;
              if (toolHandler && Object.keys(args).length > 0) {
                (async () => {
                  try {
                    const result = await toolHandler(args);

                    // Send result back to adapter
                    if (adapterRef.current) {
                      await adapterRef.current.sendToolResult(toolCallId, {
                        toolCallId,
                        success: true,
                        result,
                      });
                    }

                    // Update tool call with result
                    const completedToolCall: ToolCallMessage = {
                      ...toolCallMsg,
                      result,
                      status: 'complete',
                    };
                    toolCallsRef.current.set(toolCallId, completedToolCall);
                    setDisplayItems(prev =>
                      prev.map(item =>
                        isToolCallMessage(item) &&
                        item.toolCallId === toolCallId
                          ? completedToolCall
                          : item,
                      ),
                    );
                  } catch (err) {
                    console.error(
                      '[ChatBase] Frontend tool execution error:',
                      err,
                    );
                    const errorToolCall: ToolCallMessage = {
                      ...toolCallMsg,
                      status: 'error',
                      error: (err as Error).message,
                    };
                    toolCallsRef.current.set(toolCallId, errorToolCall);
                    setDisplayItems(prev =>
                      prev.map(item =>
                        isToolCallMessage(item) &&
                        item.toolCallId === toolCallId
                          ? errorToolCall
                          : item,
                      ),
                    );
                  }
                })();
              }
            }
          }
          break;

        case 'tool-result':
          // Handle tool result - always update status even without custom renderToolResult
          if (event.toolResult) {
            const toolCallId = event.toolResult.toolCallId;
            if (toolCallId && toolCallsRef.current.has(toolCallId)) {
              const existingToolCall = toolCallsRef.current.get(toolCallId);
              if (existingToolCall) {
                // Check if this is a human-in-the-loop tool (has steps in args)
                // If so, keep status as 'executing' until user responds
                const isHumanInTheLoop =
                  existingToolCall.args &&
                  'steps' in existingToolCall.args &&
                  Array.isArray(existingToolCall.args.steps);

                // Extract rich error information from result if available
                const resultData = event.toolResult.result as
                  | Record<string, unknown>
                  | undefined;
                let executionError: string | undefined;
                let codeError: ToolCallMessage['codeError'] | undefined;
                let exitCode: number | null | undefined;
                let hasError = !!event.toolResult.error;

                if (resultData && typeof resultData === 'object') {
                  // Check for execution_error (infrastructure/sandbox errors)
                  if (
                    resultData.execution_error &&
                    typeof resultData.execution_error === 'string'
                  ) {
                    executionError = resultData.execution_error;
                    hasError = true;
                  }
                  // Check for code_error (Python exceptions)
                  if (
                    resultData.code_error &&
                    typeof resultData.code_error === 'object'
                  ) {
                    const ce = resultData.code_error as Record<string, unknown>;
                    codeError = {
                      name: (ce.name as string) || 'Error',
                      value: (ce.value as string) || 'Unknown error',
                      traceback: ce.traceback as string | undefined,
                    };
                    hasError = true;
                  }
                  // Check for exit_code (non-zero exit from sys.exit())
                  if ('exit_code' in resultData) {
                    const ec = resultData.exit_code;
                    exitCode = typeof ec === 'number' ? ec : null;
                    // Non-zero exit code counts as an error condition
                    if (exitCode != null && exitCode !== 0) {
                      hasError = true;
                    }
                  }
                  // Check for execution_ok flag
                  if (
                    'execution_ok' in resultData &&
                    resultData.execution_ok === false
                  ) {
                    hasError = true;
                  }
                }

                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  result: event.toolResult.result,
                  // Keep executing for HITL, otherwise mark complete/error
                  status: hasError
                    ? 'error'
                    : isHumanInTheLoop
                      ? 'executing'
                      : 'complete',
                  error: event.toolResult.error,
                  executionError,
                  codeError,
                  exitCode,
                };
                toolCallsRef.current.set(toolCallId, updatedToolCall);
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) && item.toolCallId === toolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );
              }
            }
          }
          break;

        case 'state-update':
          onStateUpdate?.(event.data);
          // When we receive a state update, mark the last executing tool as complete
          // This handles tools that return state events (STATE_SNAPSHOT/STATE_DELTA) instead of TOOL_CALL_RESULT
          if (event.data) {
            // Find any tool calls that are still in 'executing' status
            const executingToolCalls = Array.from(
              toolCallsRef.current.entries(),
            ).filter(([_, tc]) => tc.status === 'executing');

            // Mark the most recent executing tool as complete
            if (executingToolCalls.length > 0) {
              const [lastToolCallId, existingToolCall] =
                executingToolCalls[executingToolCalls.length - 1];

              // Check if this is NOT a human-in-the-loop tool
              const isHumanInTheLoop =
                existingToolCall.args &&
                'steps' in existingToolCall.args &&
                Array.isArray(existingToolCall.args.steps);

              if (!isHumanInTheLoop) {
                // Extract result from state data if available
                const stateData = event.data as Record<string, unknown>;
                const result =
                  stateData.weather ??
                  stateData.result ??
                  stateData.toolResult ??
                  stateData;

                const updatedToolCall: ToolCallMessage = {
                  ...existingToolCall,
                  result,
                  status: 'complete',
                };
                toolCallsRef.current.set(lastToolCallId, updatedToolCall);
                setDisplayItems(prev =>
                  prev.map(item =>
                    isToolCallMessage(item) &&
                    item.toolCallId === lastToolCallId
                      ? updatedToolCall
                      : item,
                  ),
                );
              }
            }
          }
          break;

        case 'error':
          console.error('[ChatBase] Protocol error:', event.error);
          setError(event.error || new Error('Unknown error'));
          setIsLoading(false);
          setIsStreaming(false);
          break;
      }
    });

    // Connect to protocol
    adapter.connect().catch(console.error);

    return () => {
      unsubscribeRef.current?.();
      adapterRef.current?.disconnect();
    };
    // Note: frontendTools is accessed via ref-like closure, not as reactive dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocol, renderToolResult, onStateUpdate, useStoreMode]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayItems]);

  // Handle sending message in protocol mode or custom mode
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    // Need either an adapter (protocol mode) or onSendMessage handler (custom mode)
    if (!adapterRef.current && !onSendMessage) return;

    const messageContent = input.trim();
    const userMessage = createUserMessage(messageContent);
    const currentMessages = displayItems.filter(
      (item): item is ChatMessage => !isToolCallMessage(item),
    );
    const allMessages = [...currentMessages, userMessage];

    setDisplayItems(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setIsStreaming(true);
    setError(null);
    currentAssistantMessageRef.current = null;

    // Persist user message to store if enabled
    if (useStoreMode) {
      useChatStore.getState().addMessage(userMessage);
    }

    try {
      if (onSendMessage) {
        // Custom mode: use the provided message handler
        if (enableStreaming) {
          // Streaming mode: create assistant message placeholder and stream updates
          const assistantMessageId = generateMessageId();
          const assistantMessage = createAssistantMessage('');
          assistantMessage.id = assistantMessageId;
          setDisplayItems(prev => [...prev, assistantMessage]);
          currentAssistantMessageRef.current = assistantMessage;

          if (useStoreMode) {
            useChatStore.getState().addMessage(assistantMessage);
            useChatStore.getState().startStreaming(assistantMessageId);
          }

          // Create abort controller for cancellation
          abortControllerRef.current = new AbortController();

          await onSendMessage(messageContent, allMessages, {
            onChunk: (chunk: string) => {
              // Append chunk to the assistant message
              setDisplayItems(prev =>
                prev.map(item =>
                  item.id === assistantMessageId
                    ? {
                        ...item,
                        content: (item as ChatMessage).content + chunk,
                      }
                    : item,
                ),
              );
              if (useStoreMode) {
                useChatStore
                  .getState()
                  .appendToStream(assistantMessageId, chunk);
              }
            },
            onComplete: (fullResponse: string) => {
              // Update assistant message with final content
              setDisplayItems(prev =>
                prev.map(item =>
                  item.id === assistantMessageId
                    ? { ...item, content: fullResponse }
                    : item,
                ),
              );
              if (useStoreMode) {
                useChatStore
                  .getState()
                  .updateMessage(assistantMessageId, { content: fullResponse });
                useChatStore.getState().stopStreaming();
              }
            },
            onError: (error: Error) => {
              // Update assistant message with error
              const errorContent = `Error: ${error.message}`;
              setDisplayItems(prev =>
                prev.map(item =>
                  item.id === assistantMessageId
                    ? { ...item, content: errorContent }
                    : item,
                ),
              );
              if (useStoreMode) {
                useChatStore
                  .getState()
                  .updateMessage(assistantMessageId, { content: errorContent });
                useChatStore.getState().stopStreaming();
              }
              setError(error);
            },
            signal: abortControllerRef.current.signal,
          });
        } else {
          // Non-streaming mode: wait for full response
          const response = await onSendMessage(messageContent, allMessages);
          if (response) {
            const assistantMessage = createAssistantMessage(response);
            setDisplayItems(prev => [...prev, assistantMessage]);
            if (useStoreMode) {
              useChatStore.getState().addMessage(assistantMessage);
            }
          }
        }
      } else if (adapterRef.current) {
        // Protocol mode: use the adapter
        // Convert frontend tools to AG-UI format (only serializable properties)
        const toolsForRequest = (frontendTools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} },
        }));

        // Get enabled MCP tool names and skill IDs
        const enabledMcpToolNames = getEnabledMcpToolNames();
        const enabledSkillIds = getEnabledSkillIds();

        await adapterRef.current.sendMessage(userMessage, {
          threadId: threadIdRef.current,
          messages: allMessages,
          ...(selectedModel && { model: selectedModel }),
          tools: toolsForRequest,
          // Include enabled MCP tools as builtin_tools for backend
          builtinTools: enabledMcpToolNames,
          // Include enabled skills for backend
          skills: enabledSkillIds,
          // Include connected identities with access tokens (use ref to avoid infinite loops)
          identities: connectedIdentitiesRef.current,
        } as Parameters<typeof adapterRef.current.sendMessage>[1]);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[ChatBase] Send error:', err);
        const errorMessage = createAssistantMessage(
          `Error: ${(err as Error).message}`,
        );
        setDisplayItems(prev => [...prev, errorMessage]);
        setError(err as Error);
      }
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      currentAssistantMessageRef.current = null;
      abortControllerRef.current = null;
    }
  }, [
    input,
    isLoading,
    displayItems,
    selectedModel,
    frontendTools,
    useStoreMode,
    onSendMessage,
    enableStreaming,
    getEnabledMcpToolNames,
    getEnabledSkillIds,
  ]);

  // Handle stop
  const handleStop = useCallback(() => {
    // Abort custom mode request
    abortControllerRef.current?.abort();
    // Disconnect protocol adapter
    adapterRef.current?.disconnect();
    // Stop streaming in store
    if (useStoreMode) {
      useChatStore.getState().stopStreaming();
    }
    setIsLoading(false);
    setIsStreaming(false);
  }, [useStoreMode]);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Handle new chat
  const handleNewChat = useCallback(() => {
    setDisplayItems([]);
    toolCallsRef.current.clear();
    setInput('');
    threadIdRef.current = generateMessageId();
    if (useStoreMode) {
      clearStoreMessages();
    }
    // Clear from conversation store if runtimeId is provided
    if (runtimeId) {
      useConversationStore.getState().clearMessages(runtimeId);
    }
    onNewChat?.();
    headerButtons?.onNewChat?.();
  }, [clearStoreMessages, onNewChat, headerButtons, useStoreMode, runtimeId]);

  // Handle clear
  const handleClear = useCallback(() => {
    if (window.confirm('Clear all messages?')) {
      setDisplayItems([]);
      toolCallsRef.current.clear();
      if (useStoreMode) {
        clearStoreMessages();
      }
      // Clear from conversation store if runtimeId is provided
      if (runtimeId) {
        useConversationStore.getState().clearMessages(runtimeId);
      }
      onClear?.();
      headerButtons?.onClear?.();
    }
  }, [clearStoreMessages, onClear, headerButtons, useStoreMode, runtimeId]);

  // Handle sandbox interrupt
  const handleSandboxInterrupt = useCallback(async () => {
    if (!protocol?.configEndpoint) return;
    const interruptUrl = `${getApiBaseFromConfig(protocol.configEndpoint)}/configure/sandbox/interrupt`;
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (protocol.authToken) {
        headers['Authorization'] = `Bearer ${protocol.authToken}`;
      }
      await fetch(interruptUrl, { method: 'POST', headers });
      // Refetch status immediately so the icon updates
      sandboxStatusQuery.refetch();
    } catch (e) {
      // Interrupt is best-effort
    }
  }, [protocol?.configEndpoint, protocol?.authToken, sandboxStatusQuery]);

  // Not ready yet (store mode only)
  if (!ready) {
    return (
      <Box
        className={className}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
          borderRadius: borderRadius,
          bg: backgroundColor || 'canvas.default',
          border: border,
          boxShadow: boxShadow,
        }}
      >
        {loadingState || (
          <>
            <Spinner size="large" />
            <Text sx={{ mt: 3, color: 'fg.muted' }}>Initializing chat...</Text>
          </>
        )}
      </Box>
    );
  }

  // Render header with buttons
  const renderHeader = () => {
    if (!showHeader) return null;

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        {/* Title row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: padding,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {brandIcon || <AiAgentIcon colored size={20} />}
            {title && (
              <Heading as="h3" sx={{ fontSize: 2, fontWeight: 'semibold' }}>
                {title}
              </Heading>
            )}
            {/* Inline header content (e.g., protocol label) */}
            {headerContent}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Sandbox execution status indicator */}
            {sandboxStatus?.available &&
              sandboxStatus?.sandbox_running &&
              (sandboxStatus.is_executing ? (
                <IconButton
                  icon={SquareFillIcon}
                  aria-label="Interrupt code execution"
                  variant="invisible"
                  size="small"
                  sx={{ color: 'danger.fg' }}
                  onClick={handleSandboxInterrupt}
                />
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    color: 'fg.subtle',
                  }}
                  title="Code sandbox ready"
                >
                  <CircleIcon size={12} />
                </Box>
              ))}
            {/* Header buttons */}
            {headerButtons?.showNewChat && (
              <IconButton
                icon={PlusIcon}
                aria-label="New chat"
                variant="invisible"
                size="small"
                onClick={handleNewChat}
              />
            )}
            {headerButtons?.showClear && messages.length > 0 && (
              <IconButton
                icon={TrashIcon}
                aria-label="Clear messages"
                variant="invisible"
                size="small"
                onClick={handleClear}
              />
            )}
            {headerButtons?.showSettings && (
              <IconButton
                icon={GearIcon}
                aria-label="Settings"
                variant="invisible"
                size="small"
                onClick={headerButtons.onSettings}
              />
            )}
            {/* Custom header actions */}
            {headerActions}
          </Box>
        </Box>
      </Box>
    );
  };

  // Render token usage bar between input and selectors
  const renderTokenUsage = () => {
    if (!showTokenUsage) return null;

    // Show bar when we have any context data (totalTokens > 0 means agent is active)
    const hasContext =
      agentUsage && !agentUsage.error && agentUsage.totalTokens > 0;
    const hasTurn =
      agentUsage?.turnUsage &&
      (agentUsage.turnUsage.inputTokens > 0 ||
        agentUsage.turnUsage.outputTokens > 0);
    const hasSession =
      agentUsage?.sessionUsage &&
      (agentUsage.sessionUsage.inputTokens > 0 ||
        agentUsage.sessionUsage.outputTokens > 0);

    if (!hasContext) return null;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 2,
          py: 1,
          px: padding,
          bg: 'canvas.subtle',
          flexWrap: 'nowrap',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {/* Context window usage */}
        <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
          <Text
            as="span"
            sx={{ fontWeight: 'semibold', color: 'fg.default', fontSize: 0 }}
          >
            {formatTokenCount(agentUsage!.totalTokens)}
          </Text>
          {' / '}
          {formatTokenCount(agentUsage!.contextWindow)}
          {' ctx'}
        </Text>
        {/* Session totals */}
        {hasSession && (
          <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
            {'· '}
            {formatTokenCount(agentUsage!.sessionUsage!.inputTokens)}
            <Text as="span" sx={{ color: 'success.fg', fontSize: 0 }}>
              {'▲'}
            </Text>{' '}
            {formatTokenCount(agentUsage!.sessionUsage!.outputTokens)}
            <Text as="span" sx={{ color: 'attention.fg', fontSize: 0 }}>
              {'▼'}
            </Text>
          </Text>
        )}
        {/* Last turn breakdown */}
        {hasTurn && (
          <Text sx={{ fontSize: 0, color: 'fg.muted', flexShrink: 0 }}>
            {'· turn '}
            {formatTokenCount(agentUsage!.turnUsage!.inputTokens)}
            <Text as="span" sx={{ color: 'success.fg', fontSize: 0 }}>
              {'▲'}
            </Text>{' '}
            {formatTokenCount(agentUsage!.turnUsage!.outputTokens)}
            <Text as="span" sx={{ color: 'attention.fg', fontSize: 0 }}>
              {'▼'}
            </Text>
          </Text>
        )}
      </Box>
    );
  };

  // Render empty state
  const renderEmptyState = () => {
    if (emptyState?.render) {
      return emptyState.render();
    }

    // Handler for suggestion clicks
    const handleSuggestionClick = (suggestion: Suggestion) => {
      if (submitOnSuggestionClick) {
        // Auto-submit the suggestion message
        const userMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'user',
          content: suggestion.message,
          createdAt: new Date(),
        };
        setDisplayItems(prev => [...prev, userMessage]);
        setIsLoading(true);
        setIsStreaming(true);

        // Convert frontend tools to AG-UI format (same as regular message send)
        const toolsForSuggestion = (frontendTools || []).map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters || { type: 'object', properties: {} },
        }));

        adapterRef.current
          ?.sendMessage(userMessage, {
            threadId: threadIdRef.current,
            messages: [userMessage],
            tools: toolsForSuggestion,
          } as Parameters<typeof adapterRef.current.sendMessage>[1])
          .catch(err => {
            console.error('[ChatBase] Suggestion send error:', err);
            setError(err instanceof Error ? err : new Error(String(err)));
          })
          .finally(() => {
            setIsLoading(false);
            setIsStreaming(false);
          });
      } else {
        // Just fill the input without submitting
        setInput(suggestion.message);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 0);
      }
    };

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 4,
          color: 'fg.muted',
          textAlign: 'center',
          gap: 2,
        }}
      >
        {emptyState?.icon || brandIcon || <AiAgentIcon colored size={48} />}
        <Text sx={{ fontSize: 2 }}>
          {emptyState?.title || 'Start a conversation'}
        </Text>
        {(emptyState?.subtitle || description) && (
          <Text sx={{ fontSize: 1 }}>
            {emptyState?.subtitle || description}
          </Text>
        )}
        {suggestions && suggestions.length > 0 && (
          <LabelGroup sx={{ mt: 2, justifyContent: 'center' }}>
            {suggestions.map((suggestion, index) => (
              <Label
                key={index}
                variant="accent"
                sx={{
                  cursor: 'pointer',
                  '&:hover': {
                    bg: 'accent.muted',
                  },
                }}
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion.title}
              </Label>
            ))}
          </LabelGroup>
        )}
      </Box>
    );
  };

  // Render protocol mode messages with tool call support
  const renderProtocolMessages = () => {
    if (displayItems.length === 0) {
      return renderEmptyState();
    }

    // Create respond callback for a tool call (human-in-the-loop)
    const createRespondCallback = (toolCallId: string): RespondCallback => {
      return async (result: unknown) => {
        // Update tool call status to complete with the user's response
        const existingToolCall = toolCallsRef.current.get(toolCallId);
        if (existingToolCall && existingToolCall.status === 'executing') {
          const updatedToolCall: ToolCallMessage = {
            ...existingToolCall,
            result,
            status: 'complete',
          };
          toolCallsRef.current.set(toolCallId, updatedToolCall);
          setDisplayItems(prev =>
            prev.map(item =>
              isToolCallMessage(item) && item.toolCallId === toolCallId
                ? updatedToolCall
                : item,
            ),
          );

          // Send the user's response back to the agent as a new message
          // This continues the conversation with the HITL response
          if (adapterRef.current) {
            // Format the response as a clear text message the agent can understand
            let responseText: string;
            if (typeof result === 'string') {
              responseText = result;
            } else if (
              result &&
              typeof result === 'object' &&
              'accepted' in result
            ) {
              const hitlResult = result as {
                accepted: boolean;
                steps?: Array<{ description: string }>;
              };
              if (hitlResult.accepted) {
                const stepDescriptions =
                  hitlResult.steps?.map(s => s.description).join(', ') || '';
                responseText = stepDescriptions
                  ? `I confirm and approve the following steps: ${stepDescriptions}`
                  : 'I confirm and approve the plan.';
              } else {
                responseText =
                  'I reject this plan. Please suggest something else.';
              }
            } else {
              responseText = JSON.stringify(result, null, 2);
            }

            // Create a user message with the HITL response
            const userMessage: ChatMessage = {
              id: generateMessageId(),
              role: 'user',
              content: responseText,
              createdAt: new Date(),
            };

            setIsLoading(true);
            setIsStreaming(true);

            try {
              // Get all chat messages for context
              const allMessages = displayItems.filter(
                (item): item is ChatMessage => !isToolCallMessage(item),
              );

              await adapterRef.current.sendMessage(userMessage, {
                threadId: threadIdRef.current,
                messages: [...allMessages, userMessage],
              } as Parameters<typeof adapterRef.current.sendMessage>[1]);
            } catch (err) {
              console.error('[ChatBase] HITL respond error:', err);
            } finally {
              setIsLoading(false);
              setIsStreaming(false);
            }
          }
        }
      };
    };

    // Check if there are tool calls being rendered
    // This is used to hide duplicate assistant text when UI is shown
    const renderedToolCallIds = new Set<string>();
    displayItems.forEach(item => {
      if (isToolCallMessage(item)) {
        if (renderToolResult) {
          // Check if custom renderer produces a rendered UI
          const rendered = renderToolResult({
            toolCallId: item.toolCallId,
            toolName: item.toolName,
            name: item.toolName,
            args: item.args,
            result: item.result,
            status: item.status,
            error: item.error,
          });
          if (rendered !== null && rendered !== undefined) {
            renderedToolCallIds.add(item.toolCallId);
          }
        } else {
          // Default display always renders tool calls
          renderedToolCallIds.add(item.toolCallId);
        }
      }
    });
    const hasRenderedToolCall = renderedToolCallIds.size > 0;

    return (
      <>
        {displayItems.map((item, index) => {
          // Render tool call
          if (isToolCallMessage(item)) {
            // Only provide respond callback when status is 'executing'
            const respond =
              item.status === 'executing'
                ? createRespondCallback(item.toolCallId)
                : undefined;

            // Use custom renderToolResult if provided, otherwise use default display
            const toolUI = renderToolResult ? (
              renderToolResult({
                toolCallId: item.toolCallId,
                toolName: item.toolName,
                name: item.toolName,
                args: item.args,
                result: item.result,
                status: item.status,
                error: item.error,
                respond,
              })
            ) : (
              <ToolCallDisplay
                toolCallId={item.toolCallId}
                toolName={item.toolName}
                args={item.args}
                result={item.result}
                status={item.status}
                error={item.error}
                executionError={item.executionError}
                codeError={item.codeError}
                exitCode={item.exitCode}
              />
            );

            // Skip if custom render returns null/undefined
            if (toolUI === null || toolUI === undefined) return null;

            return (
              <Box
                key={item.id}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  maxWidth: '95%',
                  px: padding,
                  py: 1,
                }}
              >
                {toolUI}
              </Box>
            );
          }

          // Render regular chat message
          const message = item as ChatMessage;
          const isUser = message.role === 'user';

          // Skip assistant messages when hideMessagesAfterToolUI is enabled and there's a rendered tool call
          if (!isUser && hideMessagesAfterToolUI && hasRenderedToolCall) {
            // Get message text safely
            const messageText = getMessageText(message);

            // Check if this assistant message follows a rendered tool call
            const prevIndex = index - 1;
            if (prevIndex >= 0) {
              const prevItem = displayItems[prevIndex];
              if (
                isToolCallMessage(prevItem) &&
                renderedToolCallIds.has(prevItem.toolCallId)
              ) {
                // Skip this assistant message as it describes the tool result
                return null;
              }
            }

            // Also check for HITL-specific patterns (step descriptions)
            const hitlToolCall = displayItems.find(
              item =>
                isToolCallMessage(item) &&
                renderedToolCallIds.has(item.toolCallId) &&
                item.args &&
                'steps' in item.args &&
                Array.isArray(item.args.steps),
            ) as ToolCallMessage | undefined;

            if (hitlToolCall && messageText) {
              const steps = hitlToolCall.args.steps as Array<{
                description?: string;
              }>;
              // Check if message contains step descriptions or step-like patterns
              const hasStepContent =
                steps.some(
                  step =>
                    step.description &&
                    messageText
                      .toLowerCase()
                      .includes(step.description.toLowerCase().slice(0, 20)),
                ) ||
                // Also hide if message contains numbered list patterns
                /^\s*(\d+\.\s|[-*]\s|\*\*)/.test(messageText) ||
                messageText.includes('**Enabled**') ||
                messageText.includes('steps below');

              if (hasStepContent) {
                return null;
              }
            }
          }

          return (
            <Box
              key={message.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                px: padding,
                py: 1,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  gap: 2,
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  alignItems: 'flex-start',
                }}
              >
                {/* Avatar */}
                {defaultAvatarConfig.showAvatars && (
                  <Box
                    sx={{
                      width: defaultAvatarConfig.avatarSize,
                      height: defaultAvatarConfig.avatarSize,
                      borderRadius: '50%',
                      bg: isUser
                        ? defaultAvatarConfig.userAvatarBg
                        : defaultAvatarConfig.assistantAvatarBg,
                      color: isUser ? 'fg.default' : 'fg.onEmphasis',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isUser
                      ? defaultAvatarConfig.userAvatar
                      : defaultAvatarConfig.assistantAvatar}
                  </Box>
                )}

                {/* Message bubble */}
                <Box
                  sx={{
                    maxWidth: '85%',
                    p: 2,
                    borderRadius: 2,
                    backgroundColor: isUser
                      ? 'accent.emphasis'
                      : 'canvas.subtle',
                    color: isUser ? 'fg.onEmphasis' : 'fg.default',
                    // Streamdown code block styling
                    // Code block container
                    '& [data-streamdown="code-block"]': {
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: 'border.default',
                      overflow: 'hidden',
                      my: 2,
                    },
                    // Code block header with language label and buttons
                    '& [data-streamdown="code-block-header"]': {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'canvas.subtle',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'fg.muted',
                    },
                    // Style the buttons in the header
                    '& [data-streamdown="code-block-header"] button': {
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      color: 'fg.muted',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: 'neutral.muted',
                        color: 'fg.default',
                      },
                    },
                    // Code block body
                    '& [data-streamdown="code-block-body"]': {
                      backgroundColor: 'canvas.subtle',
                      padding: '12px',
                      margin: 0,
                      overflow: 'auto',
                      fontSize: '13px',
                      lineHeight: 1.5,
                    },
                    // Make each line display as a block for line breaks
                    '& [data-streamdown="code-block-body"] code': {
                      display: 'block',
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    },
                    '& [data-streamdown="code-block-body"] code > span.block': {
                      display: 'block',
                    },
                    '& [data-streamdown="code-block-body"] code > span': {
                      display: 'block',
                    },
                    // General pre/code styling fallback
                    '& pre': {
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowX: 'auto',
                      margin: 0,
                    },
                    '& pre code': {
                      whiteSpace: 'pre-wrap',
                    },
                    '& code': {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    },
                  }}
                >
                  {isUser ? (
                    <Text
                      sx={{
                        fontSize: 1,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {getMessageText(message)}
                    </Text>
                  ) : (
                    <Box
                      sx={{
                        fontSize: 1,
                        lineHeight: 1.5,
                        '& ul, & ol': {
                          marginTop: '0.5em',
                          marginBottom: '0.5em',
                          paddingInlineStart: '1.25em',
                          listStylePosition: 'inside',
                        },
                        '& li': {
                          paddingInlineStart: '0.25em',
                        },
                      }}
                    >
                      <Streamdown>
                        {getMessageText(message) || (isStreaming ? '...' : '')}
                      </Streamdown>
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })}
        {/* Typing indicator cursor - shows when waiting for response */}
        {showLoadingIndicator && (isLoading || isStreaming) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              px: padding,
              py: 1,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                alignItems: 'flex-start',
              }}
            >
              {/* Avatar */}
              {defaultAvatarConfig.showAvatars && (
                <Box
                  sx={{
                    width: defaultAvatarConfig.avatarSize,
                    height: defaultAvatarConfig.avatarSize,
                    borderRadius: '50%',
                    bg: defaultAvatarConfig.assistantAvatarBg,
                    color: 'fg.onEmphasis',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {defaultAvatarConfig.assistantAvatar}
                </Box>
              )}
              {/* Pulsing cursor dots */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  p: 2,
                  borderRadius: 2,
                  bg: 'canvas.subtle',
                  minHeight: '32px',
                }}
              >
                <Box
                  sx={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    bg: 'fg.muted',
                    animation: 'typingPulse 1.4s ease-in-out infinite',
                    '@keyframes typingPulse': {
                      '0%, 60%, 100%': {
                        transform: 'scale(0.6)',
                        opacity: 0.4,
                      },
                      '30%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                    },
                  }}
                />
                <Box
                  sx={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    bg: 'fg.muted',
                    animation: 'typingPulse 1.4s ease-in-out infinite',
                    animationDelay: '0.2s',
                    '@keyframes typingPulse': {
                      '0%, 60%, 100%': {
                        transform: 'scale(0.6)',
                        opacity: 0.4,
                      },
                      '30%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                    },
                  }}
                />
                <Box
                  sx={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    bg: 'fg.muted',
                    animation: 'typingPulse 1.4s ease-in-out infinite',
                    animationDelay: '0.4s',
                    '@keyframes typingPulse': {
                      '0%, 60%, 100%': {
                        transform: 'scale(0.6)',
                        opacity: 0.4,
                      },
                      '30%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                    },
                  }}
                />
              </Box>
            </Box>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </>
    );
  };

  // Render protocol mode input
  const renderProtocolInput = () => {
    const availableTools = configQuery.data?.builtinTools || [];
    const models = availableModels || configQuery.data?.models || [];

    return (
      <Box>
        {/* Input Area */}
        <Box
          sx={{
            p: padding,
            borderTop: '1px solid',
            borderColor: 'border.default',
            bg: 'canvas.subtle',
          }}
        >
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => {
                setInput(e.target.value);
                // Height adjustment happens via useEffect watching input
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || 'Type a message...'}
              disabled={isLoading}
              sx={{
                flex: 1,
                resize: 'none',
                minHeight: '40px',
                maxHeight: '120px',
                overflow: 'hidden',
                transition: 'height 0.1s ease-out',
              }}
              rows={1}
            />
            {isLoading ? (
              <IconButton
                icon={SquareCircleIcon}
                aria-label="Stop"
                onClick={handleStop}
                sx={{ alignSelf: 'flex-end' }}
              />
            ) : (
              <IconButton
                icon={PaperAirplaneIcon}
                aria-label="Send"
                onClick={handleSend}
                disabled={!input.trim()}
                sx={{ alignSelf: 'flex-end' }}
              />
            )}
          </Box>
        </Box>

        {/* Token usage bar - between input and selectors */}
        {renderTokenUsage()}

        {/* Model, Skills, and Tools Footer - Below Input */}
        {(showModelSelector || showToolsMenu || showSkillsMenu) &&
          (configQuery.data || skillsQuery.data) && (
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                px: padding,
                py: 1,
                borderTop: '1px solid',
                borderColor: 'border.default',
                alignItems: 'center',
                bg: 'canvas.subtle',
              }}
            >
              {/* Tools Menu */}
              {showToolsMenu && (
                <ActionMenu>
                  <ActionMenu.Anchor>
                    <Button
                      type="button"
                      variant="invisible"
                      size="small"
                      leadingVisual={ToolsIcon}
                    >
                      <Text sx={{ fontSize: 0 }}>
                        Tools
                        {getEnabledMcpToolNames().length > 0 &&
                          ` (${getEnabledMcpToolNames().length})`}
                      </Text>
                    </Button>
                  </ActionMenu.Anchor>
                  <ActionMenu.Overlay
                    side="outside-top"
                    align="start"
                    width="large"
                  >
                    <Box
                      sx={{
                        maxHeight: '60vh',
                        overflowY: 'auto',
                      }}
                    >
                      <ActionList>
                        {codemodeEnabled && (
                          <ActionList.Group title="Codemode">
                            <ActionList.Item disabled>
                              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                                MCP tools are accessible via Codemode meta-tools
                                (search_tools, list_tool_names, execute_code).
                              </Text>
                            </ActionList.Item>
                          </ActionList.Group>
                        )}
                        {/* MCP Server Tools */}
                        {configQuery.data?.mcpServers &&
                        configQuery.data.mcpServers.length > 0 ? (
                          // Filter to only show selected servers (if mcpServers was provided)
                          // If mcpServers is empty array, show no servers
                          configQuery.data.mcpServers.filter(
                            server => !mcpServers || isServerSelected(server),
                          ).length > 0 ? (
                            configQuery.data.mcpServers
                              .filter(
                                server =>
                                  !mcpServers || isServerSelected(server),
                              )
                              .map(server => {
                                const serverTools = enabledMcpTools.get(
                                  server.id,
                                );
                                const allToolNames = server.tools.map(
                                  t => t.name,
                                );
                                const enabledCount = serverTools?.size ?? 0;
                                const allEnabled =
                                  enabledCount === allToolNames.length &&
                                  allToolNames.length > 0;
                                return (
                                  <ActionList.Group
                                    key={server.id}
                                    title={`${server.name}${server.isAvailable ? '' : ' (unavailable)'}`}
                                  >
                                    {/* Server-level toggle */}
                                    {server.isAvailable &&
                                      server.tools.length > 0 && (
                                        <Box
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            px: 3,
                                            py: 2,
                                            borderBottom: '1px solid',
                                            borderColor: 'border.muted',
                                          }}
                                        >
                                          <Text
                                            id={`toggle-all-${server.id}`}
                                            sx={{
                                              fontSize: 0,
                                              fontWeight: 'semibold',
                                              color: 'fg.muted',
                                            }}
                                          >
                                            Enable all ({enabledCount}/
                                            {allToolNames.length})
                                          </Text>
                                          <ToggleSwitch
                                            size="small"
                                            checked={allEnabled}
                                            onClick={() =>
                                              toggleAllMcpServerTools(
                                                server.id,
                                                allToolNames,
                                                !allEnabled,
                                              )
                                            }
                                            aria-labelledby={`toggle-all-${server.id}`}
                                          />
                                        </Box>
                                      )}
                                    {server.isAvailable &&
                                    server.tools.length > 0 ? (
                                      server.tools.map(tool => {
                                        const isEnabled =
                                          serverTools?.has(tool.name) ?? false;
                                        return (
                                          <Box
                                            key={`${server.id}-${tool.name}`}
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              px: 3,
                                              py: 2,
                                              '&:hover': {
                                                backgroundColor:
                                                  'canvas.subtle',
                                              },
                                            }}
                                          >
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                              <Text
                                                id={`toggle-tool-${server.id}-${tool.name}`}
                                                sx={{ fontWeight: 'semibold' }}
                                              >
                                                {tool.name}
                                              </Text>
                                              {tool.description && (
                                                <Text
                                                  sx={{
                                                    display: 'block',
                                                    fontSize: 0,
                                                    color: 'fg.muted',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                  }}
                                                >
                                                  {tool.description}
                                                </Text>
                                              )}
                                            </Box>
                                            <ToggleSwitch
                                              size="small"
                                              checked={isEnabled}
                                              onClick={() =>
                                                toggleMcpTool(
                                                  server.id,
                                                  tool.name,
                                                )
                                              }
                                              aria-labelledby={`toggle-tool-${server.id}-${tool.name}`}
                                            />
                                          </Box>
                                        );
                                      })
                                    ) : server.isAvailable ? (
                                      <ActionList.Item disabled>
                                        <Text
                                          sx={{
                                            color: 'fg.muted',
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          No tools discovered
                                        </Text>
                                      </ActionList.Item>
                                    ) : (
                                      <ActionList.Item disabled>
                                        <Text
                                          sx={{
                                            color: 'fg.muted',
                                            fontStyle: 'italic',
                                          }}
                                        >
                                          Server unavailable
                                        </Text>
                                      </ActionList.Item>
                                    )}
                                  </ActionList.Group>
                                );
                              })
                          ) : (
                            <ActionList.Group title="MCP Servers">
                              <ActionList.Item disabled>
                                <Text
                                  sx={{
                                    color: 'fg.muted',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  No MCP servers selected
                                </Text>
                              </ActionList.Item>
                            </ActionList.Group>
                          )
                        ) : (
                          <ActionList.Group title="Available Tools">
                            {availableTools.length > 0 ? (
                              availableTools.map(tool => (
                                <ActionList.Item key={tool.id} disabled>
                                  <ActionList.LeadingVisual>
                                    <Box
                                      sx={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        backgroundColor: 'success.emphasis',
                                      }}
                                    />
                                  </ActionList.LeadingVisual>
                                  {tool.name}
                                </ActionList.Item>
                              ))
                            ) : (
                              <ActionList.Item disabled>
                                <Text
                                  sx={{
                                    color: 'fg.muted',
                                    fontStyle: 'italic',
                                  }}
                                >
                                  No tools available
                                </Text>
                              </ActionList.Item>
                            )}
                          </ActionList.Group>
                        )}
                      </ActionList>
                    </Box>
                  </ActionMenu.Overlay>
                </ActionMenu>
              )}

              {/* Skills Menu */}
              {showSkillsMenu && (
                <ActionMenu>
                  <ActionMenu.Anchor>
                    <Button
                      type="button"
                      variant="invisible"
                      size="small"
                      leadingVisual={BriefcaseIcon}
                    >
                      <Text sx={{ fontSize: 0 }}>
                        Skills
                        {enabledSkills.size > 0 && ` (${enabledSkills.size})`}
                      </Text>
                    </Button>
                  </ActionMenu.Anchor>
                  <ActionMenu.Overlay
                    side="outside-top"
                    align="start"
                    width="large"
                  >
                    <Box
                      sx={{
                        maxHeight: '60vh',
                        overflowY: 'auto',
                      }}
                    >
                      <ActionList>
                        {skillsQuery.isLoading ? (
                          <ActionList.Item disabled>
                            <Text sx={{ color: 'fg.muted' }}>
                              Loading skills...
                            </Text>
                          </ActionList.Item>
                        ) : skillsQuery.data?.skills &&
                          skillsQuery.data.skills.length > 0 ? (
                          <>
                            {/* Enable all toggle */}
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                px: 3,
                                py: 2,
                                borderBottom: '1px solid',
                                borderColor: 'border.muted',
                              }}
                            >
                              <Text
                                id="toggle-all-skills"
                                sx={{
                                  fontSize: 0,
                                  fontWeight: 'semibold',
                                  color: 'fg.muted',
                                }}
                              >
                                Enable all ({enabledSkills.size}/
                                {skillsQuery.data.skills.length})
                              </Text>
                              <ToggleSwitch
                                size="small"
                                checked={
                                  enabledSkills.size ===
                                  skillsQuery.data.skills.length
                                }
                                onClick={() =>
                                  toggleAllSkills(
                                    skillsQuery.data!.skills.map(s => s.id),
                                    enabledSkills.size !==
                                      skillsQuery.data!.skills.length,
                                  )
                                }
                                aria-labelledby="toggle-all-skills"
                              />
                            </Box>
                            {skillsQuery.data.skills.map(skill => (
                              <Box
                                key={skill.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  px: 3,
                                  py: 2,
                                  '&:hover': {
                                    backgroundColor: 'canvas.subtle',
                                  },
                                }}
                              >
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Text
                                    id={`toggle-skill-${skill.id}`}
                                    sx={{ fontWeight: 'semibold' }}
                                  >
                                    {skill.name}
                                  </Text>
                                  {skill.description && (
                                    <Text
                                      sx={{
                                        display: 'block',
                                        fontSize: 0,
                                        color: 'fg.muted',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {skill.description}
                                    </Text>
                                  )}
                                </Box>
                                <ToggleSwitch
                                  size="small"
                                  checked={enabledSkills.has(skill.id)}
                                  onClick={() => toggleSkill(skill.id)}
                                  aria-labelledby={`toggle-skill-${skill.id}`}
                                />
                              </Box>
                            ))}
                          </>
                        ) : (
                          <ActionList.Item disabled>
                            <Text
                              sx={{ color: 'fg.muted', fontStyle: 'italic' }}
                            >
                              No skills available
                            </Text>
                          </ActionList.Item>
                        )}
                      </ActionList>
                    </Box>
                  </ActionMenu.Overlay>
                </ActionMenu>
              )}

              {/* Model Selector */}
              {showModelSelector && models.length > 0 && selectedModel && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                  }}
                >
                  <ActionMenu>
                    <ActionMenu.Anchor>
                      <Button
                        type="button"
                        variant="invisible"
                        size="small"
                        leadingVisual={AiModelIcon}
                        disabled={isA2AProtocol}
                        sx={
                          isA2AProtocol
                            ? { opacity: 0.5, cursor: 'not-allowed' }
                            : undefined
                        }
                      >
                        <Text sx={{ fontSize: 0 }}>
                          {models.find(m => m.id === selectedModel)?.name ||
                            'Select Model'}
                        </Text>
                      </Button>
                    </ActionMenu.Anchor>
                    <ActionMenu.Overlay side="outside-top" align="end">
                      <ActionList selectionVariant="single">
                        {models.map(modelItem => (
                          <ActionList.Item
                            key={modelItem.id}
                            selected={selectedModel === modelItem.id}
                            onSelect={() => setSelectedModel(modelItem.id)}
                            disabled={
                              modelItem.isAvailable === false || isA2AProtocol
                            }
                            sx={
                              modelItem.isAvailable === false
                                ? { color: 'fg.muted' }
                                : undefined
                            }
                          >
                            {modelItem.name}
                            {modelItem.isAvailable === false && (
                              <ActionList.Description variant="block">
                                Missing API key
                              </ActionList.Description>
                            )}
                          </ActionList.Item>
                        ))}
                      </ActionList>
                    </ActionMenu.Overlay>
                  </ActionMenu>
                  {isA2AProtocol && (
                    <Text sx={{ fontSize: 0, color: 'attention.fg', mt: 1 }}>
                      A2A: Model set by agent config
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          )}
      </Box>
    );
  };

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bg: backgroundColor || 'canvas.default',
        borderRadius: borderRadius,
        border: border,
        boxShadow: boxShadow,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      {renderHeader()}

      {/* Error banner */}
      {showErrors && error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: padding,
            bg: 'danger.subtle',
            borderBottom: '1px solid',
            borderColor: 'danger.muted',
          }}
        >
          <AlertIcon size={16} />
          <Text sx={{ color: 'danger.fg', fontSize: 1 }}>{error.message}</Text>
        </Box>
      )}

      {/* Messages area */}
      <Box
        sx={{ flex: 1, flexGrow: 1, overflow: 'auto', bg: 'canvas.default' }}
      >
        {children ? (
          children
        ) : (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minHeight: '100%',
              bg: 'canvas.default',
            }}
          >
            {renderProtocolMessages()}
          </Box>
        )}
      </Box>

      {/* Footer content */}
      {footerContent}

      {/* Input */}
      {showInput && renderProtocolInput()}

      {/* Powered by tag */}
      {showPoweredBy && <PoweredByTag {...poweredByProps} />}
    </Box>
  );
}

// Export types
export type { PoweredByTagProps };

export default ChatBase;
