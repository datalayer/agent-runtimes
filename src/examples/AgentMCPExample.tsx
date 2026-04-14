/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import {
  Button,
  Heading,
  Label,
  Spinner,
  Text,
  Token as PrimerToken,
} from '@primer/react';
import {
  GlobeIcon,
  ServerIcon,
  SignOutIcon,
  ToolsIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import type {
  McpAggregateStatus,
  McpServerStatus,
  McpToolsetsStatusResponse,
} from '../types/mcp';
import { MCP_STATUS_COLORS, MCP_STATUS_LABELS } from '../types/mcp';

const queryClient = new QueryClient();
const AGENT_NAME = 'mcp-demo-agent';
const AGENT_SPEC_ID = 'crawler';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

/** A tool discovered from a running MCP server. */
interface McpToolInfo {
  name: string;
  description?: string;
  serverId: string;
  serverName: string;
  inputSchema?: Record<string, unknown>;
}

/** A running MCP server with its discovered tools. */
interface McpServerInfo {
  id: string;
  name: string;
  description?: string;
  status: string;
  toolsCount: number;
  tools: McpToolInfo[];
  emoji?: string;
  icon?: string;
}

/* ── Aggregate MCP status helpers ─────────────────────── */

function deriveAggregate(servers: McpServerStatus[]): McpAggregateStatus {
  if (!servers || servers.length === 0) return 'none';
  if (servers.some(s => s.status === 'starting')) return 'starting';
  if (servers.some(s => s.status === 'failed')) return 'failed';
  if (servers.every(s => s.status === 'started')) return 'started';
  return 'not_started';
}

/* ── Tool card ────────────────────────────────────────── */

const McpToolCard: React.FC<{ tool: McpToolInfo }> = ({ tool }) => {
  const schemaProps = (tool.inputSchema as Record<string, unknown>)
    ?.properties as
    | Record<string, { type?: string; description?: string }>
    | undefined;
  const paramNames = schemaProps ? Object.keys(schemaProps) : [];

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        p: 2,
        mb: 2,
        bg: 'canvas.default',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <ToolsIcon size={14} />
        <Text sx={{ fontWeight: 600, fontSize: 1 }}>{tool.name}</Text>
      </Box>
      {tool.description && (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 1, mt: 0 }}>
          {tool.description}
        </Text>
      )}
      <Text
        sx={{
          fontSize: 0,
          fontFamily: 'mono',
          color: 'fg.muted',
          display: 'block',
        }}
      >
        server: {tool.serverName}
      </Text>
      {paramNames.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {paramNames.map(p => (
            <PrimerToken key={p} text={p} size="small" />
          ))}
        </Box>
      )}
    </Box>
  );
};

/* ── Server status card ───────────────────────────────── */

