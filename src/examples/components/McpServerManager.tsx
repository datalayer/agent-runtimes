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
  /** True if this server was started at runtime (not from config) */
  isRuntime?: boolean;
}

interface McpServerManagerProps {
  /** Base URL for the API */
  baseUrl: string;
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
 * - View available MCP servers from the catalog
 * - Add/Enable servers from the catalog
 * - Remove/Disable active servers
 * - View runtime-started servers (read-only)
 * - Trigger codemode tool regeneration on changes
 */
export function McpServerManager({
  baseUrl,
  enableCodemode = false,
  selectedServers = [],
  onSelectedServersChange,
  onServersChange,
  disabled = false,
}: McpServerManagerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Fetch catalog servers (available to enable)
  const catalogQuery = useQuery<MCPServer[]>({
    queryKey: ['mcp-catalog', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/mcp/servers/catalog`);
      if (!response.ok) {
        throw new Error('Failed to fetch MCP server catalog');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Fetch active/enabled servers
  const activeQuery = useQuery<MCPServer[]>({
    queryKey: ['mcp-servers', baseUrl],
    queryFn: async () => {
      const response = await fetch(`${baseUrl}/api/v1/mcp/servers`);
      if (!response.ok) {
        throw new Error('Failed to fetch active MCP servers');
      }
      return response.json();
    },
    enabled: !!baseUrl,
    staleTime: 1000 * 30, // 30 seconds
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
      queryClient.invalidateQueries({ queryKey: ['mcp-catalog', baseUrl] });
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
      queryClient.invalidateQueries({ queryKey: ['mcp-catalog', baseUrl] });
      // Notify parent about server changes (for codemode tool regeneration or other updates)
      onServersChange?.();
    },
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  // Separate active servers into supported (from catalog) and runtime servers
  // Then filter to only show selected servers
  const { supportedServers, runtimeServers } = useMemo(() => {
    const active = activeQuery.data || [];
    const supported: MCPServer[] = [];
    const runtime: MCPServer[] = [];

    active.forEach(server => {
      // Only include servers that are in the selectedServers list
      // If selectedServers is empty, show no servers (user has none selected)
      const isSelected = selectedServers.includes(server.id);

      if (server.isRuntime) {
        // For runtime servers, only show if selected
        if (isSelected) {
          runtime.push(server);
        }
      } else {
        // For supported servers, only show if selected
        if (isSelected) {
          supported.push(server);
        }
      }
    });

    return { supportedServers: supported, runtimeServers: runtime };
  }, [activeQuery.data, selectedServers]);

  // Get catalog servers that are not yet enabled
  const availableCatalogServers = useMemo(() => {
    const catalog = catalogQuery.data || [];
    const activeIds = new Set((activeQuery.data || []).map(s => s.id));
    return catalog.filter(server => !activeIds.has(server.id));
  }, [catalogQuery.data, activeQuery.data]);

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
        onSelectedServersChange?.(
          selectedServers.filter(id => id !== serverName),
        );
      }
    },
    [disableMutation, selectedServers, onSelectedServersChange],
  );

  // Handle refreshing the server lists
  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['mcp-servers', baseUrl] });
    queryClient.invalidateQueries({ queryKey: ['mcp-catalog', baseUrl] });
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

  const isLoading = catalogQuery.isLoading || activeQuery.isLoading;
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

      {/* Active/Enabled Servers Section */}
      {!isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Active Servers ({supportedServers.length})
          </Text>

          {supportedServers.length === 0 ? (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              No active MCP servers. Enable servers from the catalog below.
            </Text>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {supportedServers.map(server => (
                <ServerCard
                  key={server.id}
                  server={server}
                  variant="active"
                  disabled={disabled || isMutating}
                  isSelected={selectedServers.includes(server.id)}
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
          )}
        </Box>
      )}

      {/* Runtime Servers Section */}
      {!isLoading && runtimeServers.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            Runtime Servers ({runtimeServers.length})
          </Text>
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            These servers were started at runtime and cannot be removed here.
          </Text>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {runtimeServers.map(server => (
              <ServerCard
                key={server.id}
                server={server}
                variant="runtime"
                disabled={true}
                isSelected={selectedServers.includes(server.id)}
                onSelect={
                  onSelectedServersChange ? handleServerSelect : undefined
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
  variant: 'active' | 'catalog' | 'runtime';
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
            variant === 'runtime' ? 'attention.subtle' : 'accent.subtle',
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
          {variant === 'runtime' && (
            <Label variant="attention" size="small">
              Runtime
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

        {/* Missing env vars warning */}
        {missingEnvVars && (
          <Text sx={{ fontSize: 0, color: 'danger.fg', mb: 1 }}>
            Required: {server.requiredEnvVars!.join(', ')}
          </Text>
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

        {variant === 'runtime' && (
          <Text sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}>
            Read-only
          </Text>
        )}
      </Box>
    </Box>
  );
}

export default McpServerManager;
