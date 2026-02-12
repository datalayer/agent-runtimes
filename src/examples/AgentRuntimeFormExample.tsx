/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { PageLayout, IconButton } from '@primer/react';
import { SidebarCollapseIcon, SidebarExpandIcon } from '@primer/octicons-react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { Blankslate } from '@primer/react/experimental';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { Chat, useChatStore } from '../components/chat';
import type { Transport, Extension, ChatMessage } from '../components/chat';
import { useAgentsStore } from './stores/examplesStore';
import { useIdentity } from '../identity';
import type { OAuthProvider, Identity } from '../identity';
import {
  MockFileBrowser,
  MainContent,
  Header,
  FooterMetrics,
  AgentConfiguration,
  type AgentLibrary,
  type McpServerSelection,
} from '../components';
import { isSpecSelection, getSpecId } from '../components/AgentConfiguration';
import type { LibraryAgentSpec } from '../components/AgentConfiguration';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Types for codemode status
interface SandboxStatus {
  variant: string;
  jupyter_url: string | null;
  jupyter_connected: boolean;
  jupyter_error: string | null;
  sandbox_running: boolean;
  generated_path: string | null;
  skills_path: string | null;
  python_path: string | null;
  /** MCP proxy URL for two-container architecture (tool calls via HTTP) */
  mcp_proxy_url: string | null;
}

interface CodemodeStatusResponse {
  enabled: boolean;
  skills: Array<{ name: string; description: string; tags: string[] }>;
  available_skills: Array<{
    name: string;
    description: string;
    tags: string[];
  }>;
  sandbox: SandboxStatus | null;
}

/**
 * Hook to fetch codemode status and compute Jupyter error banner.
 * Must be used inside QueryClientProvider.
 */
