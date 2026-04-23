/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import {
  Heading,
  Label,
  Spinner,
  Text,
  Token as PrimerToken,
} from '@primer/react';
import {
  GlobeIcon,
  CheckCircleIcon,
  ServerIcon,
  XCircleIcon,
  ToolsIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import { useAIAgentsWebSocket } from '../hooks';
import type {
  AgentStreamSnapshotPayload,
  AgentStreamToolApprovalPayload,
} from '../types/stream';
import { parseAgentStreamMessage } from '../types/stream';
import type { RenderToolResult } from '../types';
import { ToolCallDisplay, type PendingApproval } from '../chat/tools';
import type {
  McpAggregateStatus,
  McpServerStatus,
  McpToolsetsStatusResponse,
} from '../types/mcp';
import { MCP_STATUS_COLORS, MCP_STATUS_LABELS } from '../types/mcp';
import { MCP_SERVER_LIBRARY } from '../specs/mcpServers';

const queryClient = new QueryClient();
const AGENT_NAME = 'mcp-demo-agent';
const AGENT_SPEC_ID = 'demo-mcp';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const AI_AGENTS_API_PREFIX = '/api/ai-agents/v1';
const FALLBACK_AI_AGENTS_BASE_URL =
  import.meta.env.VITE_AI_AGENTS_URL || DEFAULT_SERVICE_URLS.AI_AGENTS;

const normalizeToolName = (value: string): string =>
  value.replace(/[-_]/g, '').toLowerCase();

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, itemValue]) =>
        `${JSON.stringify(key)}:${stableStringify(itemValue)}`,
    );
  return `{${entries.join(',')}}`;
};

const approvalSignature = (
  toolName: string,
  args: Record<string, unknown>,
): string => `${normalizeToolName(toolName)}::${stableStringify(args ?? {})}`;

const normalizeAgentId = (value?: string): string =>
  (value ?? '').trim().toLowerCase();

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  tool_call_id?: string;
  note?: string;
  created_at?: string;
  status?: string;
  agent_id?: string;
}

type ApprovalWsDecisionMessage = {
  type: 'tool_approval_decision';
  approvalId: string;
  approved: boolean;
  note?: string;
};

const normalizeAiAgentsBaseUrl = (raw: string): string => {
  const trimmed = raw.replace(/\/$/, '');
  return trimmed.endsWith(AI_AGENTS_API_PREFIX)
    ? trimmed.slice(0, -AI_AGENTS_API_PREFIX.length)
    : trimmed;
};

const toWsUrl = (
  baseUrl: string,
  path: string,
  token?: string,
): string | null => {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    if (token) url.searchParams.set('token', token);
    else url.search = '';
    return url.toString();
  } catch {
    return null;
  }
};

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