const McpServerCard: React.FC<{ server: McpServerInfo }> = ({ server }) => (
  <Box
    sx={{
      p: 2,
      mb: 2,
      border: '1px solid',
      borderColor: 'border.default',
      borderRadius: 2,
      bg: 'canvas.default',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
      {server.emoji && <Text sx={{ fontSize: 2 }}>{server.emoji}</Text>}
      <Text sx={{ fontWeight: 600, fontSize: 1 }}>{server.name}</Text>
      <Label
        size="small"
        variant={server.status === 'started' ? 'success' : 'secondary'}
      >
        {server.status}
      </Label>
    </Box>
    {server.description && (
      <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}>
        {server.description}
      </Text>
    )}
    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
      {server.toolsCount} tool{server.toolsCount !== 1 ? 's' : ''} available
    </Text>
  </Box>
);

/* ── Main inner component ─────────────────────────────── */

const AgentMCPInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpToolsetsStatus, setMcpToolsetsStatus] = useState<
    McpToolsetsStatusResponse | undefined
  >(undefined);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers ?? {}),
        },
      }),
    [token],
  );

  // ── Create agent ──────────────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    const createAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description:
              'MCP demo agent – web crawling and research via Tavily',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = agentName;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (response.status === 409 || /already exists/i.test(detail || '')) {
            isAlreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(isAlreadyRunning);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, agentName, authFetch]);

  // ── Poll MCP toolsets status & fetch tools ────────────
  useEffect(() => {
    if (!isReady) return;

    let isCancelled = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    const fetchMcpStatus = async () => {
      try {
        // Get the toolsets status (lightweight – has tools_count per server)
        const statusRes = await authFetch(
          `${agentBaseUrl}/api/v1/configure/mcp-toolsets-status`,
        );
        if (!statusRes.ok) return;
        const status: McpToolsetsStatusResponse = await statusRes.json();
        if (!isCancelled) {
          setMcpToolsetsStatus(status);
        }

        // Fetch detailed server info including tools
        const availRes = await authFetch(
          `${agentBaseUrl}/api/v1/mcp/servers/available`,
        );
        if (!availRes.ok) return;
        const availableServers: Array<{
          id: string;
          name: string;
          description?: string;
          emoji?: string;
          icon?: string;
          tools?: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }>;
          isRunning?: boolean;
        }> = await availRes.json();

        if (isCancelled) return;

        // Build McpServerInfo+McpToolInfo from the status and available data
        const serverMap = new Map(status.servers.map(s => [s.id, s]));
        const infos: McpServerInfo[] = availableServers
          .filter(s => s.isRunning)
          .map(s => {
            const st = serverMap.get(s.id);
            const tools: McpToolInfo[] = (s.tools ?? []).map(t => ({
              name: t.name,
              description: t.description,
              serverId: s.id,
              serverName: s.name,
              inputSchema: t.inputSchema,
            }));
            return {
              id: s.id,
              name: s.name,
              description: s.description,
              status: st?.status ?? 'started',
              toolsCount: st?.tools_count ?? tools.length,
              tools,
              emoji: s.emoji,
              icon: s.icon,
            };
          });

        setMcpServers(infos);
      } catch {
        // Non-fatal: sidebar info is informational
      }

      // Re-poll until all servers are started (or component unmounts)
      if (!isCancelled) {
        pollTimer = setTimeout(fetchMcpStatus, 5000);
      }
    };

    void fetchMcpStatus();

    return () => {
      isCancelled = true;
      clearTimeout(pollTimer);
    };
  }, [isReady, agentId, agentBaseUrl, authFetch]);

  const totalTools = mcpServers.reduce((sum, s) => sum + s.tools.length, 0);
  const aggregate = deriveAggregate(mcpToolsetsStatus?.servers ?? []);

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>Launching MCP demo agent...</Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running - reconnected.
          </Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="MCP Demo Agent"
            placeholder="Ask the agent to search the web or explore GitHub..."
            showHeader={true}
            showNewChatButton={true}
            showClearButton={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            mcpStatusData={mcpToolsetsStatus}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  MCP Tools: {totalTools}
                </Text>
                {token && <UserBadge token={token} variant="small" />}
                <Button
                  size="small"
                  variant="invisible"
                  onClick={onLogout}
                  leadingVisual={SignOutIcon}
                  sx={{ color: 'fg.muted' }}
                >
                  Sign out
                </Button>
              </Box>
            }
            suggestions={[
              {
                title: '🔍 Search the web',
                message: 'Search the web for recent news about AI agents.',
              },
              {
                title: '🐙 GitHub repos',
                message: 'Find trending open-source Python projects on GitHub.',
              },
              {
                title: '📚 Research topic',
                message:
                  'Research best practices for building RAG applications.',
              },
              {
                title: '⚡ Compare frameworks',
                message: 'Compare popular JavaScript frameworks in 2024.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* MCP tools panel */}
        <Box
          sx={{
            width: 340,
            minWidth: 280,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            bg: 'canvas.subtle',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
              <Box
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}
              >
                <ServerIcon size={16} />
                MCP Servers &amp; Tools
              </Box>
            </Heading>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                as="span"
                sx={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bg: MCP_STATUS_COLORS[aggregate],
                  flexShrink: 0,
                }}
              />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                {MCP_STATUS_LABELS[aggregate]} · {totalTools} tool
                {totalTools !== 1 ? 's' : ''}
              </Text>
            </Box>
          </Box>

          {/* Body */}
          <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
            {mcpServers.length === 0 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  py: 4,
                }}
              >
                <Spinner size="medium" />
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  Waiting for MCP servers to start...
                </Text>
              </Box>
            ) : (
              <>
                {mcpServers.map(server => (
                  <Box key={server.id}>
                    <McpServerCard server={server} />
                    {server.tools.length > 0 && (
                      <Box sx={{ pl: 2 }}>
                        {server.tools.map(tool => (
                          <McpToolCard
                            key={`${tool.serverId}-${tool.name}`}
                            tool={tool}
                          />
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}

                {/* Info box */}
                <Box
                  sx={{
                    mt: 3,
                    p: 2,
                    borderRadius: 2,
                    bg: 'canvas.inset',
                    border: '1px solid',
                    borderColor: 'border.muted',
                  }}
                >
                  <Heading as="h5" sx={{ fontSize: 0, mb: 1 }}>
                    MCP (Model Context Protocol)
                  </Heading>
                  <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <GlobeIcon size={12} />
                      <Text>
                        <strong>Servers:</strong> Discover and start MCP servers
                        that expose tools to the agent
                      </Text>
                    </Box>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <ToolsIcon size={12} />
                      <Text>
                        <strong>Tools:</strong> Individual capabilities exposed
                        by each server (search, fetch, etc.)
                      </Text>
                    </Box>
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentMCPExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      syncTokenToIamStore(newToken);
    },
    [setAuth],
  );

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          title="Agent MCP Demo"
          description="Sign in to explore MCP server tools used by the Crawler Agent."
          leadingIcon={<GlobeIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentMCPInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentMCPExample;