function useJupyterSandboxStatus(
  baseUrl: string,
  isConfigured: boolean,
  enableCodemode: boolean,
  useJupyterSandbox: boolean,
): { message: string; variant: 'danger' | 'warning' } | undefined {
  const { data: codemodeStatus } = useQuery<CodemodeStatusResponse>({
    queryKey: ['codemode-status', baseUrl],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/configure/codemode-status`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch codemode status');
      }
      return response.json();
    },
    enabled: isConfigured && enableCodemode && useJupyterSandbox,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  return React.useMemo(() => {
    if (!isConfigured || !enableCodemode || !useJupyterSandbox) {
      return undefined;
    }

    const sandbox = codemodeStatus?.sandbox;
    if (!sandbox) {
      return undefined;
    }

    // Check if Jupyter variant is selected but not connected
    if (sandbox.variant === 'local-jupyter' && !sandbox.jupyter_connected) {
      return {
        message: sandbox.jupyter_error
          ? `Jupyter Sandbox Error: ${sandbox.jupyter_error}`
          : 'Jupyter Sandbox not connected. Code execution may fail.',
        variant: 'danger' as const,
      };
    }

    return undefined;
  }, [isConfigured, enableCodemode, useJupyterSandbox, codemodeStatus]);
}

/**
 * Chat component wrapper that monitors Jupyter sandbox status.
 * Must be rendered inside QueryClientProvider.
 */
interface ChatWithJupyterStatusProps {
  baseUrl: string;
  isConfigured: boolean;
  enableCodemode: boolean;
  useJupyterSandbox: boolean;
  chatProps: React.ComponentProps<typeof Chat>;
}

function ChatWithJupyterStatus({
  baseUrl,
  isConfigured,
  enableCodemode,
  useJupyterSandbox,
  chatProps,
}: ChatWithJupyterStatusProps) {
  const jupyterErrorBanner = useJupyterSandboxStatus(
    baseUrl,
    isConfigured,
    enableCodemode,
    useJupyterSandbox,
  );

  return <Chat {...chatProps} errorBanner={jupyterErrorBanner} />;
}

// Default configuration - use environment variable if available
// Note: Vercel AI connects to Jupyter server (8888), other protocols connect to agent-runtimes server (8765)
const DEFAULT_WS_URL =
  import.meta.env.VITE_ACP_WS_URL || 'ws://localhost:8765/api/v1/acp/ws';
const DEFAULT_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_AGENT_ID = 'demo-agent';

// GitHub OAuth client ID - set via environment variable for security
// For development, you can create a GitHub OAuth App at:
// https://github.com/settings/developers
const GITHUB_CLIENT_ID =
  import.meta.env.VITE_GITHUB_CLIENT_ID || 'demo-client-id';

// Kaggle API token - set via environment variable
// Get your token at: https://www.kaggle.com/settings/account (API section)
// Download kaggle.json and use the "key" value
const KAGGLE_TOKEN = import.meta.env.VITE_KAGGLE_TOKEN || '';

/**
 * Agent Runtime Example Component
 *
 * Demonstrates the multi-transport, multi-agent architecture of agent-runtimes.
 *
 * Features:
 * - Agent library selection (Pydantic AI, LangChain, Simple AI)
 * - Transport selection (ACP, AG-UI, A2A)
 * - Configurable WebSocket URL and Agent ID
 * - Real-time streaming responses
 * - Permission request handling
 * - Connection state management
 * - **OAuth Identity** - Connect GitHub accounts to give agents access to repositories
 * - **Token Identity** - Connect Kaggle accounts for dataset and notebook access
 *
 * Usage:
 * 1. Start the agent-runtimes server: `npm run start:acp`
 * 2. The UI will automatically connect to the ACP server
 * 3. Select your agent library and transport
 * 4. Enter the WebSocket URL and Agent ID (or use defaults)
 * 5. Connect your GitHub account for repository access
 * 6. Connect your Kaggle account for dataset access
 * 7. Click Connect and start chatting!
 */
/**
 * OAuth provider configuration
 */
interface OAuthProviderInput {
  type: 'oauth';
  clientId: string;
  scopes?: string[];
}

/**
 * Token-based provider configuration
 */
interface TokenProviderInput {
  type: 'token';
  token: string;
  displayName?: string;
  iconUrl?: string;
}

/**
 * Unified identity provider input (OAuth or token-based)
 */
type IdentityProviderInput = OAuthProviderInput | TokenProviderInput;

/**
 * Identity providers configuration map.
 * Supports multiple OAuth providers (github, google, etc.) and
 * multiple token-based providers (kaggle, huggingface, etc.)
 */
type IdentityProvidersInput = {
  [provider: string]: IdentityProviderInput;
};

type AgentRuntimeFormExampleProps = {
  initialWsUrl?: string;
  initialBaseUrl?: string;
  initialAgentName?: string;
  initialAgentLibrary?: AgentLibrary;
  initialTransport?: Transport;
  initialModel?: string;
  initialEnableCodemode?: boolean;
  initialAllowDirectToolCalls?: boolean;
  initialEnableToolReranker?: boolean;
  initialSelectedMcpServers?: McpServerSelection[];
  autoSelectMcpServers?: boolean;
  /**
   * Identity providers configuration.
   * Supports both OAuth and token-based providers.
   *
   * @example
   * ```tsx
   * identityProviders={{
   *   github: { type: 'oauth', clientId: 'xxx', scopes: ['repo'] },
   *   google: { type: 'oauth', clientId: 'yyy' },
   *   kaggle: { type: 'token', token: 'zzz' },
   *   huggingface: { type: 'token', token: 'aaa', displayName: 'HuggingFace' },
   * }}
   * ```
   */
  identityProviders?: IdentityProvidersInput;
  /** @deprecated Use identityProviders instead */
  githubClientId?: string;
  /** @deprecated Use identityProviders instead */
  kaggleToken?: string;
};

const MOCK_SKILLS: { id: string; name: string; description: string }[] = [];
// Skills are now fetched dynamically from the backend API (/api/v1/skills)
// when Codemode is enabled. The AgentConfiguration component handles this.

// Build default identity providers from env vars (backward compatibility)
const DEFAULT_IDENTITY_PROVIDERS: IdentityProvidersInput = {
  ...(GITHUB_CLIENT_ID
    ? {
        github: {
          type: 'oauth' as const,
          clientId: GITHUB_CLIENT_ID,
          scopes: ['read:user', 'user:email', 'repo'],
        },
      }
    : {}),
  ...(KAGGLE_TOKEN
    ? {
        kaggle: {
          type: 'token' as const,
          token: KAGGLE_TOKEN,
          displayName: 'Kaggle',
          iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
        },
      }
    : {}),
};

const AgentRuntimeFormExample: React.FC<AgentRuntimeFormExampleProps> = ({
  initialWsUrl = DEFAULT_WS_URL,
  initialBaseUrl = DEFAULT_BASE_URL,
  initialAgentName = DEFAULT_AGENT_ID,
  initialAgentLibrary = 'pydantic-ai',
  initialTransport = 'ag-ui',
  initialModel = 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  initialEnableCodemode = false,
  initialAllowDirectToolCalls = false,
  initialEnableToolReranker = false,
  initialSelectedMcpServers = [],
  autoSelectMcpServers = false,
  identityProviders = DEFAULT_IDENTITY_PROVIDERS,
  // Deprecated props - merged into identityProviders for backward compat
  githubClientId,
  kaggleToken,
}) => {
  const [wsUrl, setWsUrl] = useState(initialWsUrl);
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl);
  const [agentName, setAgentName] = useState(initialAgentName);
  const [selectedAgentId, setSelectedAgentId] = useState('new-agent');
  const [agentLibrary, setAgentLibrary] =
    useState<AgentLibrary>(initialAgentLibrary);
  const [transport, setTransport] = useState<Transport>(initialTransport);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [model, setModel] = useState(initialModel);
  const [isConfigured, setIsConfigured] = useState(false);

  // Agent capabilities state (moved from Header toggles)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [enableCodemode, setEnableCodemode] = useState(initialEnableCodemode);
  const [useJupyterSandbox, setUseJupyterSandbox] = useState(false);
  const [allowDirectToolCalls, setAllowDirectToolCalls] = useState(
    initialAllowDirectToolCalls,
  );
  const [enableToolReranker, setEnableToolReranker] = useState(
    initialEnableToolReranker,
  );
  const [selectedMcpServers, setSelectedMcpServers] = useState<
    McpServerSelection[]
  >(initialSelectedMcpServers);
  const autoSelectRef = useRef(false);
  const enableSkills = selectedSkills.length > 0;

  // =====================================================================
  // Two-Container Codemode Architecture
  // =====================================================================
  //
  // When Jupyter sandbox is enabled, the architecture uses two containers:
  //
  // ┌─────────────────────────────────────┐  ┌─────────────────────────────────┐
  // │  agent-runtimes (port 8765)         │  │  jupyter server (port 8888)     │
  // │  ┌─────────────────────────────┐    │  │  ┌─────────────────────────┐    │
  // │  │  MCP Servers (stdio)        │    │  │  │  Jupyter Kernel         │    │
  // │  │  - github, filesystem, etc  │◀───┼──┼──│  executes generated     │    │
  // │  └─────────────────────────────┘    │  │  │  Python code            │    │
  // │  ┌─────────────────────────────┐    │  │  └─────────────────────────┘    │
  // │  │  /api/v1/mcp/proxy/*        │    │  │                                 │
  // │  │  HTTP proxy for tool calls  │    │  │  Tool calls go via HTTP to     │
  // │  └─────────────────────────────┘    │  │  agent-runtimes MCP proxy      │
  // └─────────────────────────────────────┘  └─────────────────────────────────┘
  //
  // The backend automatically configures mcp_proxy_url when jupyter_sandbox
  // is provided, defaulting to http://0.0.0.0:8765/api/v1/mcp/proxy
  //
  // =====================================================================

  // Jupyter sandbox URL (used when useJupyterSandbox is true)
  // Can be configured via VITE_JUPYTER_SANDBOX_URL environment variable
  const jupyterSandboxUrl =
    import.meta.env.VITE_JUPYTER_SANDBOX_URL ||
    'http://localhost:8888/api/jupyter-server?token=60c1661cc408f978c309d04157af55c9588ff9557c9380e4fb50785750703da6';

  const handleSelectedServersChange = React.useCallback(
    (newServers: McpServerSelection[]) => {
      const oldServers = selectedMcpServers;

      // Find added and removed servers
      const oldIds = new Set(oldServers.map(s => `${s.id}:${s.origin}`));
      const newIds = new Set(newServers.map(s => `${s.id}:${s.origin}`));

      const added = newServers.filter(s => !oldIds.has(`${s.id}:${s.origin}`));
      const removed = oldServers.filter(
        s => !newIds.has(`${s.id}:${s.origin}`),
      );

      // Add system message about tool changes if there are any
      if ((added.length > 0 || removed.length > 0) && isConfigured) {
        let messageContent = '';

        if (added.length > 0) {
          const addedNames = added.map(s => `${s.id} (${s.origin})`).join(', ');
          messageContent += `🔧 Tools added: ${addedNames}. `;
        }

        if (removed.length > 0) {
          const removedNames = removed
            .map(s => `${s.id} (${s.origin})`)
            .join(', ');
          messageContent += `🔧 Tools removed: ${removedNames}. You no longer have access to these tools.`;
        }

        if (messageContent) {
          const systemMessage: ChatMessage = {
            id: `system-mcp-${Date.now()}`,
            role: 'system',
            content: messageContent.trim(),
            createdAt: new Date(),
          };
          useChatStore.getState().addMessage(systemMessage);
        }
      }

      setSelectedMcpServers(newServers);
    },
    [selectedMcpServers, isConfigured],
  );

  // Merge deprecated props into identityProviders for backward compatibility
  const mergedIdentityProviders = React.useMemo((): IdentityProvidersInput => {
    const merged = { ...identityProviders };

    // Add deprecated githubClientId if provided and not already in config
    if (githubClientId && !merged.github) {
      merged.github = {
        type: 'oauth',
        clientId: githubClientId,
        scopes: ['read:user', 'user:email', 'repo'],
      };
    }

    // Add deprecated kaggleToken if provided and not already in config
    if (kaggleToken && !merged.kaggle) {
      merged.kaggle = {
        type: 'token',
        token: kaggleToken,
        displayName: 'Kaggle',
        iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
      };
    }

    return merged;
  }, [identityProviders, githubClientId, kaggleToken]);

  // Extract OAuth providers for useIdentity hook (token providers are handled separately)
  const oauthProvidersConfig = React.useMemo(() => {
    const providers: {
      [key: string]: { clientId: string; scopes?: string[] };
    } = {};

    for (const [provider, config] of Object.entries(mergedIdentityProviders)) {
      if (config.type === 'oauth') {
        providers[provider] = {
          clientId: config.clientId,
          scopes: config.scopes,
        };
      }
    }

    return Object.keys(providers).length > 0 ? providers : undefined;
  }, [mergedIdentityProviders]);

  // Extract token-based providers for auto-connection
  const tokenProviders = React.useMemo(() => {
    const providers: Array<{
      provider: string;
      token: string;
      displayName?: string;
      iconUrl?: string;
    }> = [];

    for (const [provider, config] of Object.entries(mergedIdentityProviders)) {
      if (config.type === 'token') {
        providers.push({
          provider,
          token: config.token,
          displayName: config.displayName,
          iconUrl: config.iconUrl,
        });
      }
    }

    return providers;
  }, [mergedIdentityProviders]);

  // Identity state - pass OAuth providers to configure them before callback is processed
  const { connectWithToken, isConnected: isIdentityConnected } = useIdentity({
    providers: oauthProvidersConfig,
    autoHandleCallback: true,
  });

  // Track which token providers we've attempted to connect
  const connectedTokenProvidersRef = useRef<Set<string>>(new Set());

  // Auto-connect all token-based providers if available and not already connected
  useEffect(() => {
    for (const { provider, token, displayName, iconUrl } of tokenProviders) {
      // Skip if we've already attempted to connect this provider
      if (connectedTokenProvidersRef.current.has(provider)) {
        continue;
      }

      // Skip if already connected
      if (isIdentityConnected(provider)) {
        connectedTokenProvidersRef.current.add(provider);
        continue;
      }

      // Mark as attempted
      connectedTokenProvidersRef.current.add(provider);

      connectWithToken(provider, token, { displayName, iconUrl })
        .then(() => {
          console.log(
            `[AgentRuntimeFormExample] ${provider} connected with token`,
          );
        })
        .catch(err => {
          console.error(
            `[AgentRuntimeFormExample] Failed to connect ${provider}:`,
            err,
          );
          // Remove from attempted set so we can retry
          connectedTokenProvidersRef.current.delete(provider);
        });
    }
  }, [tokenProviders, connectWithToken, isIdentityConnected]);

  // Handle identity connect/disconnect
  const handleIdentityConnect = useCallback((identity: Identity) => {
    console.log(
      '[AgentRuntimeFormExample] Identity connected:',
      identity.provider,
      identity.userInfo?.name || identity.userInfo?.email,
    );
  }, []);

  const handleIdentityDisconnect = useCallback((provider: OAuthProvider) => {
    console.log('[AgentRuntimeFormExample] Identity disconnected:', provider);
  }, []);

  // Handle codemode change - keep MCP server selections to scope codemode tools
  const handleEnableCodemodeChange = (enabled: boolean) => {
    setEnableCodemode(enabled);
    if (!enabled) {
      setAllowDirectToolCalls(false);
      setEnableToolReranker(false);
      setUseJupyterSandbox(false);
    }
  };

  // UI state
  const [activeSession, setActiveSession] = useState('session-1');
  const [codemode, _] = useState(false);
  const [showContextTree, setShowContextTree] = useState(false);
  const [showNotebook] = useState(true);
  const [leftPaneVisible, setLeftPaneVisible] = useState(true);
  const [rightPaneVisible, setRightPaneVisible] = useState(true);
  const [timeTravel, setTimeTravel] = useState(0);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Get agents and current agent from store
  const agents = useAgentsStore(state => state.agents);
  const currentAgent = useAgentsStore(state =>
    state.getAgentById(selectedAgentId),
  );
  const toggleAgentStatus = useAgentsStore(state => state.toggleAgentStatus);

  // Initialize transport from selected agent on mount
  useEffect(() => {
    if (currentAgent) {
      setTransport(currentAgent.transport);
      setAgentName(currentAgent.id);
    }
  }, [currentAgent]);

  // Auto-select MCP servers for codemode when requested
  useEffect(() => {
    if (!autoSelectMcpServers || autoSelectRef.current) return;
    if (!enableCodemode) return;
    if (selectedMcpServers.length > 0) return;
    if (!baseUrl) return;

    const loadServers = async () => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/configure`);
        if (!response.ok) return;
        const data = await response.json();
        const servers = data?.mcpServers || [];
        const available = servers.filter((s: any) => s.isAvailable);
        if (available.length > 0) {
          setSelectedMcpServers([{ id: available[0].id, origin: 'config' }]);
          autoSelectRef.current = true;
        }
      } catch {
        // no-op
      }
    };

    void loadServers();
  }, [autoSelectMcpServers, enableCodemode, selectedMcpServers, baseUrl]);

  // Track previous MCP servers to detect changes
  const prevMcpServersRef = useRef<McpServerSelection[]>(selectedMcpServers);

  // Cache for library specs (fetched on-demand, outside QueryClientProvider)
  const librarySpecsRef = useRef<LibraryAgentSpec[] | null>(null);

  const fetchLibrarySpecs = useCallback(async (): Promise<
    LibraryAgentSpec[]
  > => {
    if (librarySpecsRef.current) return librarySpecsRef.current;
    try {
      const response = await fetch(`${baseUrl}/api/v1/agents/library`);
      if (!response.ok) return [];
      const data = await response.json();
      librarySpecsRef.current = data;
      return data;
    } catch {
      return [];
    }
  }, [baseUrl]);

  const handleAgentSelect = async (agentId: string) => {
    setSelectedAgentId(agentId);
    setCreateError(null);
    if (agentId === 'new-agent') {
      // Reset to defaults for new agent
      setAgentName(DEFAULT_AGENT_ID);
      setTransport('ag-ui');
    } else if (isSpecSelection(agentId)) {
      // Populate form fields from the selected library spec
      const specId = getSpecId(agentId);
      const specs = await fetchLibrarySpecs();
      const spec = specs.find(s => s.id === specId);
      if (spec) {
        setAgentName(spec.id);
        // Keep current transport, model, agentLibrary - user can override
        if (spec.skills.length > 0) {
          setSelectedSkills(spec.skills);
          setEnableCodemode(true);
        }
        if (spec.systemPromptCodemodeAddons) {
          setEnableCodemode(true);
        }
      }
    } else {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        setAgentName(agent.id);
        setTransport(agent.transport);
      }
    }
  };

  /**
   * Create a new agent via the API
   */
  const createAgentOnServer = useCallback(async (): Promise<string | null> => {
    setIsCreatingAgent(true);
    setCreateError(null);

    try {
      // Resolve spec ID if creating from a library spec
      const specId = isSpecSelection(selectedAgentId)
        ? getSpecId(selectedAgentId)
        : undefined;

      const response = await fetch(`${baseUrl}/api/v1/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: agentName,
          description: `Agent created via UI (${agentLibrary})`,
          agent_library: agentLibrary,
          transport: transport,
          model: model,
          system_prompt: 'You are a helpful AI assistant.',
          enable_skills: enableSkills,
          enable_codemode: enableCodemode,
          allow_direct_tool_calls: allowDirectToolCalls,
          enable_tool_reranker: enableToolReranker,
          selected_mcp_servers: selectedMcpServers,
          skills: selectedSkills,
          jupyter_sandbox: useJupyterSandbox ? jupyterSandboxUrl : undefined,
          ...(specId ? { agent_spec_id: specId } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          errorData.detail || `Failed to create agent: ${response.status}`,
        );
      }

      const data = await response.json();
      console.log('[AgentRuntimeExample] Agent created:', data);
      return data.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create agent';
      console.error(
        '[AgentRuntimeExample] Error creating agent:',
        errorMessage,
      );
      setCreateError(errorMessage);
      return null;
    } finally {
      setIsCreatingAgent(false);
    }
  }, [
    baseUrl,
    agentName,
    agentLibrary,
    transport,
    model,
    enableSkills,
    enableCodemode,
    allowDirectToolCalls,
    enableToolReranker,
    selectedMcpServers,
    selectedSkills,
    useJupyterSandbox,
    jupyterSandboxUrl,
    selectedAgentId,
  ]);

  /**
   * Delete an agent via the API
   */
  const deleteAgentOnServer = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const response = await fetch(`${baseUrl}/api/v1/agents/${agentId}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          console.warn(
            `[AgentRuntimeExample] Failed to delete agent: ${response.status}`,
          );
          return false;
        }

        console.log('[AgentRuntimeExample] Agent deleted:', agentId);
        return true;
      } catch (error) {
        console.warn('[AgentRuntimeExample] Error deleting agent:', error);
        return false;
      }
    },
    [baseUrl],
  );

  // Track MCP servers for reference (no longer triggers recreation)
  // MCP server updates are now handled via PATCH endpoint by McpServerManager
  useEffect(() => {
    prevMcpServersRef.current = selectedMcpServers;
  }, [selectedMcpServers]);

  // True when creating a new agent (blank or from a library spec)
  const isNewMode =
    selectedAgentId === 'new-agent' || isSpecSelection(selectedAgentId);

  const handleConnect = async () => {
    // For existing agents (not new-agent or spec), ensure transport and agentName are set
    if (!isNewMode) {
      const agent = agents.find(a => a.id === selectedAgentId);
      if (agent) {
        setTransport(agent.transport);
        setAgentName(agent.id);
      }
      setIsConfigured(true);
      return;
    }

    // For vercel-ai-jupyter, no server-side agent creation needed
    // It uses Jupyter server's built-in agent endpoint
    if (transport === 'vercel-ai-jupyter') {
      setIsConfigured(true);
      return;
    }

    // For new agents, first create the agent on the server
    if (transport === 'acp' && wsUrl && agentName) {
      const createdAgentId = await createAgentOnServer();
      if (createdAgentId) {
        setAgentName(createdAgentId);
        setIsConfigured(true);
      }
    } else if (
      (transport === 'ag-ui' ||
        transport === 'vercel-ai' ||
        transport === 'a2a') &&
      baseUrl &&
      agentName
    ) {
      const createdAgentId = await createAgentOnServer();
      if (createdAgentId) {
        setAgentName(createdAgentId);
        setIsConfigured(true);
      }
    }
  };

  const handleReset = async () => {
    // Delete the agent from the server if we created it
    if (
      (selectedAgentId === 'new-agent' || isSpecSelection(selectedAgentId)) &&
      agentName
    ) {
      await deleteAgentOnServer(agentName);
    }
    setIsConfigured(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <DatalayerThemeProvider>
        <PageLayout containerWidth="full">
          {/* Header - empty content for new agent */}
          <Header
            activeSession={activeSession}
            agentName={isNewMode ? undefined : currentAgent?.name}
            agentDescription={isNewMode ? undefined : currentAgent?.description}
            agentStatus={currentAgent?.status}
            showContextTree={showContextTree}
            isNewAgent={isNewMode}
            isConfigured={isConfigured}
            onSessionChange={setActiveSession}
            onToggleContextTree={() => setShowContextTree(!showContextTree)}
            onToggleStatus={
              currentAgent
                ? () => toggleAgentStatus(currentAgent.id)
                : undefined
            }
          />

          {/* Pane - Left Panel (File Browser or Blankslate) */}
          {leftPaneVisible ? (
            <>
              <Box
                sx={{
                  position: 'fixed',
                  left: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 100,
                }}
              >
                <IconButton
                  icon={SidebarCollapseIcon}
                  aria-label="Collapse left pane"
                  size="small"
                  onClick={() => setLeftPaneVisible(false)}
                  sx={{
                    borderRadius: '0 6px 6px 0',
                    bg: 'canvas.default',
                    border: '1px solid',
                    borderLeft: 'none',
                    borderColor: 'border.default',
                  }}
                />
              </Box>
              <PageLayout.Pane
                position="start"
                resizable
                sticky
                width={{ min: '250px', default: '300px', max: '90px' }}
              >
                {isNewMode ? (
                  <Blankslate border spacious narrow>
                    <Blankslate.Visual>
                      <AiAgentIcon colored size={48} />
                    </Blankslate.Visual>
                    <Blankslate.Heading>Agent Runtimes</Blankslate.Heading>
                    <Box sx={{ textAlign: 'center' }}>
                      <Blankslate.Description>
                        Expose AI Agents through multiple protocols.
                      </Blankslate.Description>
                    </Box>
                  </Blankslate>
                ) : (
                  <MockFileBrowser codemode={codemode} />
                )}
              </PageLayout.Pane>
            </>
          ) : (
            <Box
              sx={{
                position: 'fixed',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
              }}
            >
              <IconButton
                icon={SidebarExpandIcon}
                aria-label="Expand left pane"
                size="small"
                onClick={() => setLeftPaneVisible(true)}
                sx={{
                  borderRadius: '0 6px 6px 0',
                  bg: 'canvas.default',
                  border: '1px solid',
                  borderLeft: 'none',
                  borderColor: 'border.default',
                }}
              />
            </Box>
          )}

          {/* Content - Main area (Notebook or placeholder) */}
          <PageLayout.Content>
            <MainContent
              showNotebook={showNotebook}
              timeTravel={timeTravel}
              onTimeTravelChange={setTimeTravel}
              richEditor={false}
              notebookFile={currentAgent?.notebookFile}
              lexicalFile={currentAgent?.lexicalFile}
              isNewAgent={isNewMode}
              isConfigured={isConfigured}
              baseUrl={baseUrl}
              agentId={currentAgent?.id || agentName}
              enableCodemode={enableCodemode}
              selectedMcpServers={selectedMcpServers}
              onSelectedMcpServersChange={handleSelectedServersChange}
              onMcpServersChange={() => {
                // Trigger codemode tool regeneration when MCP servers change at runtime
                console.log(
                  '[AgentRuntimeFormExample] MCP servers changed, regenerating codemode tools...',
                );
                // The Chat component will pick up the new selectedMcpServers via props
              }}
            />
          </PageLayout.Content>

          {/* Right Pane - Agent Configuration & Chat */}
          {rightPaneVisible ? (
            <>
              <Box
                sx={{
                  position: 'fixed',
                  right: 0,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 100,
                }}
              >
                <IconButton
                  icon={SidebarCollapseIcon}
                  aria-label="Collapse right pane"
                  size="small"
                  onClick={() => setRightPaneVisible(false)}
                  sx={{
                    borderRadius: '6px 0 0 6px',
                    bg: 'canvas.default',
                    border: '1px solid',
                    borderRight: 'none',
                    borderColor: 'border.default',
                  }}
                />
              </Box>
              <PageLayout.Pane position="end" width="large" resizable sticky>
                <Box
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    p: 2,
                  }}
                >
                  {!isConfigured ? (
                    <AgentConfiguration
                      agentLibrary={agentLibrary}
                      transport={currentAgent?.transport || transport}
                      extensions={extensions}
                      wsUrl={wsUrl}
                      baseUrl={baseUrl}
                      agentName={agentName}
                      model={model}
                      agents={agents}
                      selectedAgentId={selectedAgentId}
                      isCreatingAgent={isCreatingAgent}
                      createError={createError}
                      enableCodemode={enableCodemode}
                      useJupyterSandbox={useJupyterSandbox}
                      allowDirectToolCalls={allowDirectToolCalls}
                      enableToolReranker={enableToolReranker}
                      availableSkills={MOCK_SKILLS}
                      selectedSkills={selectedSkills}
                      selectedMcpServers={selectedMcpServers}
                      identityProviders={oauthProvidersConfig}
                      onIdentityConnect={handleIdentityConnect}
                      onIdentityDisconnect={handleIdentityDisconnect}
                      onAgentLibraryChange={setAgentLibrary}
                      onTransportChange={setTransport}
                      onExtensionsChange={setExtensions}
                      onWsUrlChange={setWsUrl}
                      onBaseUrlChange={setBaseUrl}
                      onAgentNameChange={setAgentName}
                      onModelChange={setModel}
                      onAgentSelect={handleAgentSelect}
                      onConnect={handleConnect}
                      onEnableCodemodeChange={handleEnableCodemodeChange}
                      onUseJupyterSandboxChange={setUseJupyterSandbox}
                      onAllowDirectToolCallsChange={setAllowDirectToolCalls}
                      onEnableToolRerankerChange={setEnableToolReranker}
                      onSelectedSkillsChange={setSelectedSkills}
                      onSelectedMcpServersChange={setSelectedMcpServers}
                    />
                  ) : (
                    /* Chat Interface */
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                      <ChatWithJupyterStatus
                        baseUrl={baseUrl}
                        isConfigured={isConfigured}
                        enableCodemode={enableCodemode}
                        useJupyterSandbox={useJupyterSandbox}
                        chatProps={{
                          transport: currentAgent?.transport || transport,
                          extensions: extensions,
                          wsUrl: wsUrl,
                          baseUrl: baseUrl,
                          agentId: currentAgent?.id || agentName,
                          title:
                            currentAgent?.name || agentName || 'AI Assistant',
                          autoConnect: true,
                          autoFocus: true,
                          placeholder: 'Type your message to the agent...',
                          height: 'calc(100vh - 150px)',
                          showModelSelector: true,
                          showToolsMenu: true,
                          showSkillsMenu: true,
                          codemodeEnabled: enableCodemode,
                          initialModel: model,
                          mcpServers: selectedMcpServers,
                          initialSkills: selectedSkills,
                          identityProviders: oauthProvidersConfig,
                          onIdentityConnect: handleIdentityConnect,
                          onIdentityDisconnect: handleIdentityDisconnect,
                          suggestions: [
                            {
                              title: '👋 Say hello',
                              message:
                                'Hello! What can you help me with today?',
                            },
                            {
                              title: '💡 Get ideas',
                              message:
                                'Can you suggest some creative project ideas?',
                            },
                            {
                              title: '📝 Explain concepts',
                              message: 'Can you explain how AI agents work?',
                            },
                            {
                              title: '🔧 Help with code',
                              message:
                                'Can you help me write some Python code?',
                            },
                          ],
                          onDisconnect: handleReset,
                          onMessageSent: (_content: string) => {
                            // Message sent
                          },
                          onMessageReceived: (_message: unknown) => {
                            // Message received
                          },
                        }}
                      />
                    </Box>
                  )}
                </Box>
              </PageLayout.Pane>
            </>
          ) : (
            <Box
              sx={{
                position: 'fixed',
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 100,
              }}
            >
              <IconButton
                icon={SidebarExpandIcon}
                aria-label="Expand right pane"
                size="small"
                onClick={() => setRightPaneVisible(true)}
                sx={{
                  borderRadius: '6px 0 0 6px',
                  bg: 'canvas.default',
                  border: '1px solid',
                  borderRight: 'none',
                  borderColor: 'border.default',
                }}
              />
            </Box>
          )}

          {/* Footer */}
          <PageLayout.Footer
            divider="line"
            sx={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              bg: 'canvas.default',
              zIndex: 10,
            }}
          >
            {selectedAgentId !== 'new-agent' && (
              <FooterMetrics tokens={1523552} cost={2.01} />
            )}
          </PageLayout.Footer>
        </PageLayout>
      </DatalayerThemeProvider>
    </QueryClientProvider>
  );
};

export default AgentRuntimeFormExample;
