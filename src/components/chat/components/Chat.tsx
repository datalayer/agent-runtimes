/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat - A transport-agnostic chat component.
 *
 * This component provides a unified interface for multiple agent transports,
 * automatically configuring the appropriate inference provider and transport adapter.
 *
 * Supported transports:
 * - ACP (Agent Client Protocol) - WebSocket-based with JSON-RPC 2.0
 * - AG-UI - Pydantic AI's POST-based transport
 * - A2A (Agent-to-Agent) - JSON-RPC for inter-agent communication
 * - Vercel AI - HTTP/SSE streaming (via SelfHostedInferenceProvider)
 * - Vercel AI Jupyter - Same as Vercel AI but served by Jupyter server
 *
 * @module components/chat/components/Chat
 */

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, Button, Spinner } from '@primer/react';
import { AlertIcon, SyncIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ChatBase, type Suggestion } from './base/ChatBase';
import { AgentDetails } from './AgentDetails';
import type {
  ProtocolConfig,
  ModelConfig,
  ChatViewMode,
} from './base/ChatBase';
import type { FrontendToolDefinition } from '../types/tool';
import type { McpServerSelection } from '../types';
import { useConnectedIdentities } from '../../../identity';
import type {
  OAuthProvider,
  OAuthProviderConfig,
  Identity,
} from '../../../identity';

// Try to get Jupyter settings if available
let getJupyterSettings: (() => { baseUrl: string; token: string }) | undefined;
try {
  // Dynamic import to avoid hard dependency on JupyterLab
  const ServerConnection = require('@jupyterlab/services').ServerConnection;
  getJupyterSettings = () => {
    const settings = ServerConnection.makeSettings();
    return {
      baseUrl: settings.baseUrl,
      token: settings.token || '',
    };
  };
} catch {
  // JupyterLab not available, try to read from page config
  try {
    const configEl = document.getElementById('jupyter-config-data');
    if (configEl) {
      const config = JSON.parse(configEl.textContent || '{}');
      if (config.baseUrl) {
        getJupyterSettings = () => ({
          baseUrl: config.baseUrl,
          token: config.token || '',
        });
      }
    }
  } catch {
    // No Jupyter config available
  }
}

// Shared QueryClient for AgentDetails and ChatBase
const queryClient = new QueryClient();

/**
 * Supported transports (communication transports)
 */
export type Transport =
  | 'ag-ui'
  | 'a2a'
  | 'acp'
  | 'vercel-ai'
  | 'vercel-ai-jupyter';

/**
 * Extension type for chat features
 */
export type Extension = 'mcp-ui' | 'a2ui';

/**
 * Get transport endpoint path
 */
function getEndpointPath(transport: Transport, agentId?: string): string {
  switch (transport) {
    case 'vercel-ai':
      return `/api/v1/vercel-ai/${agentId}`;
    case 'vercel-ai-jupyter':
      // Jupyter server endpoint - same protocol as vercel-ai
      // Note: no leading slash - will be joined with baseUrl that may have trailing slash
      return 'agent_runtimes/chat';
    case 'ag-ui':
      return `/api/v1/ag-ui/${agentId}/`;
    case 'a2a':
      // A2A requires trailing slash for FastA2A compatibility
      return `/api/v1/a2a/agents/${agentId}/`;
    case 'acp':
      return `/api/v1/acp/ws/${agentId}`;
    default:
      return `/api/v1/agents/${agentId}/chat`;
  }
}

/**
 * Map transport type to protocol type
 */
function getProtocolType(
  transport: Transport,
): 'ag-ui' | 'a2a' | 'acp' | 'vercel-ai' {
  switch (transport) {
    case 'vercel-ai-jupyter':
      return 'vercel-ai';
    default:
      return transport;
  }
}

/**
 * Chat props
 */
export interface ChatProps {
  /** Transport to use */
  transport: Transport;

  /** Extensions for chat features */
  extensions?: Extension[];

  /** Base URL of the server (for HTTP-based protocols) */
  baseUrl?: string;

  /** WebSocket URL (for WebSocket-based protocols like ACP) */
  wsUrl?: string;

  /** Agent ID */
  agentId?: string;

  /** Custom placeholder text */
  placeholder?: string;

  /** Custom title */
  title?: string;

  /** Whether to auto-connect on mount */
  autoConnect?: boolean;

  /** Whether to use streaming (for protocols that support it) */
  streaming?: boolean;

  /** Callback when a message is sent */
  onMessageSent?: (content: string) => void;

  /** Callback when a response is received */
  onMessageReceived?: (message: unknown) => void;

  /** Callback when disconnect is clicked */
  onDisconnect?: () => void;

