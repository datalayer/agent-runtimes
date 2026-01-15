/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
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
} from '@primer/react';
import { ToolsIcon } from '@primer/octicons-react';
import { useQuery } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import type { Agent } from '../stores/examplesStore';
import type { Transport, Extension } from '../../components/chat';

/**
 * MCP Server Tool type
 */
export interface MCPServerTool {
  name: string;
  description?: string;
  enabled: boolean;
}

/**
 * MCP Server configuration from backend
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  url?: string;
  enabled: boolean;
  tools: MCPServerTool[];
  command?: string;
  args?: string[];
  isAvailable?: boolean;
  transport?: string;
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

interface AgentConfigurationProps {
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
  enableSkills?: boolean;
  enableCodemode?: boolean;
  selectedMcpServers?: string[];
  onAgentLibraryChange: (library: AgentLibrary) => void;
  onTransportChange: (transport: Transport) => void;
  onExtensionsChange: (extensions: Extension[]) => void;
  onWsUrlChange: (url: string) => void;
  onBaseUrlChange: (url: string) => void;
  onAgentNameChange: (name: string) => void;
  onModelChange: (model: string) => void;
  onAgentSelect: (agentId: string) => void;
  onConnect: () => void;
  onEnableSkillsChange?: (enabled: boolean) => void;
  onEnableCodemodeChange?: (enabled: boolean) => void;
  onSelectedMcpServersChange?: (servers: string[]) => void;
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
  enableSkills = false,
  enableCodemode = false,
  selectedMcpServers = [],
  onAgentLibraryChange,
  onTransportChange,
  onExtensionsChange,
  onWsUrlChange,
  onBaseUrlChange,
  onAgentNameChange,
  onModelChange,
  onAgentSelect,
  onConnect,
  onEnableSkillsChange,
  onEnableCodemodeChange,
  onSelectedMcpServersChange,
}) => {
  // Fetch MCP servers configuration from the backend
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

  const mcpServers = configQuery.data?.mcpServers || [];
  const models = configQuery.data?.models || [];

  // Handle MCP server checkbox change
  const handleMcpServerChange = (serverId: string, checked: boolean) => {
    if (checked) {
      onSelectedMcpServersChange?.([...selectedMcpServers, serverId]);
    } else {
      onSelectedMcpServersChange?.(
        selectedMcpServers.filter(id => id !== serverId),
      );
    }
  };

  // MCP servers are disabled when codemode is enabled
  const mcpServersDisabled = enableCodemode || selectedAgentId !== 'new-agent';

  // Determine which extensions are enabled based on transport
  const isExtensionEnabled = (ext: Extension): boolean => {
    if (selectedAgentId !== 'new-agent') return false;
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
          {agents.map(agent => (
            <Select.Option key={agent.id} value={agent.id}>
              {agent.status === 'running' && '● '}
              {agent.name}
            </Select.Option>
          ))}
        </Select>
        <FormControl.Caption>
          {selectedAgentId === 'new-agent'
            ? 'Configure a new custom agent'
            : 'Selected agent - form fields below are disabled'}
        </FormControl.Caption>
      </FormControl>

      <Box sx={{ display: 'flex', gap: 3, marginBottom: 3 }}>
        <FormControl sx={{ flex: 1 }}>
          <FormControl.Label>Agent Library</FormControl.Label>
          <Select
            value={agentLibrary}
            onChange={e => onAgentLibraryChange(e.target.value as AgentLibrary)}
            disabled={selectedAgentId !== 'new-agent'}
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
            disabled={selectedAgentId !== 'new-agent' || models.length === 0}
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
            disabled={selectedAgentId !== 'new-agent'}
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

      {/* Agent Capabilities Section */}
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
        <Text sx={{ fontSize: 1, fontWeight: 'bold', display: 'block', mb: 2 }}>
          Agent Capabilities
        </Text>
        <Box sx={{ display: 'flex', gap: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Checkbox
              checked={enableSkills}
              disabled={selectedAgentId !== 'new-agent'}
              onChange={e => onEnableSkillsChange?.(e.target.checked)}
            />
            <Box>
              <Text sx={{ fontSize: 1 }}>Agent Skills</Text>
              <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
                Enable reusable skill compositions
              </Text>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Checkbox
              checked={enableCodemode}
              disabled={selectedAgentId !== 'new-agent'}
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
      </Box>

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
          disabled={selectedAgentId !== 'new-agent'}
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

      <FormControl sx={{ marginBottom: 3 }}>
        <FormControl.Label>Agent Name</FormControl.Label>
        <TextInput
          value={agentName}
          onChange={e => onAgentNameChange(e.target.value)}
          disabled={selectedAgentId !== 'new-agent'}
          placeholder="demo-agent"
          sx={{ width: '100%' }}
        />
        <FormControl.Caption>
          The name of the agent to connect to
        </FormControl.Caption>
      </FormControl>

      {/* MCP Servers Section */}
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
          <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>MCP Servers</Text>
          {configQuery.isLoading && <Spinner size="small" />}
        </Box>

        {configQuery.isError && (
          <Flash variant="warning" sx={{ marginBottom: 2 }}>
            <Text sx={{ fontSize: 0 }}>
              Unable to fetch MCP servers. Check that the server is running.
            </Text>
          </Flash>
        )}

        {mcpServers.length === 0 &&
          !configQuery.isLoading &&
          !configQuery.isError && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              No MCP servers configured.
            </Text>
          )}

        {enableCodemode && (
          <Flash variant="warning" sx={{ marginBottom: 2 }}>
            <Text sx={{ fontSize: 0 }}>
              MCP servers are disabled when Codemode is enabled. Codemode
              provides its own tool discovery and execution.
            </Text>
          </Flash>
        )}

        {mcpServers.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mcpServers.map(server => (
              <Box
                key={server.id}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: 2,
                  borderRadius: 1,
                  backgroundColor: 'canvas.subtle',
                  opacity: mcpServersDisabled || !server.isAvailable ? 0.6 : 1,
                }}
              >
                <Checkbox
                  checked={
                    !enableCodemode && selectedMcpServers.includes(server.id)
                  }
                  disabled={mcpServersDisabled || !server.isAvailable}
                  onChange={e =>
                    handleMcpServerChange(server.id, e.target.checked)
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
                    <Label
                      variant={server.isAvailable ? 'success' : 'secondary'}
                      size="small"
                    >
                      {server.isAvailable ? 'Available' : 'Not Available'}
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

      {createError && (
        <Flash variant="danger" sx={{ marginBottom: 3 }}>
          {createError}
        </Flash>
      )}

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
        ) : selectedAgentId === 'new-agent' ? (
          'Create the Agent'
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
