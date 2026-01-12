// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * AgentDetails component - Shows detailed information about the agent
 * including name, protocol, URL, message count, and context details.
 */

import {
  ArrowLeftIcon,
  GlobeIcon,
  CommentDiscussionIcon,
  DatabaseIcon,
  FileIcon,
  ToolsIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import {
  Box,
  Button,
  Heading,
  IconButton,
  Text,
  Label,
  ProgressBar,
  Spinner,
} from '@primer/react';
import { AiAgentIcon } from '@datalayer/icons-react';
import { useQuery } from '@tanstack/react-query';

// Mock context data for display
const MOCK_CONTEXT_DATA = {
  name: 'Context',
  totalTokens: 2520000,
  usedTokens: 1523552,
  children: [
    {
      name: 'Files',
      value: 450000,
      children: [
        { name: 'app.py', value: 125000 },
        { name: 'models.py', value: 98000 },
        { name: 'routes.py', value: 112000 },
        { name: 'utils.py', value: 115000 },
      ],
    },
    {
      name: 'Messages',
      value: 380000,
      children: [
        { name: 'User messages', value: 180000 },
        { name: 'Assistant responses', value: 200000 },
      ],
    },
    {
      name: 'Tools',
      value: 220000,
      children: [
        { name: 'Code execution', value: 95000 },
        { name: 'File operations', value: 75000 },
        { name: 'Search', value: 50000 },
      ],
    },
    {
      name: 'Memory',
      value: 473552,
      children: [
        { name: 'Short term', value: 150000 },
        { name: 'Long term', value: 323552 },
      ],
    },
  ],
};

export interface AgentDetailsProps {
  /** Agent name/title */
  name?: string;
  /** Protocol being used */
  protocol: string;
  /** Endpoint URL */
  url: string;
  /** Number of messages in conversation */
  messageCount: number;
  /** Agent ID */
  agentId?: string;
  /** Callback to go back to chat view */
  onBack: () => void;
}

/**
 * MCP toolsets status response
 */
interface MCPToolsetsStatus {
  initialized: boolean;
  ready_count: number;
  failed_count: number;
  ready_servers: string[];
  failed_servers: Record<string, string>;
}

function getLocalApiBase(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1'
    ? 'http://127.0.0.1:8765'
    : '';
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get icon for context category
 */
function getCategoryIcon(name: string) {
  switch (name.toLowerCase()) {
    case 'files':
      return FileIcon;
    case 'messages':
      return CommentDiscussionIcon;
    case 'tools':
      return ToolsIcon;
    case 'memory':
      return DatabaseIcon;
    default:
      return ClockIcon;
  }
}

/**
 * AgentDetails component displays comprehensive information about the agent.
 */
export function AgentDetails({
  name = 'AI Agent',
  protocol,
  url,
  messageCount,
  agentId,
  onBack,
}: AgentDetailsProps) {
  const contextUsagePercent =
    (MOCK_CONTEXT_DATA.usedTokens / MOCK_CONTEXT_DATA.totalTokens) * 100;

  // Fetch MCP toolsets status
  const { data: mcpStatus, isLoading: mcpLoading } =
    useQuery<MCPToolsetsStatus>({
      queryKey: ['mcp-toolsets-status'],
      queryFn: async () => {
        const apiBase = getLocalApiBase();
        const response = await fetch(
          `${apiBase}/api/v1/configure/mcp-toolsets-status`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch MCP status');
        }
        return response.json();
      },
      refetchInterval: 5000, // Refresh every 5 seconds
    });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bg: 'canvas.default',
        overflow: 'auto',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 3,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <IconButton
          icon={ArrowLeftIcon}
          aria-label="Back to chat"
          variant="invisible"
          onClick={onBack}
        />
        <Heading as="h2" sx={{ fontSize: 3, fontWeight: 'semibold' }}>
          Agent Details
        </Heading>
      </Box>

      {/* Content */}
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Agent Info Section */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            p: 3,
            bg: 'canvas.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Box
            sx={{
              p: 2,
              bg: 'accent.subtle',
              borderRadius: 2,
            }}
          >
            <AiAgentIcon colored size={32} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Heading
              as="h3"
              sx={{ fontSize: 2, fontWeight: 'semibold', mb: 1 }}
            >
              {name}
            </Heading>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Label variant="accent" size="small">
                {protocol.toUpperCase().replace(/-/g, ' ')}
              </Label>
              {agentId && (
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  ID: {agentId}
                </Text>
              )}
            </Box>
          </Box>
        </Box>

        {/* Connection Details */}
        <Box>
          <Heading
            as="h4"
            sx={{
              fontSize: 1,
              fontWeight: 'semibold',
              mb: 2,
              color: 'fg.muted',
            }}
          >
            Connection
          </Heading>
          <Box
            sx={{
              p: 3,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <GlobeIcon size={16} />
              <Text
                sx={{
                  fontSize: 1,
                  fontFamily: 'mono',
                  wordBreak: 'break-all',
                }}
              >
                {url}
              </Text>
            </Box>
          </Box>
        </Box>

        {/* Conversation Stats */}
        <Box>
          <Heading
            as="h4"
            sx={{
              fontSize: 1,
              fontWeight: 'semibold',
              mb: 2,
              color: 'fg.muted',
            }}
          >
            Conversation
          </Heading>
          <Box
            sx={{
              p: 3,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <CommentDiscussionIcon size={16} />
            <Text sx={{ fontSize: 1 }}>
              <Text as="span" sx={{ fontWeight: 'semibold' }}>
                {messageCount}
              </Text>{' '}
              {messageCount === 1 ? 'message' : 'messages'}
            </Text>
          </Box>
        </Box>

        {/* MCP Toolsets Status */}
        <Box>
          <Heading
            as="h4"
            sx={{
              fontSize: 1,
              fontWeight: 'semibold',
              mb: 2,
              color: 'fg.muted',
            }}
          >
            MCP Toolsets
          </Heading>
          <Box
            sx={{
              p: 3,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            {mcpLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Spinner size="small" />
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  Loading MCP status...
                </Text>
              </Box>
            ) : mcpStatus ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Text sx={{ fontSize: 1 }}>
                    <Text as="span" sx={{ fontWeight: 'semibold' }}>
                      {mcpStatus.ready_count}
                    </Text>{' '}
                    ready,{' '}
                    <Text as="span" sx={{ fontWeight: 'semibold' }}>
                      {mcpStatus.failed_count}
                    </Text>{' '}
                    failed
                  </Text>
                </Box>
                {mcpStatus.ready_servers.length > 0 && (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    <Text
                      sx={{
                        fontSize: 0,
                        fontWeight: 'semibold',
                        color: 'fg.muted',
                      }}
                    >
                      Ready:
                    </Text>
                    {mcpStatus.ready_servers.map(server => (
                      <Box
                        key={server}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          pl: 2,
                        }}
                      >
                        <CheckCircleIcon size={16} fill="success.fg" />
                        <Text sx={{ fontSize: 1 }}>{server}</Text>
                      </Box>
                    ))}
                  </Box>
                )}
                {Object.keys(mcpStatus.failed_servers).length > 0 && (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    <Text
                      sx={{
                        fontSize: 0,
                        fontWeight: 'semibold',
                        color: 'fg.muted',
                      }}
                    >
                      Failed:
                    </Text>
                    {Object.entries(mcpStatus.failed_servers).map(
                      ([server, error]) => (
                        <Box
                          key={server}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1,
                            pl: 2,
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <XCircleIcon size={16} fill="danger.fg" />
                            <Text sx={{ fontSize: 1 }}>{server}</Text>
                          </Box>
                          <Text
                            sx={{
                              fontSize: 0,
                              color: 'danger.fg',
                              fontFamily: 'mono',
                              pl: 4,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {error.split('\n')[0]}
                          </Text>
                        </Box>
                      ),
                    )}
                  </Box>
                )}
              </Box>
            ) : (
              <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                Failed to load MCP status
              </Text>
            )}
          </Box>
        </Box>

        {/* Context Usage */}
        <Box>
          <Heading
            as="h4"
            sx={{
              fontSize: 1,
              fontWeight: 'semibold',
              mb: 2,
              color: 'fg.muted',
            }}
          >
            Context Usage
          </Heading>
          <Box
            sx={{
              p: 3,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            {/* Overall progress */}
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                  {formatTokens(MOCK_CONTEXT_DATA.usedTokens)} /{' '}
                  {formatTokens(MOCK_CONTEXT_DATA.totalTokens)} tokens
                </Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {contextUsagePercent.toFixed(0)}%
                </Text>
              </Box>
              <ProgressBar
                progress={contextUsagePercent}
                sx={{ height: 8 }}
                bg={
                  contextUsagePercent > 80
                    ? 'danger.emphasis'
                    : 'accent.emphasis'
                }
              />
            </Box>

            {/* Category breakdown */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {MOCK_CONTEXT_DATA.children.map(category => {
                const CategoryIcon = getCategoryIcon(category.name);
                const categoryPercent =
                  (category.value / MOCK_CONTEXT_DATA.totalTokens) * 100;

                return (
                  <Box
                    key={category.name}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}
                  >
                    <Box sx={{ color: 'fg.muted', width: 20 }}>
                      <CategoryIcon size={16} />
                    </Box>
                    <Text sx={{ fontSize: 1, flex: 1 }}>{category.name}</Text>
                    <Text sx={{ fontSize: 0, color: 'fg.muted', minWidth: 60 }}>
                      {formatTokens(category.value)}
                    </Text>
                    <Box sx={{ width: 80 }}>
                      <ProgressBar
                        progress={categoryPercent}
                        sx={{ height: 4 }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>

        {/* Back button */}
        <Box sx={{ mt: 2 }}>
          <Button variant="primary" onClick={onBack} sx={{ width: '100%' }}>
            Back to Chat
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default AgentDetails;