  /** Callback when logout is clicked */
  onLogout?: () => void;

  /** Callback when collapse panel is clicked */
  onCollapsePanel?: () => void;

  /** Custom styles */
  className?: string;

  /** Height of the chat container */
  height?: string | number;

  /** Show header with connection status */
  showHeader?: boolean;

  /** Show model selector (fetched from /configure endpoint) */
  showModelSelector?: boolean;

  /** Show tools menu (fetched from /configure endpoint) */
  showToolsMenu?: boolean;

  /** Show skills menu (fetched from /skills endpoint) */
  showSkillsMenu?: boolean;

  /** Indicate tools are accessed via Codemode meta-tools */
  codemodeEnabled?: boolean;

  /**
   * Show token usage bar between input and selectors.
   * @default true
   */
  showTokenUsage?: boolean;

  /** Initial model ID to select (e.g., 'openai:gpt-4o-mini') */
  initialModel?: string;

  /**
   * Override the list of available models.
   * When provided, this list replaces the models returned by the config endpoint.
   * Use this to restrict the model selector to a specific subset of models.
   */
  availableModels?: ModelConfig[];

  /** MCP server selections to enable (others will be disabled) */
  mcpServers?: McpServerSelection[];

  /** Initial skill IDs to enable */
  initialSkills?: string[];

  /** Clear messages when component mounts or agentId changes */
  clearOnMount?: boolean;

  /** Suggestions to show in empty state */
  suggestions?: Suggestion[];

  /** Whether to automatically submit the message when a suggestion is clicked */
  submitOnSuggestionClick?: boolean;

  /** Description shown in empty state */
  description?: string;

  /** Auto-focus the input on mount */
  autoFocus?: boolean;

  /** Identity providers configuration for OAuth */
  identityProviders?: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
      config?: Partial<OAuthProviderConfig>;
    };
  };

  /** Callback when identity connects */
  onIdentityConnect?: (identity: Identity) => void;

  /** Callback when identity disconnects */
  onIdentityDisconnect?: (provider: OAuthProvider) => void;

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
   * If not provided, defaults to `{protocol.endpoint}/api/v1/history`.
   */
  historyEndpoint?: string;

  /**
   * A prompt to append and send after the conversation history is loaded.
   * The message is shown in the chat and sent to the agent exactly once.
   */
  pendingPrompt?: string;

  /**
   * Error banner to display at the top of the chat.
   * Use this to show sandbox connection errors or other warnings.
   */
  errorBanner?: {
    message: string;
    variant?: 'danger' | 'warning';
  };

  /**
   * Show the information icon in the header.
   * When clicked, it opens the agent details panel.
   * @default false
   */
  showInformation?: boolean;

  /**
   * Current chat view mode for the header segmented toggle.
   * When provided, a view-mode toggle is rendered in the header.
   */
  chatViewMode?: ChatViewMode;

  /**
   * Callback when the user switches chat view mode via the header toggle.
   */
  onChatViewModeChange?: (mode: ChatViewMode) => void;

  /**
   * Frontend tool definitions to register with the chat.
   * Pass an empty array to explicitly disable all frontend tools.
   */
  frontendTools?: FrontendToolDefinition[];
}

/**
 * Chat Component
 *
 * A unified chat interface that supports multiple transports.
 * Uses ChatBase internally for consistent UI and behavior.
 *
 * Note: Different transports connect to different servers:
 * - vercel-ai, vercel-ai-jupyter: Connect to Jupyter server (default: localhost:8888)
 * - ag-ui, acp, a2a: Connect to agent-runtimes server (default: localhost:8765)
 *
 * @example
 * ```tsx
 * // AG-UI Transport (connects to agent-runtimes server)
 * <Chat
 *   transport="ag-ui"
 *   baseUrl="http://localhost:8765"
 *   agentId="demo-agent"
 * />
 *
 * // ACP Transport (WebSocket to agent-runtimes server)
 * <Chat
 *   transport="acp"
 *   wsUrl="ws://localhost:8765/api/v1/acp/ws"
 *   agentId="demo-agent"
 * />
 *
 * // Vercel AI Transport (connects to Jupyter server)
 * <Chat
 *   transport="vercel-ai"
 *   baseUrl="http://localhost:8888"
 *   agentId="demo-agent"
 * />
 *
 * // Vercel AI (Jupyter) Transport with model/tools selection
 * <Chat
 *   transport="vercel-ai-jupyter"
 *   showModelSelector={true}
 *   showToolsMenu={true}
 * />
 * ```
 */
