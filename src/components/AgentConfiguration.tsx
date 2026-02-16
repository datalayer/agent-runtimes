/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Text,
  TextInput,
  Button,
  FormControl,
  Select,
  Checkbox,
  Spinner,
  Flash,
  Label,
  IconButton,
} from '@primer/react';
import {
  ToolsIcon,
  KeyIcon,
  SyncIcon,
  PlusIcon,
  XIcon,
  LinkExternalIcon,
} from '@primer/octicons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import type { Agent } from '../types/Types';
import { IdentityCard } from './chat/components';
import type { Transport, MCPServerConfig } from './chat/components';
import type { Extension } from './chat/types';
import type { McpServerSelection } from './McpServerManager';
import { IdentityConnect, useIdentity } from '../identity';
import type { OAuthProvider, OAuthProviderConfig, Identity } from '../identity';
import type { MCPServerTool as MCPServerToolType } from '../types/Types';

/**
 * Agent spec entry from the library endpoint.
 */
export interface LibraryAgentSpec {
  id: string;
  name: string;
  description: string;
  tags: string[];
  enabled: boolean;
  emoji?: string | null;
  icon?: string | null;
  color?: string | null;
  skills: string[];
  systemPrompt?: string | null;
  systemPromptCodemodeAddons?: string | null;
  suggestions: string[];
  welcomeMessage?: string | null;
  mcpServers: { name: string; id: string }[];
}

/**
 * Helper: is the selected agent id a library spec?
 */
export const isSpecSelection = (id: string): boolean => id.startsWith('spec:');

/**
 * Helper: extract the spec id from a spec selection value.
 */
export const getSpecId = (id: string): string => id.replace(/^spec:/, '');

/**
 * Props for IdentityConnectWithStatus component
 */
interface IdentityConnectWithStatusProps {
  identityProviders?: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
      config?: Partial<OAuthProviderConfig>;
    };
  };
  disabled?: boolean;
  onConnect?: (identity: Identity) => void;
  onDisconnect?: (provider: OAuthProvider) => void;
}

/**
 * Token-based identity providers that can be connected via API key
 */
const TOKEN_PROVIDERS = [
  {
    provider: 'kaggle' as const,
    name: 'Kaggle',
    description: 'Access Kaggle datasets and notebooks',
    iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
    color: '#20beff',
    helpUrl: 'https://www.kaggle.com/settings/account',
    helpText: 'Get your API key from the Account page',
    placeholder: 'Enter your Kaggle API key',
  },
];

/**
 * Combined component that shows:
 * - Connected identities with token status (from AgentIdentity)
 * - Connect buttons only for providers NOT yet connected (from IdentityConnect)
 * - Token input for token-based providers (Kaggle, etc.)
 */
