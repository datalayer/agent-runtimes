// Copyright (c) 2025-2026 Datalayer, Inc.
// Distributed under the terms of the Modified BSD License.

/**
 * AgentDetails component - Shows detailed information about the agent
 * including name, protocol, URL, message count, and context details.
 */

import {
  ArrowLeftIcon,
  GlobeIcon,
  CheckCircleIcon,
  XCircleIcon,
  CodeIcon,
  ZapIcon,
} from '@primer/octicons-react';
import {
  Button,
  Heading,
  IconButton,
  Text,
  Label,
  Spinner,
  ToggleSwitch,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ContextPanel } from './ContextPanel';
import { ContextInspector } from './ContextInspector';
import { AgentIdentity } from './AgentIdentity';
import type {
  OAuthProvider,
  OAuthProviderConfig,
  Identity,
} from '../../../identity';

export interface AgentDetailsProps {
  /** Agent name/title */
  name?: string;
  /** Protocol being used */
  protocol: string;
  /** Endpoint URL */
  url: string;
  /** Number of messages in conversation */
  messageCount: number;
  /** Agent ID for context usage tracking */
  agentId?: string;
  /** Identity provider configurations */
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

/**
 * Codemode status response
 */
interface CodemodeStatus {
  enabled: boolean;
  skills: Array<{
    name: string;
    description: string;
    tags: string[];
  }>;
  available_skills: Array<{
    name: string;
    description: string;
    tags: string[];
  }>;
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
 * AgentDetails component displays comprehensive information about the agent.
 */
export function AgentDetails({
  name = 'AI Agent',
  protocol,
  url,
  messageCount,
  agentId,
  identityProviders,
  onIdentityConnect,
  onIdentityDisconnect,
  onBack,
}: AgentDetailsProps) {
  const queryClient = useQueryClient();

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

  // Fetch Codemode status
  const { data: codemodeStatus, isLoading: codemodeLoading } =
    useQuery<CodemodeStatus>({
      queryKey: ['codemode-status'],
      queryFn: async () => {
        const apiBase = getLocalApiBase();
        const response = await fetch(
          `${apiBase}/api/v1/configure/codemode-status`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch Codemode status');
        }
        return response.json();
      },
      refetchInterval: 5000, // Refresh every 5 seconds
    });

  // Mutation to toggle codemode
  const toggleCodemodeMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const apiBase = getLocalApiBase();
      const response = await fetch(
        `${apiBase}/api/v1/configure/codemode/toggle`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ enabled }),
        },
      );
      if (!response.ok) {
        throw new Error('Failed to toggle codemode');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate the codemode status query to refetch
      queryClient.invalidateQueries({ queryKey: ['codemode-status'] });
    },
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
            {agentId && (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>ID: {agentId}</Text>
            )}
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
              <Label variant="accent" size="small">
                {protocol.toUpperCase().replace(/-/g, ' ')}
              </Label>
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

        {/* Config MCP Servers Status */}
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
            Config MCP Servers
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

        {/* Codemode Section */}
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
            Code Mode
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
            {codemodeLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Spinner size="small" />
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  Loading Codemode status...
                </Text>
              </Box>
            ) : codemodeStatus ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {/* Codemode Toggle */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <CodeIcon size={16} />
                    <Box>
                      <Text
                        id="codemode-toggle-label"
                        sx={{ fontSize: 1, fontWeight: 'semibold' }}
                      >
                        Code Mode
                      </Text>
                      <Text
                        sx={{ fontSize: 0, color: 'fg.muted', marginLeft: 1 }}
                      >
                        MCP servers become programmatic tools
                      </Text>
                    </Box>
                  </Box>
                  <ToggleSwitch
                    aria-labelledby="codemode-toggle-label"
                    checked={codemodeStatus.enabled}
                    onClick={() =>
                      toggleCodemodeMutation.mutate(!codemodeStatus.enabled)
                    }
                    disabled={toggleCodemodeMutation.isPending}
                    size="small"
                  />
                </Box>

                {/* Active Skills */}
                {codemodeStatus.skills.length > 0 && (
                  <Box
                    sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <ZapIcon size={16} />
                      <Text
                        sx={{
                          fontSize: 0,
                          fontWeight: 'semibold',
                          color: 'fg.muted',
                        }}
                      >
                        Active Skills ({codemodeStatus.skills.length})
                      </Text>
                    </Box>
                    {codemodeStatus.skills.map(skill => (
                      <Box
                        key={skill.name}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                          pl: 4,
                          py: 1,
                          borderLeft: '2px solid',
                          borderColor: 'accent.emphasis',
                        }}
                      >
                        <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                          {skill.name}
                        </Text>
                        {skill.description && (
                          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                            {skill.description}
                          </Text>
                        )}
                        {skill.tags && skill.tags.length > 0 && (
                          <Box
                            sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}
                          >
                            {skill.tags.map(tag => (
                              <Label key={tag} variant="secondary" size="small">
                                {tag}
                              </Label>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Available Skills (when codemode disabled or no active skills) */}
                {codemodeStatus.available_skills.length > 0 &&
                  codemodeStatus.skills.length === 0 && (
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
                        Available Skills (
                        {codemodeStatus.available_skills.length})
                      </Text>
                      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                        Enable skills via CLI with --skills flag
                      </Text>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1,
                          flexWrap: 'wrap',
                          mt: 1,
                        }}
                      >
                        {codemodeStatus.available_skills.map(skill => (
                          <Label
                            key={skill.name}
                            variant="secondary"
                            size="small"
                          >
                            {skill.name}
                          </Label>
                        ))}
                      </Box>
                    </Box>
                  )}

                {/* No skills available message */}
                {codemodeStatus.available_skills.length === 0 && (
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    No skills available. Add skills to the skills/ directory.
                  </Text>
                )}
              </Box>
            ) : (
              <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                Failed to load Codemode status
              </Text>
            )}
          </Box>
        </Box>

        {/* Unified Context Panel - usage, distribution, and history */}
        {agentId && (
          <ContextPanel
            agentId={agentId}
            messageCount={messageCount}
            chartHeight="200px"
          />
        )}

        {/* Context Snapshot - detailed inspection of agent context */}
        {agentId && (
          <Box sx={{ mt: 3 }}>
            <Heading
              as="h4"
              sx={{
                fontSize: 1,
                fontWeight: 'semibold',
                mb: 2,
                color: 'fg.muted',
              }}
            >
              Context Snapshot
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
              <ContextInspector agentId={agentId} />
            </Box>
          </Box>
        )}

        {/* Connected Identities - always show to display any connected identities from store */}
        <AgentIdentity
          providers={identityProviders}
          title="Connected Accounts"
          showHeader={true}
          showDescription={true}
          description="OAuth identities connected to this agent. Agents can use these to access external services like GitHub repositories on your behalf."
          showExpirationDetails={true}
          allowReconnect={Boolean(identityProviders)}
          onConnect={onIdentityConnect}
          onDisconnect={onIdentityDisconnect}
        />

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