export function Chat({
  transport,
  extensions: _extensions,
  baseUrl = 'http://localhost:8765',
  wsUrl,
  agentId,
  placeholder = 'Type your message...',
  title,
  autoConnect: _autoConnect = true,
  streaming: _streaming = true,
  onMessageSent: _onMessageSent,
  onMessageReceived: _onMessageReceived,
  onDisconnect,
  onLogout: _onLogout,
  onCollapsePanel: _onCollapsePanel,
  className,
  height = '600px',
  showHeader = true,
  showModelSelector = true,
  showToolsMenu = true,
  showSkillsMenu = false,
  codemodeEnabled = false,
  showTokenUsage = true,
  initialModel,
  availableModels,
  mcpServers,
  initialSkills,
  clearOnMount: _clearOnMount = true,
  suggestions,
  submitOnSuggestionClick = true,
  description,
  autoFocus = false,
  identityProviders,
  onIdentityConnect,
  onIdentityDisconnect,
  runtimeId,
  historyEndpoint,
  pendingPrompt,
  errorBanner,
  showInformation = true,
  chatViewMode,
  onChatViewModeChange,
  frontendTools,
}: ChatProps) {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [focusTrigger, setFocusTrigger] = useState(0);

  // Get connected identities to pass to backend for skill execution
  const connectedIdentities = useConnectedIdentities();

  // Map identities to the format expected by ChatBase
  // Filter out identities without tokens (not fully connected)
  const identitiesForChat = useMemo(() => {
    return connectedIdentities
      .filter(identity => identity.token?.accessToken)
      .map(identity => ({
        provider: identity.provider,
        accessToken: identity.token!.accessToken,
      }));
  }, [connectedIdentities]);

  // Focus the input when returning from details view
  useEffect(() => {
    if (!showDetails) {
      // Small delay to ensure the chat view is visible before focusing
      const timer = setTimeout(() => {
        setFocusTrigger(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showDetails]);

  // Build protocol config based on transport
  const protocolConfig = useMemo((): ProtocolConfig | undefined => {
    try {
      let endpoint: string;
      let authToken: string | undefined;
      let options: Record<string, unknown> | undefined;

      switch (transport) {
        case 'vercel-ai-jupyter': {
          // For vercel-ai-jupyter, try to get Jupyter settings
          let jupyterBaseUrl = baseUrl;

          if (getJupyterSettings) {
            try {
              const jupyterSettings = getJupyterSettings();
              jupyterBaseUrl = jupyterSettings.baseUrl;
              if (jupyterSettings.token) {
                authToken = jupyterSettings.token;
                options = {
                  headers: {
                    Authorization: `token ${jupyterSettings.token}`,
                    'X-XSRFToken': jupyterSettings.token,
                  },
                  fetchOptions: {
                    mode: 'cors',
                    credentials: 'include',
                  },
                };
              }
            } catch (err) {
              console.warn('[Chat] Could not get Jupyter settings:', err);
            }
          }

          // Properly join baseUrl and endpoint path
          const endpointPath = getEndpointPath(transport);
          endpoint = jupyterBaseUrl.endsWith('/')
            ? `${jupyterBaseUrl}${endpointPath}`
            : `${jupyterBaseUrl}/${endpointPath}`;
          break;
        }

        case 'acp': {
          endpoint = `${baseUrl}${getEndpointPath(transport, agentId)}`;
          const acpWsUrl =
            wsUrl ||
            `${baseUrl.replace('http', 'ws')}/api/v1/acp/ws/${agentId}`;
          options = { wsUrl: acpWsUrl };
          break;
        }

        default: {
          endpoint = `${baseUrl}${getEndpointPath(transport, agentId)}`;
          break;
        }
      }

      return {
        type: getProtocolType(transport),
        endpoint,
        agentId,
        authToken,
        options,
        // Enable config query for all protocols to fetch models and tools
        enableConfigQuery: true,
        // For Jupyter-based transports, use Jupyter requestAPI (configEndpoint undefined)
        // For FastAPI-based transports, use direct fetch to the configure endpoint
        configEndpoint:
          transport === 'vercel-ai-jupyter'
            ? undefined // Use Jupyter requestAPI
            : `${baseUrl}/api/v1/configure`,
      };
    } catch (err) {
      console.error('[Chat] Error building protocol config:', err);
      setError(err instanceof Error ? err.message : 'Failed to configure');
      return undefined;
    }
  }, [transport, baseUrl, wsUrl, agentId]);

  // Set initialized once protocol config is built
  useEffect(() => {
    if (protocolConfig) {
      setIsInitializing(false);
      setError(null);
    }
  }, [protocolConfig]);

  // Handle reconnect
  const handleReconnect = () => {
    setError(null);
    setIsInitializing(true);
    // Force re-render by toggling initialization
    setTimeout(() => setIsInitializing(false), 100);
  };

  // Handle new chat
  const handleNewChat = () => {
    onDisconnect?.();
  };

  // Render error state
  if (error) {
    return (
      <QueryClientProvider client={queryClient}>
        <Box
          className={className}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height,
            p: 4,
            bg: 'canvas.default',
          }}
        >
          <AlertIcon size={48} />
          <Text sx={{ mt: 3, color: 'danger.fg', fontSize: 2 }}>
            Connection Error
          </Text>
          <Text sx={{ mt: 1, color: 'fg.muted', fontSize: 1 }}>{error}</Text>
          <Button
            variant="primary"
            sx={{ mt: 3 }}
            leadingVisual={SyncIcon}
            onClick={handleReconnect}
          >
            Retry
          </Button>
        </Box>
      </QueryClientProvider>
    );
  }

  // Render loading state
  if (isInitializing || !protocolConfig) {
    return (
      <QueryClientProvider client={queryClient}>
        <Box
          className={className}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height,
            p: 4,
            bg: 'canvas.default',
          }}
        >
          <Spinner size="large" />
          <Text sx={{ mt: 3, color: 'fg.muted' }}>
            Connecting to {transport.toUpperCase().replace('-', ' ')} agent...
          </Text>
        </Box>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Box
        className={className}
        sx={{
          position: 'relative',
          height,
          bg: 'canvas.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Agent details view - shown/hidden via CSS to preserve chat state */}
        <Box
          sx={{
            display: showDetails ? 'flex' : 'none',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          <AgentDetails
            name={title || 'AI Agent'}
            protocol={transport}
            url={protocolConfig?.endpoint || baseUrl}
            messageCount={messageCount}
            agentId={agentId}
            apiBase={baseUrl}
            identityProviders={identityProviders}
            onIdentityConnect={onIdentityConnect}
            onIdentityDisconnect={onIdentityDisconnect}
            onBack={() => setShowDetails(false)}
          />
        </Box>
        {/* Chat view - shown/hidden via CSS to preserve message state */}
        <Box
          sx={{
            display: showDetails ? 'none' : 'flex',
            flexDirection: 'column',
            height: '100%',
          }}
        >
          {/* Error banner for sandbox/connection issues */}
          {errorBanner && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 3,
                py: 2,
                bg:
                  errorBanner.variant === 'warning'
                    ? 'attention.subtle'
                    : 'danger.subtle',
                borderBottom: '1px solid',
                borderColor:
                  errorBanner.variant === 'warning'
                    ? 'attention.muted'
                    : 'danger.muted',
              }}
            >
              <AlertIcon
                size={16}
                fill={
                  errorBanner.variant === 'warning'
                    ? 'attention.fg'
                    : 'danger.fg'
                }
              />
              <Text
                sx={{
                  fontSize: 1,
                  color:
                    errorBanner.variant === 'warning'
                      ? 'attention.fg'
                      : 'danger.fg',
                  flex: 1,
                }}
              >
                {errorBanner.message}
              </Text>
            </Box>
          )}
          <ChatBase
            title={title}
            showHeader={showHeader}
            protocol={protocolConfig}
            placeholder={placeholder}
            description={description}
            suggestions={suggestions}
            submitOnSuggestionClick={submitOnSuggestionClick}
            autoFocus={autoFocus}
            runtimeId={runtimeId}
            historyEndpoint={historyEndpoint}
            pendingPrompt={pendingPrompt}
            showInformation={showInformation}
            onInformationClick={() => setShowDetails(true)}
            showModelSelector={showModelSelector}
            showToolsMenu={showToolsMenu}
            showSkillsMenu={showSkillsMenu}
            showTokenUsage={showTokenUsage}
            codemodeEnabled={codemodeEnabled}
            initialModel={initialModel}
            availableModels={availableModels}
            mcpServers={mcpServers}
            initialSkills={initialSkills}
            connectedIdentities={identitiesForChat}
            onNewChat={handleNewChat}
            onMessagesChange={messages => setMessageCount(messages.length)}
            headerButtons={{
              showNewChat: true,
              showClear: true,
              onNewChat: handleNewChat,
            }}
            avatarConfig={{
              showAvatars: true,
            }}
            backgroundColor="canvas.default"
            focusTrigger={focusTrigger}
            chatViewMode={chatViewMode}
            onChatViewModeChange={onChatViewModeChange}
            frontendTools={frontendTools}
          />
        </Box>
      </Box>
    </QueryClientProvider>
  );
}

export default Chat;
