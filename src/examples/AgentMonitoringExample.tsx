/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentMonitoringExample
 *
 * Demonstrates runtime and agent monitoring with a live metrics panel,
 * health status, and recent alert history.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows a monitoring panel alongside the chat with key operational signals
 */

/// <reference types="vite/client" />

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, Spinner, Heading, Label } from '@primer/react';
import { GraphIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import {
  ContextPanel,
  type ContextSnapshotResponse,
} from '../context/ContextPanel';
import { CostTracker, type CostUsageResponse } from '../context/CostTracker';
import { CostUsageChart } from '../context/CostUsageChart';
import { TokenUsageChart } from '../context/TokenUsageChart';
import { GraphFlowChart } from '../context/GraphFlowChart';
import { TurnGraphChart } from '../context/TurnGraphChart';
import type { GraphTelemetryData } from '../types/stream';
import { useAIAgentsWebSocket } from '../hooks';
import type { AgentStreamSnapshotPayload } from '../types/stream';
import type { ContextSnapshotData } from '../types/context';
import { parseAgentStreamMessage } from '../types/stream';
import { useCoreStore } from '../state/substates';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { LoopEmbed } from '../loop';
import { AgentMonitoringPlugin } from '../loop/plugins/agent-monitoring';
import { createChatExtrasPlugin } from '../loop/plugins/chat-extras';
import type { McpToolsetsStatusResponse } from '../types/mcp';

const AGENT_NAME = 'monitoring-example-agent';
const AGENTSPEC_ID = 'example-monitoring';
const OTEL_BASE_URL_ENV = import.meta.env.VITE_OTEL_BASE_URL;
// Consume-side OTEL override (DATALAYER_OTEL_IN_URL). When set, telemetry is
// read from here instead of VITE_OTEL_BASE_URL (e.g. prod during local dev).
const OTEL_IN_BASE_URL_ENV = import.meta.env.VITE_OTEL_IN_BASE_URL;
const OTEL_URL_ENV = import.meta.env.VITE_DATALAYER_OTEL_URL;

type AlertSeverity = 'info' | 'warning' | 'critical';

interface MonitoringAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  timestamp: string;
}

const AgentMonitoringInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;
  const { configuration } = useCoreStore();
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  void alerts;
  const [liveContext, setLiveContext] = useState<
    ContextSnapshotResponse | undefined
  >(undefined);
  const [liveContextSnapshot, setLiveContextSnapshot] = useState<
    ContextSnapshotData | undefined
  >(undefined);
  const [liveCost, setLiveCost] = useState<CostUsageResponse | undefined>(
    undefined,
  );
  const [liveMcpStatus, setLiveMcpStatus] = useState<
    McpToolsetsStatusResponse | undefined
  >(undefined);
  // The chat column is the shared loop; the live MCP status the footer shows
  // reaches it through the chat-extras channel.
  const { plugin: extrasPlugin, setExtras } = useMemo(
    () => createChatExtrasPlugin(),
    [],
  );
  const chatPlugins = useMemo(
    () => [AgentMonitoringPlugin, extrasPlugin],
    [extrasPlugin],
  );
  useEffect(() => {
    setExtras({ mcpStatusData: liveMcpStatus ?? null });
  }, [liveMcpStatus, setExtras]);
  const [monitorLastSnapshotAt, setMonitorLastSnapshotAt] = useState<
    number | null
  >(null);
  const [liveGraphTelemetry, setLiveGraphTelemetry] = useState<
    GraphTelemetryData | undefined
  >(undefined);

  const agentBaseUrl = useExampleAgentRuntimesUrl();
  const otelBaseUrl =
    OTEL_IN_BASE_URL_ENV ||
    configuration?.otelUrl ||
    configuration?.otelUrl ||
    OTEL_BASE_URL_ENV ||
    OTEL_URL_ENV ||
    agentBaseUrl;
  const runtimeName = agentId;
  // The OTEL service_name resource attribute is 'agent-runtimes' (the
  // application name), NOT the individual agent ID.  Use the correct value
  // so the TokenUsageChart WS filter and HTTP query match actual rows.
  const otelServiceName = 'agent-runtimes';
  const chatAuthToken: string | undefined = token === null ? undefined : token;
  void chatAuthToken;

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
    let isCancelled = false;

    const createLocalAgent = async () => {
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
              'MCP monitoring example – web crawling via Tavily with live cost/token metrics',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENTSPEC_ID,
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
              detail || `Failed to create local agent: ${response.status}`,
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

    void createLocalAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, agentName, authFetch]);

  const handleMonitoringStreamMessage = useCallback(
    (message: { raw?: unknown }) => {
      try {
        const stream = parseAgentStreamMessage(message?.raw ?? message);
        if (!stream || stream.type !== 'agent.snapshot') {
          return;
        }

        // Snapshot payloads may arrive with camelCase (TS types) or snake_case
        // (Python backend) keys. Read both for consistency with the UI.
        const asRecord = (value: unknown): Record<string, unknown> =>
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : {};
        const pick = (
          source: Record<string, unknown>,
          keys: string[],
        ): unknown => {
          for (const key of keys) {
            const value = source[key];
            if (value !== undefined && value !== null) {
              return value;
            }
          }
          return undefined;
        };
        const pickNumber = (
          source: Record<string, unknown>,
          keys: string[],
          fallback = 0,
        ): number => {
          const value = pick(source, keys);
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        };
        const pickOptionalNumber = (
          source: Record<string, unknown>,
          keys: string[],
        ): number | null => {
          const value = pick(source, keys);
          if (value === undefined || value === null) {
            return null;
          }
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        };

        const payloadRecord = asRecord(stream.payload);
        const payload = stream.payload as unknown as AgentStreamSnapshotPayload;
        const contextSnapshot = pick(payloadRecord, [
          'contextSnapshot',
          'context_snapshot',
        ]);
        if (contextSnapshot) {
          setLiveContext(contextSnapshot as ContextSnapshotResponse);
          setLiveContextSnapshot(contextSnapshot as ContextSnapshotData);
          setMonitorLastSnapshotAt(Date.now());
        }

        const mcpStatus = pick(payloadRecord, ['mcpStatus', 'mcp_status']);
        if (mcpStatus !== undefined) {
          setLiveMcpStatus(
            (mcpStatus as typeof payload.mcpStatus) ?? undefined,
          );
        }

        if (payload.graphTelemetry) {
          setLiveGraphTelemetry(payload.graphTelemetry);
        }

        const snapshotCost = asRecord(
          pick(asRecord(contextSnapshot), ['costUsage', 'cost_usage']) ??
            pick(payloadRecord, ['costUsage', 'cost_usage']),
        );
        if (!snapshotCost || Object.keys(snapshotCost).length === 0) {
          return;
        }

        const modelBreakdown = pick(snapshotCost, [
          'modelBreakdown',
          'model_breakdown',
        ]);
        const runs = pick(snapshotCost, ['runs']);

        setLiveCost({
          agentId,
          lastTurnCostUsd: pickNumber(snapshotCost, [
            'lastTurnCostUsd',
            'last_turn_cost_usd',
          ]),
          cumulativeCostUsd: pickNumber(snapshotCost, [
            'cumulativeCostUsd',
            'cumulative_cost_usd',
          ]),
          perRunBudgetUsd: pickOptionalNumber(snapshotCost, [
            'perRunBudgetUsd',
            'per_run_budget_usd',
          ]),
          cumulativeBudgetUsd: pickOptionalNumber(snapshotCost, [
            'cumulativeBudgetUsd',
            'cumulative_budget_usd',
          ]),
          requestCount: pickNumber(snapshotCost, [
            'requestCount',
            'request_count',
          ]),
          totalTokensUsed: pickNumber(snapshotCost, [
            'totalTokensUsed',
            'total_tokens_used',
          ]),
          modelBreakdown: Array.isArray(modelBreakdown)
            ? modelBreakdown.map(entry => {
                const item = asRecord(entry);
                return {
                  model: String(pick(item, ['model']) ?? 'unknown'),
                  inputTokens: pickNumber(item, [
                    'inputTokens',
                    'input_tokens',
                  ]),
                  outputTokens: pickNumber(item, [
                    'outputTokens',
                    'output_tokens',
                  ]),
                  costUsd: pickNumber(item, ['costUsd', 'cost_usd']),
                  requests: pickNumber(item, ['requests']),
                };
              })
            : [],
          runs: Array.isArray(runs)
            ? runs.map(entry => {
                const item = asRecord(entry);
                return {
                  pricingResolved: Boolean(
                    pick(item, ['pricingResolved', 'pricing_resolved']),
                  ),
                };
              })
            : undefined,
        });
      } catch {
        // Ignore malformed stream payloads.
      }
    },
    [agentId],
  );

  const monitorSocket = useAIAgentsWebSocket({
    enabled: isReady && Boolean(agentBaseUrl),
    baseUrl: agentBaseUrl,
    path: '/api/v1/tool-approvals/ws',
    queryParams: { agent_id: agentId },
    onMessage: handleMonitoringStreamMessage,
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });

  useEffect(() => {
    // Monitoring alerts endpoint is optional and may return 404 in local mode.
    // Keep the UI quiet and rely on stream snapshots for now.
    setAlerts([]);
  }, [isReady, agentId]);

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching local monitoring example agent...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  return (
    <Box
      sx={{
        height: '100%',
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
        <GraphIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Monitoring — {runtimeName}
        </Heading>
        {isReconnectedAgent && (
          <Label variant="secondary" size="small">
            Reconnected
          </Label>
        )}
        <Label
          variant={
            monitorSocket.connectionState === 'connected'
              ? 'success'
              : 'secondary'
          }
        >
          WS: {monitorSocket.connectionState}
        </Label>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box
          sx={{
            width: 320,
            minWidth: 280,
            borderRight: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            '@media (max-width: 1680px)': {
              width: 300,
              minWidth: 260,
            },
            '@media (max-width: 1400px)': {
              display: 'none',
            },
          }}
        >
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Token Usage
            </Heading>
            <TokenUsageChart
              serviceName={otelServiceName}
              agentId={agentId}
              apiKey={token ?? undefined}
              otelUrl={otelBaseUrl}
              liveSystemPromptTokens={liveContextSnapshot?.systemPromptTokens}
              liveUserMessageTokens={liveContextSnapshot?.userMessageTokens}
              liveAgentMessageTokens={
                liveContextSnapshot?.assistantMessageTokens
              }
              liveToolsUsageTokens={liveContextSnapshot?.toolTokens}
              liveTimestampMs={monitorLastSnapshotAt}
              height={180}
            />
          </Box>

          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Cost
            </Heading>
            <CostUsageChart
              serviceName={otelServiceName}
              agentId={agentId}
              apiKey={token ?? undefined}
              otelUrl={otelBaseUrl}
              liveCumulativeUsd={liveCost?.cumulativeCostUsd}
              liveTimestampMs={monitorLastSnapshotAt}
              height={180}
            />
          </Box>

          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              LLM Cost Monitoring
            </Heading>
            {liveCost ? (
              <CostTracker
                agentId={agentId}
                compact={false}
                liveData={liveCost}
              />
            ) : (
              <Box>
                <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                  Waiting for first websocket snapshot...
                </Text>
                {monitorSocket.lastClose?.detail && (
                  <Text
                    sx={{
                      color: 'danger.fg',
                      fontSize: 0,
                      mt: 1,
                      display: 'block',
                    }}
                  >
                    Last close: {monitorSocket.lastClose.detail}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <LoopEmbed
            serverUrl={agentBaseUrl}
            target="local"
            agentId={agentId}
            defaultEditor="none"
            showHeader
            plugins={chatPlugins}
          />
        </Box>

        <Box
          sx={{
            width: 360,
            minWidth: 320,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            '@media (max-width: 1680px)': {
              width: 340,
              minWidth: 300,
            },
            '@media (max-width: 1100px)': {
              width: 300,
              minWidth: 260,
            },
          }}
        >
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Turn and Session Usage
            </Heading>
            {liveContext ? (
              <ContextPanel
                agentId={agentId}
                apiBase={agentBaseUrl}
                liveData={liveContext}
                defaultView="overview"
                chartHeight="160px"
              />
            ) : (
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                Waiting for first websocket snapshot...
              </Text>
            )}
            <Text sx={{ mt: 2, color: 'fg.muted', fontSize: 0 }}>
              Live monitoring uses websocket snapshots only.
              {monitorLastSnapshotAt
                ? ` Last snapshot ${new Date(monitorLastSnapshotAt).toLocaleTimeString()}.`
                : ''}
              {monitorSocket.connectionState !== 'connected' &&
              monitorSocket.reconnectAttempt > 0
                ? ` Reconnect attempt ${monitorSocket.reconnectAttempt}.`
                : ''}
            </Text>
          </Box>

          {liveGraphTelemetry && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
                Graph Execution (live)
              </Heading>
              <GraphFlowChart data={liveGraphTelemetry} height={240} />
              <Text sx={{ mt: 1, color: 'fg.muted', fontSize: 0 }}>
                {liveGraphTelemetry.totalNodesExecuted} node(s) executed across{' '}
                {liveGraphTelemetry.runCount} run(s)
                {liveGraphTelemetry.totalDurationMs
                  ? ` — ${(liveGraphTelemetry.totalDurationMs / 1000).toFixed(2)}s total`
                  : ''}
              </Text>
            </Box>
          )}

          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Turn Execution Graph (OTEL traces)
            </Heading>
            <TurnGraphChart
              serviceName={otelServiceName}
              agentId={agentId}
              otelUrl={otelBaseUrl}
              apiKey={token ?? undefined}
              autoRefreshMs={10_000}
              height={280}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('../state/substates').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentMonitoringExample: React.FC = () => {
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
    import('../state/substates').then(({ iamStore }) => {
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
        <AgentMonitoringInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentMonitoringExample;