function IdentityConnectWithStatus({
  identityProviders = {},
  disabled = false,
  onConnect,
  onDisconnect,
}: IdentityConnectWithStatusProps) {
  const { identities, connectWithToken, disconnect } = useIdentity();
  const [expandedTokenProvider, setExpandedTokenProvider] = useState<
    string | null
  >(null);
  const [tokenInput, setTokenInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Get list of connected provider names
  const connectedProviders = useMemo(
    () => new Set(identities.map(id => id.provider)),
    [identities],
  );

  // Get providers that have config and are already connected (OAuth providers)
  // Plus any token-based providers that are connected (no config needed)
  const connectedIdentities = useMemo(() => {
    const providerKeys = Object.keys(identityProviders) as OAuthProvider[];
    return identities.filter(
      id =>
        providerKeys.includes(id.provider as OAuthProvider) ||
        (id.authType === 'token' && id.isConnected),
    );
  }, [identities, identityProviders]);

  // Get OAuth providers that are NOT yet connected
  const unconnectedProviders = useMemo(() => {
    const providerKeys = Object.keys(identityProviders) as OAuthProvider[];
    const unconnected: typeof identityProviders = {};
    for (const provider of providerKeys) {
      if (!connectedProviders.has(provider)) {
        unconnected[provider] = identityProviders[provider];
      }
    }
    return unconnected;
  }, [identityProviders, connectedProviders]);

  // Get token providers that are NOT yet connected
  const unconnectedTokenProviders = useMemo(() => {
    return TOKEN_PROVIDERS.filter(tp => !connectedProviders.has(tp.provider));
  }, [connectedProviders]);

  const hasUnconnected = Object.keys(unconnectedProviders).length > 0;
  const hasUnconnectedToken = unconnectedTokenProviders.length > 0;

  // Check if there's anything to show
  const hasContent =
    connectedIdentities.length > 0 || hasUnconnected || hasUnconnectedToken;

  // Handle token connection
  const handleTokenConnect = useCallback(
    async (provider: string, displayName: string, iconUrl?: string) => {
      if (!tokenInput.trim()) return;

      setIsConnecting(true);
      try {
        const identity = await connectWithToken(provider, tokenInput.trim(), {
          displayName,
          iconUrl,
        });
        onConnect?.(identity);
        setTokenInput('');
        setExpandedTokenProvider(null);
      } catch (err) {
        console.error(`Failed to connect ${provider}:`, err);
      } finally {
        setIsConnecting(false);
      }
    },
    [tokenInput, connectWithToken, onConnect],
  );

  // Handle token disconnect
  const handleTokenDisconnect = useCallback(
    async (provider: string) => {
      try {
        await disconnect(provider);
        onDisconnect?.(provider as OAuthProvider);
      } catch (err) {
        console.error(`Failed to disconnect ${provider}:`, err);
      }
    },
    [disconnect, onDisconnect],
  );

  if (!hasContent) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Show connected identities (both OAuth and token-based) */}
      {connectedIdentities.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {connectedIdentities.map(identity => (
            <IdentityCard
              key={identity.provider}
              identity={identity}
              providerConfig={
                identityProviders?.[identity.provider as OAuthProvider]
              }
              showExpirationDetails={true}
              allowReconnect={!disabled && identity.authType !== 'token'}
              onConnect={onConnect}
              onDisconnect={
                identity.authType === 'token'
                  ? () => handleTokenDisconnect(identity.provider)
                  : onDisconnect
              }
            />
          ))}
        </Box>
      )}

      {/* Show connect buttons for OAuth providers NOT yet connected */}
      {hasUnconnected && (
        <IdentityConnect
          providers={unconnectedProviders}
          layout="list"
          showHeader={false}
          size="medium"
          showDescriptions={true}
          disabled={disabled}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      )}

      {/* Show token-based provider connect options */}
      {hasUnconnectedToken && !disabled && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {unconnectedTokenProviders.map(tp => (
            <Box
              key={tp.provider}
              sx={{
                border: '1px solid',
                borderColor:
                  expandedTokenProvider === tp.provider
                    ? tp.color
                    : 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              {/* Provider header - clickable to expand */}
              <Box
                as="button"
                onClick={() => {
                  setExpandedTokenProvider(
                    expandedTokenProvider === tp.provider ? null : tp.provider,
                  );
                  setTokenInput('');
                }}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: 2,
                  backgroundColor: 'canvas.subtle',
                  border: 'none',
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'canvas.inset',
                  },
                }}
              >
                {tp.iconUrl ? (
                  <img
                    src={tp.iconUrl}
                    alt={tp.name}
                    style={{ width: 20, height: 20 }}
                  />
                ) : (
                  <KeyIcon size={20} />
                )}
                <Box sx={{ flex: 1, textAlign: 'left' }}>
                  <Text sx={{ fontWeight: 'semibold', display: 'block' }}>
                    Connect {tp.name}
                  </Text>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {tp.description}
                  </Text>
                </Box>
                <PlusIcon size={16} />
              </Box>

              {/* Expanded token input */}
              {expandedTokenProvider === tp.provider && (
                <Box sx={{ padding: 3, backgroundColor: 'canvas.default' }}>
                  <Box
                    sx={{
                      mb: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      {tp.helpText}
                    </Text>
                    <Button
                      as="a"
                      href={tp.helpUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="invisible"
                      size="small"
                      leadingVisual={LinkExternalIcon}
                      sx={{ fontSize: 0 }}
                    >
                      Get API Key
                    </Button>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextInput
                      type="password"
                      placeholder={tp.placeholder}
                      value={tokenInput}
                      onChange={e => setTokenInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tokenInput.trim()) {
                          handleTokenConnect(tp.provider, tp.name, tp.iconUrl);
                        }
                      }}
                      sx={{ flex: 1 }}
                      disabled={isConnecting}
                      autoFocus
                    />
                    <Button
                      onClick={() =>
                        handleTokenConnect(tp.provider, tp.name, tp.iconUrl)
                      }
                      disabled={!tokenInput.trim() || isConnecting}
                      variant="primary"
                    >
                      {isConnecting ? <Spinner size="small" /> : 'Connect'}
                    </Button>
                    <IconButton
                      icon={XIcon}
                      aria-label="Cancel"
                      onClick={() => {
                        setExpandedTokenProvider(null);
                        setTokenInput('');
                      }}
                      variant="invisible"
                    />
                  </Box>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * MCP Server Tool type (re-exported from types.ts)
 */
export type MCPServerTool = MCPServerToolType;

export interface SkillOption {
  id: string;
  name: string;
  description?: string;
}

type AgentLibrary = 'pydantic-ai' | 'langchain' | 'jupyter-ai';

// Re-export types
export type { AgentLibrary };
export type { Transport };
export type { Extension };

const AGENT_LIBRARIES: {
  value: AgentLibrary;
  label: string;
  description: string;
  disabled?: boolean;
}[] = [
  {
    value: 'pydantic-ai',
    label: 'Pydantic AI',
    description: 'Type-safe agents with Pydantic models',
  },
  {
    value: 'langchain',
    label: 'LangChain',
    description: 'Complex chains and agent workflows',
    disabled: true,
  },
  {
    value: 'jupyter-ai',
    label: 'Simple AI',
    description: 'Simple notebook integration',
    disabled: true,
  },
];

const TRANSPORTS: { value: Transport; label: string; description: string }[] = [
  {
    value: 'ag-ui',
    label: 'AG-UI',
    description: 'Pydantic AI native UI transport',
  },
  {
    value: 'acp',
    label: 'ACP (Agent Client Protocol)',
    description: 'Standard WebSocket-based transport',
  },
  {
    value: 'vercel-ai',
    label: 'Vercel AI',
    description: 'HTTP streaming with Vercel AI',
  },
  {
    value: 'vercel-ai-jupyter',
    label: 'Vercel AI (Jupyter)',
    description: 'Vercel AI via Jupyter server endpoint',
  },
  {
    value: 'a2a',
    label: 'A2A (Agent-to-Agent)',
    description: 'Inter-agent communication',
  },
];

const EXTENSIONS: { value: Extension; label: string; description: string }[] = [
  {
    value: 'mcp-ui',
    label: 'MCP-UI',
    description: 'MCP UI resources extension',
  },
  {
    value: 'a2ui',
    label: 'A2UI',
    description: 'Agent-to-UI extension',
  },
];

/**
 * AI Model configuration from backend
 */
export interface AIModelConfig {
  id: string;
  name: string;
  builtinTools?: string[];
  requiredEnvVars?: string[];
  isAvailable?: boolean;
}

/**
 * Response from the /api/v1/configure endpoint
 */
interface ConfigResponse {
  models: AIModelConfig[];
  builtinTools: unknown[];
  mcpServers?: MCPServerConfig[];
}

export interface AgentConfigurationProps {
  agentLibrary: AgentLibrary;
  transport: Transport;
  extensions: Extension[];
  wsUrl: string;
  baseUrl: string;
  agentName: string;
  model: string;
  agents: readonly Agent[];
  selectedAgentId: string;
  isCreatingAgent?: boolean;
  createError?: string | null;
  enableCodemode?: boolean;
  allowDirectToolCalls?: boolean;
  enableToolReranker?: boolean;
  useJupyterSandbox?: boolean;
  availableSkills?: SkillOption[];
  selectedSkills?: string[];
  /** Selected MCP servers */
  selectedMcpServers?: McpServerSelection[];
  // Identity configuration
  identityProviders?: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
    };
  };
  onIdentityConnect?: (identity: Identity) => void;
  onIdentityDisconnect?: (provider: OAuthProvider) => void;
  onAgentLibraryChange: (library: AgentLibrary) => void;
  onTransportChange: (transport: Transport) => void;
  onExtensionsChange: (extensions: Extension[]) => void;
  onWsUrlChange: (url: string) => void;
  onBaseUrlChange: (url: string) => void;
  onAgentNameChange: (name: string) => void;
  onModelChange: (model: string) => void;
  onAgentSelect: (agentId: string) => void;
  onConnect: () => void;
  onEnableCodemodeChange?: (enabled: boolean) => void;
  onAllowDirectToolCallsChange?: (enabled: boolean) => void;
  onEnableToolRerankerChange?: (enabled: boolean) => void;
  onUseJupyterSandboxChange?: (enabled: boolean) => void;
  onSelectedSkillsChange?: (skills: string[]) => void;
  /** Callback when MCP server selection changes */
  onSelectedMcpServersChange?: (servers: McpServerSelection[]) => void;
  /** Rich editor mode */
  richEditor?: boolean;
  /** Callback when rich editor changes */
  onRichEditorChange?: (enabled: boolean) => void;
  /** Durable mode */
  durable?: boolean;
  /** Callback when durable changes */
  onDurableChange?: (enabled: boolean) => void;
}

/**
 * Agent Configuration Component
 *
 * Form for configuring agent connection settings.
 */
export const AgentConfiguration: React.FC<AgentConfigurationProps> = ({
  agentLibrary,
  transport,
  extensions,
  wsUrl,
  baseUrl,
  agentName,
  model,
  agents,
  selectedAgentId,
  isCreatingAgent = false,
  createError = null,
  enableCodemode = false,
  allowDirectToolCalls = false,
  enableToolReranker = false,
  useJupyterSandbox = false,
  availableSkills = [],
  selectedSkills = [],
  selectedMcpServers = [],
  identityProviders,
  onIdentityConnect,
  onIdentityDisconnect,
  onAgentLibraryChange,
  onTransportChange,
  onExtensionsChange,
  onWsUrlChange,
  onBaseUrlChange,
  onAgentNameChange,
  onModelChange,
  onAgentSelect,
  onConnect,
  onEnableCodemodeChange,
  onAllowDirectToolCallsChange,
  onEnableToolRerankerChange,
  onUseJupyterSandboxChange,
  onSelectedSkillsChange,
  onSelectedMcpServersChange,
}) => {
  // Fetch general configuration from the backend (models, etc.)
  const configQuery = useQuery<ConfigResponse>({
    queryKey: ['agent-config', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/configure`);
      if (!response.ok) {
        throw new Error('Failed to fetch configuration');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Fetch MCP Config servers from mcp.json (user-defined servers)
  const mcpServersQuery = useQuery<MCPServerConfig[]>({
    queryKey: ['mcp-config', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/mcp/servers/config`);
      if (!response.ok) {
        throw new Error('Failed to fetch MCP config servers');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 1, // 1 minute (refresh more often for running status)
    retry: 1,
  });

  // Fetch agent specs from library
  const libraryQuery = useQuery<LibraryAgentSpec[]>({
    queryKey: ['agent-library', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/agents/library`);
      if (!response.ok) {
        throw new Error('Failed to fetch agent library');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  const librarySpecs = libraryQuery.data || [];

  // The currently selected library spec (if any)
  const selectedSpec = useMemo(() => {
    if (!isSpecSelection(selectedAgentId)) return null;
    const specId = getSpecId(selectedAgentId);
    return librarySpecs.find(s => s.id === specId) || null;
  }, [selectedAgentId, librarySpecs]);

  // When a spec is selected, form behaves like new-agent but with pre-filled values
  const isNewAgentMode =
    selectedAgentId === 'new-agent' || isSpecSelection(selectedAgentId);

  // True when a library spec is selected (fields locked down except Name, URL, Library, Model, Transport, Extensions)
  const isSpecMode = isSpecSelection(selectedAgentId);

  // Fetch skills from the backend (always available, independent of codemode)
  const skillsQuery = useQuery<{ skills: SkillOption[]; total: number }>({
    queryKey: ['agent-skills', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/skills`);
      if (!response.ok) {
        throw new Error('Failed to fetch skills');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Fetch MCP Catalog servers (predefined servers that can be enabled on-demand)
  const catalogServersQuery = useQuery<MCPServerConfig[]>({
    queryKey: ['mcp-catalog', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/mcp/servers/catalog`);
      if (!response.ok) {
        throw new Error('Failed to fetch MCP catalog servers');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Query client for invalidating queries
  const queryClient = useQueryClient();

  // Mutation to enable a catalog server
  const enableCatalogServerMutation = useMutation({
    mutationFn: async (serverName: string) => {
      const response = await fetch(
        `${baseUrl}/api/v1/mcp/servers/catalog/${serverName}/enable`,
        { method: 'POST' },
      );
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Failed to enable server');
      }
      return response.json();
    },
    onSuccess: () => {
      // Refresh both config and catalog queries to get updated running status
      queryClient.invalidateQueries({ queryKey: ['mcp-config', baseUrl] });
      queryClient.invalidateQueries({ queryKey: ['mcp-catalog', baseUrl] });
    },
  });

  // Use MCP servers from dedicated query, fallback to configQuery for backwards compatibility
  const configServers =
    mcpServersQuery.data || configQuery.data?.mcpServers || [];
  const catalogServers = catalogServersQuery.data || [];
  const models = configQuery.data?.models || [];
  // Use fetched skills when available, otherwise use passed availableSkills (which may be empty)
  const fetchedSkills = skillsQuery.data?.skills || [];
  const displaySkills =
    fetchedSkills.length > 0 ? fetchedSkills : availableSkills;
  const skillsEnabled = selectedSkills.length > 0;

  const selectedConfigServers = selectedMcpServers
    .filter(s => s.origin === 'config')
    .map(s => s.id);
  const selectedCatalogServers = selectedMcpServers
    .filter(s => s.origin === 'catalog')
    .map(s => s.id);

  // Preview servers combines both config and catalog selections
  const previewConfigServers = selectedConfigServers.length
    ? configServers.filter(server => selectedConfigServers.includes(server.id))
    : [];
  const previewCatalogServers = selectedCatalogServers.length
    ? catalogServers.filter(server =>
        selectedCatalogServers.includes(server.id),
      )
    : [];

  // Handle MCP Config server checkbox change
  const handleConfigServerChange = (serverId: string, checked: boolean) => {
    if (!onSelectedMcpServersChange) return;
    if (checked) {
      if (
        !selectedMcpServers.some(
          s => s.id === serverId && s.origin === 'config',
        )
      ) {
        onSelectedMcpServersChange([
          ...selectedMcpServers,
          { id: serverId, origin: 'config' },
        ]);
      }
    } else {
      onSelectedMcpServersChange(
        selectedMcpServers.filter(
          s => !(s.id === serverId && s.origin === 'config'),
        ),
      );
    }
  };

  // Handle MCP Catalog server checkbox change
  // If selected and not running, enable (start) the server first
  const handleCatalogServerChange = async (
    serverId: string,
    checked: boolean,
    isRunning: boolean,
  ) => {
    if (!onSelectedMcpServersChange) return;
    if (checked) {
      // If not running, start the server first
      if (!isRunning) {
        try {
          await enableCatalogServerMutation.mutateAsync(serverId);
        } catch (error) {
          console.error('Failed to enable catalog server:', error);
          return; // Don't add to selection if enable failed
        }
      }
      if (
        !selectedMcpServers.some(
          s => s.id === serverId && s.origin === 'catalog',
        )
      ) {
        onSelectedMcpServersChange([
          ...selectedMcpServers,
          { id: serverId, origin: 'catalog' },
        ]);
      }
    } else {
      onSelectedMcpServersChange(
        selectedMcpServers.filter(
          s => !(s.id === serverId && s.origin === 'catalog'),
        ),
      );
    }
  };

  const handleSkillChange = (skillId: string, checked: boolean) => {
    if (checked) {
      onSelectedSkillsChange?.([...selectedSkills, skillId]);
    } else {
      onSelectedSkillsChange?.(selectedSkills.filter(id => id !== skillId));
    }
  };

  // MCP servers are disabled for existing agents and when a spec is selected
  const mcpServersDisabled = !isNewAgentMode || isSpecMode;

  // Determine which extensions are enabled based on transport
  const isExtensionEnabled = (ext: Extension): boolean => {
    if (!isNewAgentMode) return false;
    if (transport === 'ag-ui') return true; // Both mcp-ui and a2ui enabled
    if (transport === 'a2a') return ext === 'a2ui'; // Only a2ui enabled
    return false; // All others disabled
  };

  // Handle extension checkbox change
  const handleExtensionChange = (ext: Extension, checked: boolean) => {
    if (checked) {
      onExtensionsChange([...extensions, ext]);
    } else {
      onExtensionsChange(extensions.filter(e => e !== ext));
    }
  };

  return (
    <Box
      sx={{
        padding: 3,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        backgroundColor: 'canvas.subtle',
      }}
    >
      <Text
        sx={{
          fontSize: 2,
          fontWeight: 'bold',
          display: 'block',
          marginBottom: 3,
        }}
      >
        Create a new Agent
      </Text>

      <FormControl sx={{ marginBottom: 3 }}>
        <FormControl.Label>Available Agents</FormControl.Label>
        <Select
          value={selectedAgentId}
          onChange={e => onAgentSelect(e.target.value)}
          sx={{ width: '100%' }}
        >
          <Select.Option value="new-agent">+ New Agent...</Select.Option>
          {librarySpecs
            .filter(s => s.enabled)
            .map(spec => (
              <Select.Option key={`spec:${spec.id}`} value={`spec:${spec.id}`}>
                {spec.emoji ? `${spec.emoji} ` : ''}
                {spec.name}
              </Select.Option>
            ))}
          {agents.map(agent => (
            <Select.Option key={agent.id} value={agent.id}>
              {agent.status === 'running' && '● '}
              {agent.name}
            </Select.Option>
          ))}
        </Select>
        <FormControl.Caption>
          {isNewAgentMode
            ? selectedSpec
              ? `Creating from spec: ${selectedSpec.name} — capabilities are locked`
              : 'Configure a new custom agent'
            : 'Selected agent - form fields below are disabled'}
        </FormControl.Caption>
      </FormControl>

      <FormControl sx={{ marginBottom: 3 }}>
        <FormControl.Label>Agent Name</FormControl.Label>
        <TextInput
          value={agentName}
          onChange={e => onAgentNameChange(e.target.value)}
          disabled={!isNewAgentMode}
          placeholder="demo-agent"
          sx={{ width: '100%' }}
        />
        <FormControl.Caption>
          The name of the agent to connect to
        </FormControl.Caption>
      </FormControl>

      <FormControl sx={{ marginBottom: 3 }}>
        <FormControl.Label>
          {transport === 'acp' ? 'WebSocket URL' : 'Base URL'}
        </FormControl.Label>
        <TextInput
          value={transport === 'acp' ? wsUrl : baseUrl}
          onChange={e =>
            transport === 'acp'
              ? onWsUrlChange(e.target.value)
              : onBaseUrlChange(e.target.value)
          }
          disabled={!isNewAgentMode}
          placeholder={
            transport === 'acp'
              ? 'ws://localhost:8000/api/v1/acp/ws'
              : 'http://localhost:8000'
          }
          sx={{ width: '100%' }}
        />
        <FormControl.Caption>
          {transport === 'acp'
            ? 'The WebSocket endpoint of your agent-runtimes server'
            : 'The base URL of your agent-runtimes server'}
        </FormControl.Caption>
      </FormControl>

      <Box sx={{ display: 'flex', gap: 3, marginBottom: 3 }}>
        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Agent Library</FormControl.Label>
          <Select
            value={agentLibrary}
            onChange={e => onAgentLibraryChange(e.target.value as AgentLibrary)}
            disabled={!isNewAgentMode}
            sx={{ width: '100%' }}
          >
            {AGENT_LIBRARIES.map(lib => (
              <Select.Option
                key={lib.value}
                value={lib.value}
                disabled={lib.disabled}
              >
                {lib.label}
                {lib.disabled && ' (Coming Soon)'}
              </Select.Option>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Model</FormControl.Label>
          <Select
            value={model}
            onChange={e => onModelChange(e.target.value)}
            disabled={!isNewAgentMode || models.length === 0}
            sx={{ width: '100%' }}
          >
            {models.length === 0 ? (
              <Select.Option value="">Loading models...</Select.Option>
            ) : (
              models.map(m => (
                <Select.Option
                  key={m.id}
                  value={m.id}
                  disabled={!m.isAvailable}
                >
                  {m.name}
                  {!m.isAvailable && ' (API key required)'}
                </Select.Option>
              ))
            )}
          </Select>
        </FormControl>

        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Transport</FormControl.Label>
          <Select
            value={transport}
            onChange={e => onTransportChange(e.target.value as Transport)}
            disabled={!isNewAgentMode}
            sx={{ width: '100%' }}
          >
            {TRANSPORTS.map(t => (
              <Select.Option key={t.value} value={t.value}>
                {t.label}
              </Select.Option>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Extensions</FormControl.Label>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {EXTENSIONS.map(ext => (
              <Box
                key={ext.value}
                sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <Checkbox
                  value={ext.value}
                  checked={extensions.includes(ext.value)}
                  disabled={!isExtensionEnabled(ext.value)}
                  onChange={e =>
                    handleExtensionChange(ext.value, e.target.checked)
                  }
                />
                <Text>{ext.label}</Text>
              </Box>
            ))}
          </Box>
        </FormControl>
      </Box>

      {/* Identity Providers Section - Always show since token-based providers (Kaggle) are always available */}
      <Box
        sx={{
          marginBottom: 3,
          padding: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          backgroundColor: 'canvas.default',
          opacity: isSpecMode ? 0.6 : 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            marginBottom: 2,
          }}
        >
          <KeyIcon size={16} />
          <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
            Connected Accounts
          </Text>
        </Box>
        <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mb: 3 }}>
          Connect your accounts to give the agent access to external services
          like GitHub repositories, Google services, or Kaggle datasets.
        </Text>

        {/* Show connected identities with token status and connect buttons for unconnected providers */}
        <IdentityConnectWithStatus
          identityProviders={identityProviders}
          disabled={!isNewAgentMode || isSpecMode}
          onConnect={onIdentityConnect}
          onDisconnect={onIdentityDisconnect}
        />
      </Box>

      {/* Agent Capabilities Section */}
      <Box
        sx={{
          marginBottom: 3,
          padding: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          backgroundColor: 'canvas.default',
          opacity: isSpecMode ? 0.6 : 1,
        }}
      >
        <Text sx={{ fontSize: 1, fontWeight: 'bold', display: 'block', mb: 2 }}>
          Agent Capabilities
          {isSpecMode && (
            <Text
              as="span"
              sx={{
                fontSize: 0,
                color: 'fg.muted',
                fontWeight: 'normal',
                ml: 2,
              }}
            >
              — defined by spec
            </Text>
          )}
        </Text>
        <Box sx={{ display: 'flex', gap: 4, opacity: isSpecMode ? 0.6 : 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Checkbox
              checked={enableCodemode}
              disabled={!isNewAgentMode || isSpecMode}
              onChange={e => onEnableCodemodeChange?.(e.target.checked)}
            />
            <Box>
              <Text sx={{ fontSize: 1 }}>Codemode</Text>
              <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                Execute code to compose tools
              </Text>
            </Box>
          </Box>
        </Box>
        {skillsEnabled && enableCodemode && (
          <Flash variant="default" sx={{ mt: 3 }}>
            <Text sx={{ fontSize: 0 }}>
              Skills provide curated capabilities; Codemode composes tools with
              Python for multi-step execution.
            </Text>
          </Flash>
        )}
        {skillsEnabled && !enableCodemode && (
          <Flash variant="default" sx={{ mt: 3 }}>
            <Text sx={{ fontSize: 0 }}>
              Skills will run with a standalone code sandbox for script
              execution. Enable Codemode to compose skills with other tools.
            </Text>
          </Flash>
        )}
        {enableCodemode && (
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Checkbox
                checked={allowDirectToolCalls}
                disabled={!isNewAgentMode || isSpecMode}
                onChange={e => onAllowDirectToolCallsChange?.(e.target.checked)}
              />
              <Box>
                <Text sx={{ fontSize: 1 }}>Allow direct tool calls</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Expose call_tool for simple, single-tool operations
                </Text>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Checkbox
                checked={enableToolReranker}
                disabled={!isNewAgentMode || isSpecMode}
                onChange={e => onEnableToolRerankerChange?.(e.target.checked)}
              />
              <Box>
                <Text sx={{ fontSize: 1 }}>Enable tool reranker</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Reorder search results using the configured reranker
                </Text>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Checkbox
                checked={useJupyterSandbox}
                disabled={!isNewAgentMode || isSpecMode}
                onChange={e => onUseJupyterSandboxChange?.(e.target.checked)}
              />
              <Box>
                <Text sx={{ fontSize: 1 }}>Use Jupyter Sandbox</Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                  Execute code in a Jupyter kernel instead of local-eval
                </Text>
              </Box>
            </Box>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          marginBottom: 3,
          padding: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          backgroundColor: 'canvas.default',
          opacity: isSpecMode ? 0.6 : 1,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            marginBottom: 2,
          }}
        >
          <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
            Skills
            {isSpecMode && (
              <Text
                as="span"
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  fontWeight: 'normal',
                  ml: 2,
                }}
              >
                — defined by spec
              </Text>
            )}
          </Text>
          {skillsQuery.isLoading && <Spinner size="small" />}
          {!skillsQuery.isLoading && (
            <Button
              variant="invisible"
              size="small"
              onClick={() => skillsQuery.refetch()}
              sx={{ padding: 1 }}
              aria-label="Refresh skills"
            >
              <SyncIcon size={14} />
            </Button>
          )}
        </Box>

        {skillsQuery.isError ? (
          <Flash variant="warning" sx={{ marginBottom: 2 }}>
            <Text sx={{ fontSize: 0 }}>
              Unable to fetch skills. Check that the server is running.
            </Text>
          </Flash>
        ) : displaySkills.length === 0 && !skillsQuery.isLoading ? (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            No skills available.
          </Text>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {displaySkills.map(skill => (
              <Box
                key={skill.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  padding: 2,
                  borderRadius: 1,
                  backgroundColor: 'canvas.subtle',
                  opacity: !isNewAgentMode || isSpecMode ? 0.6 : 1,
                }}
              >
                <Checkbox
                  checked={selectedSkills.includes(skill.id)}
                  disabled={!isNewAgentMode || isSpecMode}
                  onChange={e => handleSkillChange(skill.id, e.target.checked)}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Text sx={{ fontWeight: 'semibold' }}>{skill.name}</Text>
                  {skill.description && (
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      {skill.description}
                    </Text>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* MCP Config Servers Section */}
      <Box
        sx={{
          marginBottom: 3,
          padding: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          backgroundColor: 'canvas.default',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            marginBottom: 2,
          }}
        >
          <ToolsIcon size={16} />
          <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
            MCP Config Servers
            {isSpecMode && (
              <Text
                as="span"
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  fontWeight: 'normal',
                  ml: 2,
                }}
              >
                — defined by spec
              </Text>
            )}
          </Text>
          {mcpServersQuery.isLoading && <Spinner size="small" />}
          {!mcpServersQuery.isLoading && (
            <Button
              variant="invisible"
              size="small"
              onClick={() => mcpServersQuery.refetch()}
              sx={{ padding: 1 }}
              aria-label="Refresh MCP config servers"
            >
              <SyncIcon size={14} />
            </Button>
          )}
        </Box>

        <Text sx={{ fontSize: 0, color: 'fg.muted', marginBottom: 2 }}>
          Servers from your mcp.json configuration file. Started automatically.
        </Text>

        {mcpServersQuery.isError && (
          <Flash variant="warning" sx={{ marginBottom: 2 }}>
            <Text sx={{ fontSize: 0 }}>
              Unable to fetch MCP config servers. Check that the server is
              running.
            </Text>
          </Flash>
        )}

        {configServers.length === 0 &&
          !mcpServersQuery.isLoading &&
          !mcpServersQuery.isError && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              No MCP config servers found. Add servers to ~/.datalayer/mcp.json
            </Text>
          )}

        {enableCodemode && (
          <Flash variant="default" sx={{ marginBottom: 2 }}>
            <Text sx={{ fontSize: 0 }}>
              When Codemode is enabled, selected MCP servers are used to build
              the Codemode tool registry (tools are exposed via Codemode meta
              tools like search and execute_code).
            </Text>
          </Flash>
        )}

        {enableCodemode && (
          <Box
            sx={{
              marginBottom: 2,
              padding: 2,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.subtle',
            }}
          >
            <Text
              sx={{ fontSize: 0, fontWeight: 'semibold', display: 'block' }}
            >
              Codemode registry preview
            </Text>
            <Text sx={{ fontSize: 0, color: 'fg.muted', mb: 1 }}>
              {selectedConfigServers.length > 0 ||
              selectedCatalogServers.length > 0
                ? 'Using selected MCP servers'
                : 'No servers selected — select servers to scope Codemode tools.'}
            </Text>
            {previewConfigServers.length > 0 ||
            previewCatalogServers.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {previewConfigServers.map(server => (
                  <Text key={server.id} sx={{ fontSize: 0 }}>
                    {server.name} — {server.tools.length} tools (config)
                  </Text>
                ))}
                {previewCatalogServers.map(server => (
                  <Text key={server.id} sx={{ fontSize: 0 }}>
                    {server.name} — {server.tools?.length || 0} tools (catalog)
                  </Text>
                ))}
              </Box>
            ) : (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                No servers selected.
              </Text>
            )}
            <Text sx={{ fontSize: 0, color: 'fg.muted', mt: 2 }}>
              Exposed meta-tools: list_tool_names, search_tools,
              get_tool_details, list_servers, execute_code, call_tool (optional)
            </Text>
          </Box>
        )}

        {/* Config Servers List */}
        {configServers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {configServers.map(server => (
              <Box
                key={server.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: 2,
                  borderRadius: 1,
                  backgroundColor: 'canvas.subtle',
                  opacity: mcpServersDisabled ? 0.6 : 1,
                }}
              >
                <Checkbox
                  checked={selectedConfigServers.includes(server.id)}
                  disabled={mcpServersDisabled}
                  onChange={e =>
                    handleConfigServerChange(server.id, e.target.checked)
                  }
                />
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    flex: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Text sx={{ fontWeight: 'semibold' }}>{server.name}</Text>
                    <Label variant="success" size="small">
                      Running
                    </Label>
                  </Box>
                  {server.tools.length > 0 && (
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      Tools: {server.tools.map(t => t.name).join(', ')}
                    </Text>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* MCP Catalog Servers Section */}
      {catalogServers.length > 0 && (
        <Box
          sx={{
            marginBottom: 3,
            padding: 3,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            backgroundColor: 'canvas.default',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              marginBottom: 2,
            }}
          >
            <ToolsIcon size={16} />
            <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
              MCP Catalog Servers
            </Text>
          </Box>

          <Text
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              marginBottom: 2,
            }}
          >
            Predefined servers that can be enabled on-demand. Select to start
            and add to your agent.
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {catalogServers.map(server => {
              // If required env vars are not provided, treat as available
              const hasRequiredEnvVars =
                (server.requiredEnvVars?.length || 0) > 0;
              const envVarsAvailable = hasRequiredEnvVars
                ? server.isAvailable === true
                : true;
              const isRunning = server.isRunning === true;
              const canSelect = envVarsAvailable || isRunning;
              return (
                <Box
                  key={server.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 2,
                    padding: 2,
                    borderRadius: 1,
                    backgroundColor: 'canvas.subtle',
                    opacity: mcpServersDisabled || !canSelect ? 0.6 : 1,
                  }}
                >
                  <Checkbox
                    checked={selectedCatalogServers.includes(server.id)}
                    disabled={
                      mcpServersDisabled ||
                      enableCatalogServerMutation.isPending ||
                      !canSelect
                    }
                    onChange={e =>
                      handleCatalogServerChange(
                        server.id,
                        e.target.checked,
                        isRunning,
                      )
                    }
                  />
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      flex: 1,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Text sx={{ fontWeight: 'semibold' }}>{server.name}</Text>
                      {enableCatalogServerMutation.isPending &&
                      enableCatalogServerMutation.variables === server.id ? (
                        <Label variant="accent" size="small">
                          Starting...
                        </Label>
                      ) : server.isRunning ? (
                        <Label variant="success" size="small">
                          Running
                        </Label>
                      ) : (
                        <Label variant="secondary" size="small">
                          Not Started
                        </Label>
                      )}
                      {server.isConfig && (
                        <Label variant="secondary" size="small">
                          From Config
                        </Label>
                      )}
                    </Box>
                    {/* Required environment variables */}
                    {hasRequiredEnvVars ? (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {server.requiredEnvVars?.map(envVar => (
                          <Label
                            key={envVar}
                            variant={envVarsAvailable ? 'success' : 'danger'}
                            size="small"
                          >
                            {envVar}
                          </Label>
                        ))}
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex' }}>
                        <Label variant="success" size="small">
                          No env vars required
                        </Label>
                      </Box>
                    )}
                    {server.tools && server.tools.length > 0 && (
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                        Tools: {server.tools.map(t => t.name).join(', ')}
                      </Text>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {createError && (
        <Flash variant="danger" sx={{ marginBottom: 3 }}>
          {createError}
        </Flash>
      )}

      {/* Rich Editor and Durable toggles - disabled for now */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          marginBottom: 3,
          padding: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
          opacity: 0.6,
        }}
      >
        <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
          Coming Soon
        </Text>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Checkbox checked={false} disabled={true} onChange={() => {}} />
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Rich Editor</Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            — Enable rich text editing with formatting options
          </Text>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Checkbox checked={false} disabled={true} onChange={() => {}} />
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>Durable</Text>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            — Persist agent state across sessions
          </Text>
        </Box>
      </Box>

      <Button
        variant="primary"
        onClick={onConnect}
        disabled={
          isCreatingAgent ||
          !agentName ||
          (transport === 'acp' ? !wsUrl : !baseUrl)
        }
        sx={{ width: '100%' }}
      >
        {isCreatingAgent ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Spinner size="small" />
            <span>Creating Agent...</span>
          </Box>
        ) : isNewAgentMode ? (
          selectedSpec ? (
            `Create from "${selectedSpec.name}"`
          ) : (
            'Create the Agent'
          )
        ) : agents.find(a => a.id === selectedAgentId)?.status === 'running' ? (
          'Connect to the Agent'
        ) : (
          'Start and Connect to the Agent'
        )}
      </Button>
    </Box>
  );
};

export { AGENT_LIBRARIES, TRANSPORTS, EXTENSIONS };