const McpStatusPanel: React.FC<{
  data?: McpToolsetsStatusResponse;
}> = ({ data }) => {
  const servers = data?.servers ?? [];
  const aggregate = deriveAggregate(servers);

  if (!data) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        Waiting for websocket snapshot...
      </Text>
    );
  }

  if (aggregate === 'none') {
    return (
      <Box
        sx={{
          p: 2,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <ServerIcon size={16} />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          No MCP server is defined for this agent.
        </Text>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box
          as="span"
          sx={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            bg: MCP_STATUS_COLORS[aggregate],
            flexShrink: 0,
          }}
        />
        <Text sx={{ fontSize: 1 }}>{MCP_STATUS_LABELS[aggregate]}</Text>
      </Box>
      {servers.map(s => (
        <Box
          key={s.id}
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {s.status === 'started' ? (
                <CheckCircleIcon size={14} fill="success.fg" />
              ) : s.status === 'failed' ? (
                <XCircleIcon size={14} fill="danger.fg" />
              ) : (
                <Box
                  as="span"
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bg:
                      MCP_STATUS_COLORS[s.status as McpAggregateStatus] ??
                      MCP_STATUS_COLORS.not_started,
                    display: 'inline-block',
                  }}
                />
              )}
              <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>{s.id}</Text>
            </Box>
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              {s.status}
              {s.status === 'started' && s.tools_count !== undefined
                ? ` · ${s.tools_count} tool${s.tools_count !== 1 ? 's' : ''}`
                : ''}
              {s.status === 'failed' && s.error ? ` — ${s.error}` : ''}
            </Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

/** Tool definition from the WS fullContext.tools array. */
interface FullContextTool {
  name: string;
  description?: string;
  parametersSchema?: Record<string, unknown>;
  sourceType?: string;
}

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

  // MCP server IDs from the agent creation spec (e.g. ["tavily"])
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  // Per-agent tool definitions from WS fullContext.tools
  const [agentTools, setAgentTools] = useState<FullContextTool[]>([]);
  // WS-provided mcpStatus (global – used as fallback for indicator)
  const [liveMcpStatus, setLiveMcpStatus] = useState<
    McpToolsetsStatusResponse | undefined
  >(undefined);
  // Pending approvals are now managed internally by ChatBase via the Zustand
  // agent-runtime store — no local state needed.

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;
  const configuredAiAgentsBaseUrl = useCoreStore(
    (s: any) => s.configuration?.aiagentsRunUrl,
  );
  const aiAgentsBaseUrl = normalizeAiAgentsBaseUrl(
    configuredAiAgentsBaseUrl || FALLBACK_AI_AGENTS_BASE_URL,
  );
  const approvalWsRef = useRef<WebSocket | null>(null);

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
            enable_codemode: false,
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

  // ── WebSocket: receive MCP status + fullContext tools from agent.snapshot ─
  const handleSnapshotMessage = useCallback((message: { raw?: unknown }) => {
    try {
      const stream = parseAgentStreamMessage(message?.raw ?? message);
      if (!stream || stream.type !== 'agent.snapshot') return;
      const payload = stream.payload as unknown as AgentStreamSnapshotPayload;
      if (payload.mcpStatus !== undefined) {
        setLiveMcpStatus(payload.mcpStatus ?? undefined);
      }
      // Extract per-agent tool definitions from fullContext.tools
      const fc = payload.fullContext as Record<string, unknown> | null;
      if (fc && Array.isArray(fc.tools) && fc.tools.length > 0) {
        setAgentTools(fc.tools as FullContextTool[]);
      }
    } catch {
      // Ignore malformed payloads.
    }
  }, []);

  useAIAgentsWebSocket({
    enabled: isReady && Boolean(agentBaseUrl),
    baseUrl: agentBaseUrl,
    path: '/api/v1/tool-approvals/ws',
    queryParams: { agent_id: agentId },
    onMessage: handleSnapshotMessage,
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });

  // ── ai-agents WebSocket: bridge tool approval decisions to remote backend ──
  useEffect(() => {
    if (!isReady) return;

    const wsUrl = toWsUrl(
      aiAgentsBaseUrl,
      `${AI_AGENTS_API_PREFIX}/ws`,
      chatAuthToken,
    );
    if (!wsUrl) return;

    let closedByCleanup = false;
    const ws = new WebSocket(wsUrl);
    approvalWsRef.current = ws;

    ws.onopen = () => {
      // Request any existing approvals so they appear immediately.
      ws.send(JSON.stringify({ type: 'tool-approvals-history' }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;
        const msgType = msg?.type as string | undefined;
        const msgEvent = msg?.event as string | undefined;
        const records: Array<Record<string, unknown>> = [];

        if (msgType === 'tool-approvals-history') {
          const data = (msg?.data ?? {}) as Record<string, unknown>;
          const approvals = data?.approvals;
          if (Array.isArray(approvals)) {
            for (const a of approvals) {
              if (a && typeof a === 'object')
                records.push(a as Record<string, unknown>);
            }
          }
        } else if (
          typeof msgEvent === 'string' &&
          (msgEvent === 'tool_approval_created' ||
            msgEvent === 'tool_approval_updated')
        ) {
          const data = (msg?.data ?? msg?.payload) as
            | Record<string, unknown>
            | undefined;
          if (data) records.push(data);
        }

        for (const record of records) {
          if (record?.status === 'pending') {
            agentRuntimeStore
              .getState()
              .upsertApproval(
                record as unknown as AgentStreamToolApprovalPayload,
              );
          }
        }
      } catch {
        // Ignore malformed messages.
      }
    };

    ws.onclose = () => {
      if (!closedByCleanup) approvalWsRef.current = null;
    };
    ws.onerror = () => {
      approvalWsRef.current = null;
    };

    return () => {
      closedByCleanup = true;
      approvalWsRef.current = null;
      ws.close();
    };
  }, [isReady, aiAgentsBaseUrl, chatAuthToken]);

  /** Send a tool_approval_decision over the ai-agents WS. */
  const sendApprovalDecisionToAiAgents = useCallback(
    (approvalId: string, approved: boolean, note?: string) => {
      const ws = approvalWsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          type: 'tool_approval_decision',
          approvalId,
          approved,
          ...(note ? { note } : {}),
        }),
      );
    },
    [],
  );

  // ── Fetch creation spec to get selected MCP server IDs ──
  useEffect(() => {
    if (!isReady) return;

    const fetchSpec = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/configure/agents/${agentId}/spec`,
        );
        if (!res.ok) return;
        const spec: Record<string, unknown> = await res.json();
        const servers = (spec?.selected_mcp_servers ?? []) as Array<{
          id: string;
          origin?: string;
        }>;
        setSelectedServerIds(servers.map(s => s.id));
      } catch {
        // Non-fatal: sidebar info is informational
      }
    };

    void fetchSpec();
  }, [isReady, agentId, agentBaseUrl, authFetch]);

  // ── Build McpServerInfo[] from selected servers + catalog + WS tools ──
  const mcpServers = useMemo<McpServerInfo[]>(() => {
    if (selectedServerIds.length === 0) return [];

    return selectedServerIds.map(serverId => {
      const catalogServer = MCP_SERVER_LIBRARY[serverId];
      const serverName = catalogServer?.name ?? serverId;

      // Live status from WS snapshot — the most reliable source of truth.
      const liveServer = liveMcpStatus?.servers?.find(s => s.id === serverId);

      // Match tools by prefix convention: "tavily__tavily_search" → server "tavily"
      // (fallback when live data is not yet available)
      const serverTools: McpToolInfo[] = agentTools
        .filter(t => t.name.startsWith(`${serverId}__`))
        .map(t => ({
          name: t.name,
          description: t.description,
          serverId,
          serverName,
          inputSchema: t.parametersSchema,
        }));

      // Prefer live tools from WS snapshot; fall back to agentTools-derived tools.
      const toolsFromLive: McpToolInfo[] = (liveServer?.tools ?? []).map(t => ({
        name: t.name,
        description: t.description ?? '',
        serverId,
        serverName,
        inputSchema: undefined,
      }));
      const tools = toolsFromLive.length > 0 ? toolsFromLive : serverTools;

      const status =
        liveServer?.status ?? (serverTools.length > 0 ? 'started' : 'starting');
      const toolsCount = liveServer?.tools_count ?? tools.length;

      return {
        id: serverId,
        name: serverName,
        description: catalogServer?.description,
        status,
        toolsCount,
        tools,
        emoji: catalogServer?.emoji,
        icon: catalogServer?.icon,
      };
    });
  }, [selectedServerIds, agentTools, liveMcpStatus]);

  // ── Build synthetic McpToolsetsStatusResponse for the Chat MCP indicator ──
  const mcpStatusData = useMemo<McpToolsetsStatusResponse | undefined>(() => {
    const derivedEnabledToolsByServer: Record<string, string[]> = {};
    const derivedApprovedToolsByServer: Record<string, string[]> = {};
    for (const s of mcpServers) {
      if (s.tools.length > 0) {
        derivedEnabledToolsByServer[s.id] = s.tools.map(t => t.name);
        // Keep approval default explicit: enabled but not approved.
        derivedApprovedToolsByServer[s.id] = [];
      }
    }

    // If the WS-provided global mcpStatus has actual servers, prefer it
    if (liveMcpStatus && liveMcpStatus.servers.length > 0) {
      const live = liveMcpStatus as McpToolsetsStatusResponse & {
        enabled_tools_by_server?: Record<string, string[]>;
        approved_tools_by_server?: Record<string, string[]>;
      };

      const enabledToolsByServer = {
        ...(live.enabled_tools_by_server ?? {}),
      };
      for (const [serverId, tools] of Object.entries(
        derivedEnabledToolsByServer,
      )) {
        if (
          !enabledToolsByServer[serverId] ||
          enabledToolsByServer[serverId].length === 0
        ) {
          enabledToolsByServer[serverId] = tools;
        }
      }

      const approvedToolsByServer = {
        ...(live.approved_tools_by_server ?? {}),
      };
      for (const [serverId, tools] of Object.entries(
        derivedApprovedToolsByServer,
      )) {
        if (!approvedToolsByServer[serverId]) {
          approvedToolsByServer[serverId] = tools;
        }
      }

      return {
        ...live,
        enabled_tools_by_server: enabledToolsByServer,
        approved_tools_by_server: approvedToolsByServer,
      };
    }
    // Otherwise build from our per-agent derived info
    if (mcpServers.length === 0) return undefined;
    const servers: McpServerStatus[] = mcpServers.map(s => ({
      id: s.id,
      status: s.status as McpServerStatus['status'],
      tools_count: s.toolsCount,
      tools: s.tools.map(t => ({
        name: t.name,
        description: t.description,
        enabled: true,
      })),
    }));
    const readyServers = servers
      .filter(s => s.status === 'started')
      .map(s => s.id);
    // Build enabled_tools_by_server so the InputFooter ToolsMenu can render
    // tools as enabled immediately on first open.
    const enabledToolsByServer = derivedEnabledToolsByServer;
    const approvedToolsByServer = derivedApprovedToolsByServer;
    return {
      initialized: true,
      ready_count: readyServers.length,
      failed_count: servers.filter(s => s.status === 'failed').length,
      ready_servers: readyServers,
      failed_servers: {},
      servers,
      enabled_tools_by_server: enabledToolsByServer,
      approved_tools_by_server: approvedToolsByServer,
      enabled_tools_count: mcpServers.reduce(
        (sum, s) => sum + s.tools.length,
        0,
      ),
    };
  }, [liveMcpStatus, mcpServers]);

  const totalTools = mcpServers.reduce((sum, s) => sum + s.toolsCount, 0);
  const aggregate = deriveAggregate(mcpStatusData?.servers ?? []);

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
            showToolsMenu={true}
            showSkillsMenu={true}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            mcpStatusData={mcpStatusData}
            showToolApprovalBanner={true}
            onApproveApproval={(id, note) =>
              sendApprovalDecisionToAiAgents(id, true, note)
            }
            onRejectApproval={(id, note) =>
              sendApprovalDecisionToAiAgents(id, false, note)
            }
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  MCP Tools: {totalTools}
                </Text>
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
            width: 320,
            minWidth: 260,
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
            <Box sx={{ mb: 3 }}>
              <Heading as="h5" sx={{ fontSize: 1, mb: 2 }}>
                MCP Servers
              </Heading>
              <McpStatusPanel data={mcpStatusData} />
            </Box>

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
  const { token, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

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
        <Box sx={{ p: 4, textAlign: 'center', color: 'fg.muted' }}>
          Sign in from the top header to run this example.
        </Box>
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
