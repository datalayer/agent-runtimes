/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Text,
  Button,
  Flash,
  Label,
  Spinner,
  IconButton,
  TextInput,
} from '@primer/react';
import {
  ToolsIcon,
  PlusIcon,
  TrashIcon,
  SyncIcon,
  ServerIcon,
  CheckIcon,
  SearchIcon,
} from '@primer/octicons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';

/**
 * MCP Server tool definition
 */
interface MCPServerTool {
  name: string;
  description?: string;
}

/**
 * MCP Server configuration
 */
interface MCPServer {
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
  /** True if this server is from mcp.json config (not in catalog) */
  isConfig?: boolean;
  /** True if this server is currently running */
  isRunning?: boolean;
}

interface McpServerManagerProps {
  /** Base URL for the API */
  baseUrl: string;
  /** Agent ID for updating the running agent's MCP servers */
  agentId?: string;
  /** Whether codemode is enabled - affects tool regeneration on add/remove */
  enableCodemode?: boolean;
  /** Currently selected MCP servers (for selection mode) */
  selectedServers?: string[];
  /** Callback when server selection changes */
  onSelectedServersChange?: (servers: string[]) => void;
  /** Callback when MCP servers are added/removed (for codemode tool regeneration) */
  onServersChange?: () => void;
  /** Whether the manager is disabled (e.g., for existing agents) */
  disabled?: boolean;
}

/**
 * McpServerManager - Manage MCP servers for agent spaces
 *
 * Features:
 * - View MCP Catalog servers (predefined, can be enabled on-demand)
 * - Add/Enable servers from the catalog
 * - Remove/Disable active catalog servers
 * - View MCP Config servers from mcp.json (read-only, auto-started)
 * - Trigger codemode tool regeneration on changes
 */
