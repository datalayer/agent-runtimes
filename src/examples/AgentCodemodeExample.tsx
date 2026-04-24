/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCodemodeExample
 *
 * Compares two Tavily-based agents side-by-side:
 * - Tavily MCP without codemode conversion
 * - Tavily MCP with codemode conversion
 *
 * A sidebar gauge tracks consumed tokens for each agent in real time.
 */

/// <reference types="vite/client" />

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { Text, Spinner, Heading, Label, Flash } from '@primer/react';
import { CodeIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import ReactECharts from 'echarts-for-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { AuthRequiredView } from './components';
import { uniqueAgentId } from './utils/agentId';
import { useAIAgentsWebSocket } from '../hooks';
import { Chat } from '../chat';
import {
  ContextPanel,
  type ContextSnapshotResponse,
} from '../context/ContextPanel';
import {
  parseAgentStreamMessage,
  type AgentStreamSnapshotPayload,
} from '../types/stream';
import type { McpServerStatus, McpToolsetsStatusResponse } from '../types/mcp';
import { MCP_SERVER_LIBRARY } from '../specs/mcpServers';

interface FullContextTool {
  name: string;
  description?: string;
  parametersSchema?: Record<string, unknown>;
  sourceType?: string;
}

interface McpToolInfo {
  name: string;
  description?: string;
  serverId: string;
  serverName: string;
  inputSchema?: Record<string, unknown>;
}

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

const queryClient = new QueryClient();

// Each pane talks to its own agent-runtimes process so the two agents are
// fully isolated (no shared global codemode/MCP state). Override via env:
//   VITE_BASE_URL_NO_CODEMODE=http://localhost:8765
//   VITE_BASE_URL_CODEMODE=http://localhost:8766
const NO_CODEMODE_BASE_URL =
  import.meta.env.VITE_BASE_URL_NO_CODEMODE ||
  import.meta.env.VITE_BASE_URL ||
  'http://localhost:8765';

const CODEMODE_BASE_URL =
  import.meta.env.VITE_BASE_URL_CODEMODE || 'http://localhost:8766';

const NO_CODEMODE_SUGGESTION_MESSAGE =
  'Use the Tavily Extract tool to extract information from https://datalayer.ai, then use your sandbox to persist that information in a variable named "about_datalayer".';

const CODEMODE_SUGGESTION_MESSAGE =
  'Extract information from the https://datalayer.ai website and assign it to the variable "about_datalayer", all in one step using the sandbox';

type RuntimeStatus = 'launching' | 'ready' | 'error';

interface DemoAgentConfig {
  key: string;
  title: string;
  subtitle: string;
  suggestionMessage: string;
  specId: string;
  color: string;
  baseUrl: string;
}

const DEMO_AGENT_CONFIGS: DemoAgentConfig[] = [
  {
    key: 'no-codemode',
    title: 'Tavily MCP (No Codemode)',
    subtitle: 'Raw MCP tools without codemode conversion',
    suggestionMessage: NO_CODEMODE_SUGGESTION_MESSAGE,
    specId: 'demo-tavily-no-codemode',
    color: '#0969DA',
    baseUrl: NO_CODEMODE_BASE_URL,
  },
  {
    key: 'codemode',
    title: 'Tavily MCP (Codemode)',
    subtitle: 'MCP tools converted into programmatic tools',
    suggestionMessage: CODEMODE_SUGGESTION_MESSAGE,
    specId: 'demo-tavily-codemode',
    color: '#8250DF',
    baseUrl: CODEMODE_BASE_URL,
  },
];

interface AgentRuntimePaneProps {
  config: DemoAgentConfig;
  token: string;
  onTokenConsumed: (agentKey: string, tokens: number) => void;
  onAgentIdChange?: (agentKey: string, agentId: string) => void;
  onContextSnapshot?: (
    agentKey: string,
    snapshot: ContextSnapshotResponse,
  ) => void;
}

function extractConsumedTokens(payload: AgentStreamSnapshotPayload): number {
  const snapshotCost = payload.contextSnapshot?.costUsage ?? payload.costUsage;
  const totalFromCost = Number(snapshotCost?.totalTokensUsed ?? 0);
  if (totalFromCost > 0) {
    return totalFromCost;
  }
  return Number(payload.contextSnapshot?.totalTokens ?? 0);
}

const AgentRuntimePane: React.FC<AgentRuntimePaneProps> = ({
  config,
  token,
  onTokenConsumed,
  onAgentIdChange,
  onContextSnapshot,
}) => {
  const runtimeName = useRef(uniqueAgentId(`codemode-${config.key}`)).current;
  const [runtimeStatus, setRuntimeStatus] =
    useState<RuntimeStatus>('launching');
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(runtimeName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [agentTools, setAgentTools] = useState<FullContextTool[]>([]);
  const [liveMcpStatus, setLiveMcpStatus] = useState<
    McpToolsetsStatusResponse | undefined
  >(undefined);
  const [codemodeEnabled, setCodemodeEnabled] = useState<boolean>(
    config.key === 'codemode',
  );

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

  useEffect(() => {
    let cancelled = false;

    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(`${config.baseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: runtimeName,
            description: config.subtitle,
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: config.specId,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = runtimeName;
        let alreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || runtimeName;
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
            alreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!cancelled) {
          setAgentId(resolvedAgentId);
          onAgentIdChange?.(config.key, resolvedAgentId);
          setIsReconnectedAgent(alreadyRunning);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createLocalAgent();

    return () => {
      cancelled = true;
    };
  }, [authFetch, config.specId, config.subtitle, config.baseUrl, runtimeName]);

  const handleStreamMessage = useCallback(
    (message: { raw?: unknown }) => {
      try {
        const stream = parseAgentStreamMessage(message?.raw ?? message);
        if (!stream || stream.type !== 'agent.snapshot') {
          return;
        }

        const payload = stream.payload as unknown as AgentStreamSnapshotPayload;
        const consumed = extractConsumedTokens(payload);
        if (consumed >= 0) {
          onTokenConsumed(config.key, consumed);
        }

        if (payload.mcpStatus !== undefined) {
          setLiveMcpStatus(payload.mcpStatus ?? undefined);
        }
        if (payload.contextSnapshot) {
          onContextSnapshot?.(
            config.key,
            payload.contextSnapshot as ContextSnapshotResponse,
          );
        }
        const fc = payload.fullContext as Record<string, unknown> | null;
        if (fc && Array.isArray(fc.tools) && fc.tools.length > 0) {
          setAgentTools(fc.tools as FullContextTool[]);
        }
        if (
          payload.codemodeStatus &&
          typeof payload.codemodeStatus.enabled === 'boolean'
        ) {
          setCodemodeEnabled(payload.codemodeStatus.enabled);
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    },
    [config.key, onTokenConsumed, onContextSnapshot],
  );

  useAIAgentsWebSocket({
    enabled: runtimeStatus === 'ready',
    baseUrl: config.baseUrl,
    path: '/api/v1/tool-approvals/ws',
    queryParams: { agent_id: agentId },
    onMessage: handleStreamMessage,
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });

  // Fetch creation spec to get selected MCP server IDs (for the MCP indicator).
  useEffect(() => {
    if (runtimeStatus !== 'ready') return;
    let cancelled = false;
    const fetchSpec = async () => {
      try {
        const res = await authFetch(
          `${config.baseUrl}/api/v1/configure/agents/${agentId}/spec`,
        );
        if (!res.ok) return;
        const spec: Record<string, unknown> = await res.json();
        const servers = (spec?.selected_mcp_servers ?? []) as Array<{
          id: string;
          origin?: string;
        }>;
        if (!cancelled) {
          setSelectedServerIds(servers.map(s => s.id));
        }
      } catch {
        // Non-fatal.
      }
    };
    void fetchSpec();
    return () => {
      cancelled = true;
    };
  }, [runtimeStatus, agentId, authFetch, config.baseUrl]);

  // Build McpServerInfo[] from selected servers + catalog + WS tools.
  const mcpServers = useMemo<McpServerInfo[]>(() => {
    if (selectedServerIds.length === 0) return [];
    return selectedServerIds.map(serverId => {
      const catalogServer = MCP_SERVER_LIBRARY[serverId];
      const serverName = catalogServer?.name ?? serverId;
      const liveServer = liveMcpStatus?.servers?.find(s => s.id === serverId);
      const serverTools: McpToolInfo[] = agentTools
        .filter(t => t.name.startsWith(`${serverId}__`))
        .map(t => ({
          name: t.name,
          description: t.description,
          serverId,
          serverName,
          inputSchema: t.parametersSchema,
        }));
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

  // Build a synthetic McpToolsetsStatusResponse for the Chat MCP indicator.
  const mcpStatusData = useMemo<McpToolsetsStatusResponse | undefined>(() => {
    const derivedEnabledToolsByServer: Record<string, string[]> = {};
    const derivedApprovedToolsByServer: Record<string, string[]> = {};
    for (const s of mcpServers) {
      if (s.tools.length > 0) {
        derivedEnabledToolsByServer[s.id] = s.tools.map(t => t.name);
        derivedApprovedToolsByServer[s.id] = [];
      }
    }

    if (liveMcpStatus && liveMcpStatus.servers.length > 0) {
      const live = liveMcpStatus as McpToolsetsStatusResponse & {
        enabled_tools_by_server?: Record<string, string[]>;
        approved_tools_by_server?: Record<string, string[]>;
      };
      const enabledToolsByServer = { ...(live.enabled_tools_by_server ?? {}) };
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
    return {
      initialized: true,
      ready_count: readyServers.length,
      failed_count: servers.filter(s => s.status === 'failed').length,
      ready_servers: readyServers,
      failed_servers: {},
      servers,
      enabled_tools_by_server: derivedEnabledToolsByServer,
      approved_tools_by_server: derivedApprovedToolsByServer,
      enabled_tools_count: mcpServers.reduce(
        (sum, s) => sum + s.tools.length,
        0,
      ),
    };
  }, [liveMcpStatus, mcpServers]);

  // Synthetic codemode status so the Info panel never shows
  // "Waiting for Codemode status from WebSocket stream...".
  // This is configuration, so it's known locally from the spec/toggle state.
  const codemodeStatusData = useMemo(
    () => ({
      enabled: codemodeEnabled,
      skills: [],
      available_skills: [],
      sandbox: null,
    }),
    [codemodeEnabled],
  );

  const handleToggleCodemode = useCallback(
    async (enabled: boolean) => {
      // Optimistic update; WS snapshot will reconcile.
      setCodemodeEnabled(enabled);
      try {
        const res = await authFetch(
          `${config.baseUrl}/api/v1/configure/codemode/toggle`,
          {
            method: 'POST',
            body: JSON.stringify({ enabled, agent_id: agentId }),
          },
        );
        if (!res.ok) {
          throw new Error(`Toggle failed: ${res.status}`);
        }
      } catch {
        // Rollback optimistic update on failure.
        setCodemodeEnabled(prev => !prev);
      }
    },
    [authFetch, agentId, config.baseUrl],
  );

  if (runtimeStatus === 'launching') {
    return (
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          p: 3,
          minHeight: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Spinner size="small" />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Launching {config.title}...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return (
      <Flash variant="danger" sx={{ borderRadius: 2 }}>
        {config.title}: {hookError || 'Failed to start'}
      </Flash>
    );
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        overflow: 'hidden',
        minHeight: 560,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Chat
          protocol="vercel-ai"
          baseUrl={config.baseUrl}
          agentId={agentId}
          authToken={token}
          title={config.title}
          subtitle={config.subtitle}
          placeholder="Ask both agents the same request to compare behavior..."
          description={config.subtitle}
          showHeader={true}
          headerActions={
            isReconnectedAgent ? (
              <Label size="small" variant="attention">
                Reconnected
              </Label>
            ) : undefined
          }
          autoFocus={false}
          height="100%"
          runtimeId={agentId}
          historyEndpoint={`${config.baseUrl}/api/v1/history`}
          mcpStatusData={mcpStatusData}
          codemodeStatusData={codemodeStatusData}
          codemodeEnabled={codemodeEnabled}
          onToggleCodemode={handleToggleCodemode}
          suggestions={[
            {
              title: 'Datalayer extraction',
              message: config.suggestionMessage,
            },
          ]}
          submitOnSuggestionClick
        />
      </Box>
    </Box>
  );
};

const AgentCodemodeInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [consumedByAgent, setConsumedByAgent] = useState<
    Record<string, number>
  >({
    'no-codemode': 0,
    codemode: 0,
  });
  const [agentIdByKey, setAgentIdByKey] = useState<Record<string, string>>({});
  const [contextSnapshotByKey, setContextSnapshotByKey] = useState<
    Record<string, ContextSnapshotResponse>
  >({});

  const handleAgentIdChange = useCallback(
    (agentKey: string, agentId: string) => {
      setAgentIdByKey(prev =>
        prev[agentKey] === agentId ? prev : { ...prev, [agentKey]: agentId },
      );
    },
    [],
  );

  const handleContextSnapshot = useCallback(
    (agentKey: string, snapshot: ContextSnapshotResponse) => {
      setContextSnapshotByKey(prev => ({ ...prev, [agentKey]: snapshot }));
    },
    [],
  );

  const handleTokenConsumed = useCallback(
    (agentKey: string, tokens: number) => {
      setConsumedByAgent(prev => ({
        ...prev,
        [agentKey]: Math.max(prev[agentKey] ?? 0, tokens),
      }));
    },
    [],
  );

  const maxGaugeValue = useMemo(() => {
    const values = Object.values(consumedByAgent);
    const currentMax = values.length > 0 ? Math.max(...values) : 0;
    if (currentMax <= 2000) {
      return 2000;
    }
    const magnitude = 10 ** Math.floor(Math.log10(currentMax));
    return Math.ceil((currentMax * 1.2) / magnitude) * magnitude;
  }, [consumedByAgent]);

  const gaugeOptionFor = useCallback(
    (config: DemoAgentConfig) => ({
      series: [
        {
          type: 'gauge',
          center: ['50%', '55%'],
          radius: '80%',
          min: 0,
          max: maxGaugeValue,
          splitNumber: 5,
          progress: {
            show: true,
            width: 14,
            itemStyle: {
              color: config.color,
            },
          },
          axisLine: {
            lineStyle: {
              width: 14,
              color: [[1, '#d1d9e0']],
            },
          },
          axisTick: { show: false },
          splitLine: {
            length: 10,
            lineStyle: { color: '#8c959f', width: 1 },
          },
          axisLabel: {
            distance: 14,
            color: '#57606a',
            fontSize: 10,
          },
          pointer: {
            width: 3,
            length: '60%',
          },
          anchor: {
            show: true,
            size: 8,
            itemStyle: {
              color: config.color,
            },
          },
          title: { show: false },
          detail: {
            valueAnimation: true,
            offsetCenter: [0, '70%'],
            color: '#24292f',
            fontSize: 14,
            fontWeight: 'bold',
            formatter: (value: number) =>
              `${Math.round(value).toLocaleString()} tok`,
          },
          data: [
            {
              value: consumedByAgent[config.key] ?? 0,
              name: config.title,
            },
          ],
        },
      ],
      tooltip: {
        trigger: 'item',
        formatter: (params: { seriesName?: string; value?: number }) =>
          `${params.seriesName || 'Agent'}<br/>${Math.round(params.value || 0).toLocaleString()} tokens`,
      },
    }),
    [consumedByAgent, maxGaugeValue],
  );

  if (!token) {
    return null;
  }

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        <CodeIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Codemode — Tavily MCP vs Tavily Codemode
        </Heading>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {DEMO_AGENT_CONFIGS.filter(c => c.key === 'no-codemode').map(config => (
          <Box
            key={config.key}
            sx={{
              width: 320,
              borderRight: '1px solid',
              borderColor: 'border.default',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              flexShrink: 0,
              overflow: 'auto',
            }}
          >
            <Box>
              <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
                {config.title}
              </Heading>
              <Text sx={{ color: 'fg.muted', fontSize: 0, display: 'block' }}>
                Tokens consumed (no codemode).
              </Text>
              <Text
                sx={{
                  color: 'fg.muted',
                  fontSize: 0,
                  fontFamily: 'mono',
                  display: 'block',
                  mt: 1,
                }}
              >
                {config.baseUrl}
              </Text>
              <Text
                sx={{
                  color: 'fg.muted',
                  fontSize: 0,
                  fontFamily: 'mono',
                  display: 'block',
                  mt: 1,
                  wordBreak: 'break-all',
                }}
              >
                {agentIdByKey[config.key] || 'launching…'}
              </Text>
            </Box>
            <ReactECharts
              option={gaugeOptionFor(config)}
              style={{ height: 240, width: '100%' }}
            />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Consumed</Text>
              <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                {(consumedByAgent[config.key] ?? 0).toLocaleString()} tokens
              </Text>
            </Box>
            {agentIdByKey[config.key] && (
              <ContextPanel
                agentId={agentIdByKey[config.key]}
                apiBase={config.baseUrl}
                liveData={contextSnapshotByKey[config.key] ?? null}
                chartHeight="180px"
              />
            )}
          </Box>
        ))}

        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            p: 3,
            display: 'grid',
            gridTemplateColumns: ['1fr', null, '1fr 1fr'],
            gap: 3,
            overflow: 'auto',
          }}
        >
          {DEMO_AGENT_CONFIGS.map(config => (
            <AgentRuntimePane
              key={config.key}
              config={config}
              token={token}
              onTokenConsumed={handleTokenConsumed}
              onAgentIdChange={handleAgentIdChange}
              onContextSnapshot={handleContextSnapshot}
            />
          ))}
        </Box>

        {DEMO_AGENT_CONFIGS.filter(c => c.key === 'codemode').map(config => (
          <Box
            key={config.key}
            sx={{
              width: 320,
              borderLeft: '1px solid',
              borderColor: 'border.default',
              p: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              flexShrink: 0,
              overflow: 'auto',
            }}
          >
            <Box>
              <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
                {config.title}
              </Heading>
              <Text sx={{ color: 'fg.muted', fontSize: 0, display: 'block' }}>
                Tokens consumed (codemode).
              </Text>
              <Text
                sx={{
                  color: 'fg.muted',
                  fontSize: 0,
                  fontFamily: 'mono',
                  display: 'block',
                  mt: 1,
                }}
              >
                {config.baseUrl}
              </Text>
              <Text
                sx={{
                  color: 'fg.muted',
                  fontSize: 0,
                  fontFamily: 'mono',
                  display: 'block',
                  mt: 1,
                  wordBreak: 'break-all',
                }}
              >
                {agentIdByKey[config.key] || 'launching…'}
              </Text>
            </Box>
            <ReactECharts
              option={gaugeOptionFor(config)}
              style={{ height: 240, width: '100%' }}
            />
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Consumed</Text>
              <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                {(consumedByAgent[config.key] ?? 0).toLocaleString()} tokens
              </Text>
            </Box>
            {agentIdByKey[config.key] && (
              <ContextPanel
                agentId={agentIdByKey[config.key]}
                apiBase={config.baseUrl}
                liveData={contextSnapshotByKey[config.key] ?? null}
                chartHeight="180px"
              />
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentCodemodeExample: React.FC = () => {
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
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentCodemodeInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentCodemodeExample;