export function McpServerManager({
  baseUrl,
  agentId,
  enableCodemode = false,
  selectedServers = [],
  onSelectedServersChange,
  onServersChange,
  disabled = false,
}: McpServerManagerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch all available servers (catalog + mcp.json running servers)
  const catalogQuery = useQuery<MCPServer[]>({
    queryKey: ['mcp-available', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/mcp/servers/available`);
      if (!response.ok) {
        throw new Error('Failed to fetch available MCP servers');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Enable server mutation
  const enableMutation = useMutation({
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
      setError(null);
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['mcp-servers', baseUrl] });
      queryClient.invalidateQueries({ queryKey: ['mcp-available', baseUrl] });
      // Notify parent about server changes (for codemode tool regeneration or other updates)
      onServersChange?.();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  // Disable server mutation
  const disableMutation = useMutation({
    mutationFn: async (serverName: string) => {
      const response = await fetch(
        `${baseUrl}/api/v1/mcp/servers/catalog/${serverName}/disable`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Failed to disable server');
      }
    },
    onSuccess: () => {
      setError(null);
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['mcp-servers', baseUrl] });
      queryClient.invalidateQueries({ queryKey: ['mcp-available', baseUrl] });
      // Notify parent about server changes (for codemode tool regeneration or other updates)
      onServersChange?.();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  // Update agent's MCP servers mutation
  const updateAgentMcpServersMutation = useMutation({
    mutationFn: async (newServers: string[]) => {
      if (!agentId) return;
      const response = await fetch(
        `${baseUrl}/api/v1/agents/${agentId}/mcp-servers`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selected_mcp_servers: newServers }),
        },
      );
      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Failed to update agent MCP servers');
      }
      return response.json();
    },
    onSuccess: () => {
      setError(null);
      // Notify parent about server changes
      onServersChange?.();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  // Separate servers into categories based on running status and config flag
  // The /available endpoint returns all servers with isRunning and isConfig flags
  const {
    runningCatalogServers,
    configServers,
    assignedConfigServers,
    assignedCatalogServers,
  } = useMemo(() => {
    const all = catalogQuery.data || [];
    const running: MCPServer[] = [];
    const config: MCPServer[] = [];
    const assignedConfig: MCPServer[] = [];
    const assignedCatalog: MCPServer[] = [];

    all.forEach(server => {
      const isSelected = selectedServers.includes(server.id);

      if (server.isConfig) {
        // mcp.json config servers (only shown if running)
        if (server.isRunning) {
          config.push(server);
          if (isSelected) {
            assignedConfig.push(server);
          }
        }
      } else {
        // Catalog servers - show in running section if running
        if (server.isRunning) {
          running.push(server);
          if (isSelected) {
            assignedCatalog.push(server);
          }
        }
      }
    });

    return {
      runningCatalogServers: running,
      configServers: config,
      assignedConfigServers: assignedConfig,
      assignedCatalogServers: assignedCatalog,
    };
  }, [catalogQuery.data, selectedServers]);

  // Get servers that are not yet running (available to enable)
  // This includes catalog servers that are NOT running and NOT config servers
  const availableCatalogServers = useMemo(() => {
    const all = catalogQuery.data || [];
    // Filter to catalog servers (isConfig=false) that are NOT currently running
    return all.filter(server => !server.isRunning && !server.isConfig);
  }, [catalogQuery.data]);

  // Filter catalog servers by search query
  const filteredCatalogServers = useMemo(() => {
    if (!searchQuery.trim()) return availableCatalogServers;
    const query = searchQuery.toLowerCase();
    return availableCatalogServers.filter(
      server =>
        server.name.toLowerCase().includes(query) ||
        server.id.toLowerCase().includes(query) ||
        server.tools.some(t => t.name.toLowerCase().includes(query)),
    );
  }, [availableCatalogServers, searchQuery]);

  // Handle enabling a server
  const handleEnableServer = useCallback(
    (serverName: string) => {
      enableMutation.mutate(serverName);
    },
    [enableMutation],
  );

  // Handle disabling a server
  const handleDisableServer = useCallback(
    (serverName: string) => {
      disableMutation.mutate(serverName);
      // Also remove from selected servers so the Chat tools menu updates
      if (selectedServers.includes(serverName)) {
        const newServers = selectedServers.filter(id => id !== serverName);
        onSelectedServersChange?.(newServers);
        // Update the running agent's MCP servers
        if (agentId) {
          updateAgentMcpServersMutation.mutate(newServers);
        }
      }
    },
    [
      disableMutation,
      selectedServers,
      onSelectedServersChange,
      agentId,
      updateAgentMcpServersMutation,
    ],
  );

  // Handle removing a server from selection (without disabling it globally)
  const handleRemoveServer = useCallback(
    (serverName: string) => {
      if (selectedServers.includes(serverName)) {
        const newServers = selectedServers.filter(id => id !== serverName);
        onSelectedServersChange?.(newServers);
        // Update the running agent's MCP servers
        if (agentId) {
          updateAgentMcpServersMutation.mutate(newServers);
        }
      }
    },
    [
      selectedServers,
      onSelectedServersChange,
      agentId,
      updateAgentMcpServersMutation,
    ],
  );

  // Handle refreshing the server lists
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', baseUrl] });
    queryClient.invalidateQueries({ queryKey: ['mcp-available', baseUrl] });
  }, [queryClient, baseUrl]);

  // Handle server selection (for agent configuration)
  const handleServerSelect = useCallback(
    (serverId: string, selected: boolean) => {
      if (selected) {
        onSelectedServersChange?.([...selectedServers, serverId]);
      } else {
        onSelectedServersChange?.(
          selectedServers.filter(id => id !== serverId),
        );
      }
    },
    [selectedServers, onSelectedServersChange],
  );

  const isLoading = catalogQuery.isLoading;
  const isMutating = enableMutation.isPending || disableMutation.isPending;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToolsIcon size={16} />
          <Text sx={{ fontWeight: 'semibold' }}>MCP Server Management</Text>
        </Box>
        <IconButton
          icon={SyncIcon}
          aria-label="Refresh server lists"
          size="small"
          onClick={handleRefresh}
          disabled={isLoading || isMutating}
        />
      </Box>

      {/* Error message */}
      {error && (
        <Flash variant="danger">
          <Text sx={{ fontSize: 1 }}>{error}</Text>
        </Flash>
      )}

      {/* Codemode notice */}
      {enableCodemode && (
        <Flash variant="default">
          <Text sx={{ fontSize: 0 }}>
            <strong>Codemode enabled:</strong> Adding or removing MCP servers
            will regenerate the Codemode tool registry.
          </Text>
        </Flash>
      )}

      {/* Loading state */}
      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 3 }}>
          <Spinner size="small" />
          <Text sx={{ color: 'fg.muted' }}>Loading MCP servers...</Text>
        </Box>
      )}

      {/* Assigned Configured Servers Section (selected servers from mcp.json) */}
      {!isLoading && assignedConfigServers.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Assigned Configured Servers ({assignedConfigServers.length})
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            These servers are from ~/.datalayer/mcp.json and assigned to this
            agent.
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {assignedConfigServers.map(server => (
              <ServerCard
                key={server.id}
                server={server}
                variant="config"
                disabled={disabled}
                isSelected={true}
                onSelect={
                  onSelectedServersChange ? handleServerSelect : undefined
                }
                onRemove={() => handleRemoveServer(server.id)}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Assigned Catalog Servers Section (selected servers from catalog) */}
      {!isLoading && assignedCatalogServers.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Assigned Catalog Servers ({assignedCatalogServers.length})
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {assignedCatalogServers.map(server => (
              <ServerCard
                key={server.id}
                server={server}
                variant="active"
                disabled={disabled || isMutating}
                isSelected={true}
                onSelect={
                  onSelectedServersChange ? handleServerSelect : undefined
                }
                onRemove={() => handleDisableServer(server.id)}
                isRemoving={
                  disableMutation.isPending &&
                  disableMutation.variables === server.id
                }
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Catalog Servers Section */}
      {!isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Available from Catalog ({availableCatalogServers.length})
          </Text>

          {/* Search input */}
          {availableCatalogServers.length > 3 && (
            <TextInput
              leadingVisual={SearchIcon}
              placeholder="Search servers..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              sx={{ width: '100%' }}
            />
          )}

          {filteredCatalogServers.length === 0 ? (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              {searchQuery
                ? 'No servers match your search.'
                : 'All catalog servers are already enabled.'}
            </Text>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredCatalogServers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  variant="catalog"
                  disabled={disabled || isMutating}
                  onAdd={() => handleEnableServer(server.id)}
                  isAdding={
                    enableMutation.isPending &&
                    enableMutation.variables === server.id
                  }
                />
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * ServerCard - Display a single MCP server with actions
 */
interface ServerCardProps {
  server: MCPServer;
  variant: 'active' | 'catalog' | 'config';
  disabled?: boolean;
  isSelected?: boolean;
  onSelect?: (serverId: string, selected: boolean) => void;
  onAdd?: () => void;
  onRemove?: () => void;
  isAdding?: boolean;
  isRemoving?: boolean;
}

function ServerCard({
  server,
  variant,
  disabled = false,
  isSelected = false,
  onSelect,
  onAdd,
  onRemove,
  isAdding = false,
  isRemoving = false,
}: ServerCardProps) {
  // Check availability based on isAvailable field from the server
  const isAvailable = server.isAvailable !== false;
  const missingEnvVars =
    !isAvailable && server.requiredEnvVars && server.requiredEnvVars.length > 0;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        padding: 2,
        borderRadius: 2,
        backgroundColor: 'canvas.subtle',
        border: '1px solid',
        borderColor: isSelected ? 'accent.emphasis' : 'border.default',
        opacity: disabled || !isAvailable ? 0.6 : 1,
        cursor: onSelect && !disabled && isAvailable ? 'pointer' : 'default',
      }}
      onClick={() => {
        if (onSelect && !disabled && isAvailable) {
          onSelect(server.id, !isSelected);
        }
      }}
    >
      {/* Server icon */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 2,
          backgroundColor:
            variant === 'config' ? 'attention.subtle' : 'accent.subtle',
          flexShrink: 0,
        }}
      >
        <ServerIcon size={16} />
      </Box>

      {/* Server info */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            {server.name}
          </Text>

          {/* Status labels */}
          {variant === 'active' && (
            <Label variant="success" size="small">
              Active
            </Label>
          )}
          {variant === 'config' && (
            <Label variant="attention" size="small">
              Config
            </Label>
          )}
          {!isAvailable && (
            <Label variant="danger" size="small">
              Missing env vars
            </Label>
          )}
          {isSelected && (
            <Label variant="accent" size="small">
              <CheckIcon size={12} /> Selected
            </Label>
          )}
        </Box>

        {/* Description */}
        {server.description && (
          <Text sx={{ fontSize: 0, color: 'fg.muted', mb: 1 }}>
            {server.description}
          </Text>
        )}

        {/* Missing env vars warning - show required env vars so user can fix */}
        {missingEnvVars && (
          <Box
            sx={{
              fontSize: 0,
              color: 'danger.fg',
              mb: 1,
              p: 1,
              bg: 'danger.subtle',
              borderRadius: 1,
            }}
          >
            <Text sx={{ fontWeight: 'semibold', display: 'block', mb: 1 }}>
              Missing environment variables:
            </Text>
            {server.requiredEnvVars!.map(envVar => (
              <Text
                key={envVar}
                as="code"
                sx={{
                  display: 'inline-block',
                  mr: 1,
                  mb: 1,
                  px: 1,
                  py: '2px',
                  bg: 'canvas.default',
                  borderRadius: 1,
                  fontFamily: 'mono',
                  fontSize: 0,
                }}
              >
                {envVar}
              </Text>
            ))}
          </Box>
        )}

        {/* Tools list */}
        {server.tools.length > 0 && (
          <Text
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Tools: {server.tools.map(t => t.name).join(', ')}
          </Text>
        )}

        {/* Transport info */}
        {server.transport && (
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            Transport: {server.transport}
          </Text>
        )}
      </Box>

      {/* Actions */}
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
      >
        {variant === 'catalog' && onAdd && (
          <Button
            variant="primary"
            size="small"
            leadingVisual={isAdding ? Spinner : PlusIcon}
            onClick={e => {
              e.stopPropagation();
              onAdd();
            }}
            disabled={disabled || !isAvailable || isAdding}
          >
            Add
          </Button>
        )}

        {variant === 'active' && onRemove && (
          <Button
            variant="danger"
            size="small"
            leadingVisual={isRemoving ? Spinner : TrashIcon}
            onClick={e => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={disabled || isRemoving}
          >
            Remove
          </Button>
        )}

        {variant === 'config' && onRemove && (
          <Button
            variant="danger"
            size="small"
            leadingVisual={isRemoving ? Spinner : TrashIcon}
            onClick={e => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={disabled || isRemoving}
          >
            Remove
          </Button>
        )}

        {variant === 'config' && !onRemove && (
          <Text sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}>
            Auto-started from mcp.json
          </Text>
        )}
      </Box>
    </Box>
  );
}

export default McpServerManager;
