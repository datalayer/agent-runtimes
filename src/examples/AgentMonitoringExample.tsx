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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, Button, Spinner, Heading, Label } from '@primer/react';
import {
  CheckCircleIcon,
  GraphIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
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
import type { GraphTelemetryData } from '../types/stream';
import { useAIAgentsWebSocket } from '../hooks';
import type { AgentStreamSnapshotPayload } from '../types/stream';
import type { ContextSnapshotData } from '../types/context';
import { parseAgentStreamMessage } from '../types/stream';
import { useCoreStore } from '@datalayer/core/lib/state';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import type { McpToolsetsStatusResponse } from '../types/mcp';

const AGENT_NAME = 'monitoring-demo-agent';
const AGENT_SPEC_ID = 'crawler';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const OTEL_BASE_URL_ENV = import.meta.env.VITE_OTEL_BASE_URL;
const DATALAYER_RUN_URL_ENV = import.meta.env.DATALAYER_RUN_URL;

type AlertSeverity = 'info' | 'warning' | 'critical';

interface MonitoringAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  timestamp: string;
}

const alertVariant = (severity: AlertSeverity) => {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'attention';
  return 'secondary';
};

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
  const [monitorLastSnapshotAt, setMonitorLastSnapshotAt] = useState<
    number | null
  >(null);
  const [liveGraphTelemetry, setLiveGraphTelemetry] = useState<
    GraphTelemetryData | undefined
  >(undefined);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const otelBaseUrl =
    configuration?.otelRunUrl ||
    configuration?.runUrl ||
    OTEL_BASE_URL_ENV ||
    DATALAYER_RUN_URL_ENV ||
    'https://prod1.datalayer.run';
  const podName = agentId;
  // The OTEL service_name resource attribute is 'agent-runtimes' (the
  // application name), NOT the individual agent ID.  Use the correct value
  // so the TokenUsageChart WS filter and HTTP query match actual rows.
  const otelServiceName = 'agent-runtimes';
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
              'MCP monitoring demo – web crawling via Tavily with live cost/token metrics',
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
  }, [agentBaseUrl, authFetch]);

  const handleMonitoringStreamMessage = useCallback(
    (message: { raw?: unknown }) => {
      try {
        const stream = parseAgentStreamMessage(message?.raw ?? message);
        if (!stream || stream.type !== 'agent.snapshot') {
          return;
        }

        const payload = stream.payload as unknown as AgentStreamSnapshotPayload;
        if (payload.contextSnapshot) {
          setLiveContext(payload.contextSnapshot as ContextSnapshotResponse);
          setLiveContextSnapshot(
            payload.contextSnapshot as ContextSnapshotData,
          );
          setMonitorLastSnapshotAt(Date.now());
        }

        if (payload.mcpStatus !== undefined) {
          setLiveMcpStatus(payload.mcpStatus ?? undefined);
        }

        if (payload.graphTelemetry) {
          setLiveGraphTelemetry(payload.graphTelemetry);
        }

        const snapshotCost =
          payload.contextSnapshot?.costUsage ?? payload.costUsage;
        if (!snapshotCost) {
          return;
        }

        setLiveCost({
          agentId,
          lastTurnCostUsd: Number(snapshotCost.lastTurnCostUsd ?? 0),
          cumulativeCostUsd: Number(snapshotCost.cumulativeCostUsd ?? 0),
          perRunBudgetUsd:
            snapshotCost.perRunBudgetUsd == null
              ? null
              : Number(snapshotCost.perRunBudgetUsd),
          cumulativeBudgetUsd:
            snapshotCost.cumulativeBudgetUsd == null
              ? null
              : Number(snapshotCost.cumulativeBudgetUsd),
          requestCount: Number(snapshotCost.requestCount ?? 0),
          totalTokensUsed: Number(snapshotCost.totalTokensUsed ?? 0),
          modelBreakdown: Array.isArray(snapshotCost.modelBreakdown)
            ? snapshotCost.modelBreakdown.map(item => ({
                model: String(item.model ?? 'unknown'),
                inputTokens: Number(item.inputTokens ?? 0),
                outputTokens: Number(item.outputTokens ?? 0),
                costUsd: Number(item.costUsd ?? 0),
                requests: Number(item.requests ?? 0),
              }))
            : [],
          runs: Array.isArray(snapshotCost.runs)
            ? snapshotCost.runs.map(item => ({
                pricingResolved: Boolean(item.pricingResolved),
              }))
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
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          Launching local monitoring demo agent...
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
        <GraphIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Monitoring — {podName}
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

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Monitoring Agent"
            placeholder="Ask for cost, token usage, and turn-level monitoring insights..."
            description={`${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`}
            showHeader={true}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Monitoring summary',
                message:
                  'Summarize my current token usage, cost status, and recent turn activity.',
              },
              {
                title: 'Turn usage analysis',
                message:
                  'Analyze the last turn usage and explain which parts drove input and output tokens.',
              },
            ]}
            submitOnSuggestionClick
            contextSnapshot={liveContextSnapshot}
            mcpStatusData={liveMcpStatus}
          />
        </Box>

        <Box
          sx={{
            width: 380,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
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
              runUrl={otelBaseUrl}
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
              runUrl={otelBaseUrl}
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
                Graph Execution
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

          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Recent Alerts
            </Heading>

            {alerts.length === 0 ? (
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
                <CheckCircleIcon size={16} />
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  No active alerts.
                </Text>
              </Box>
            ) : (
              alerts.map(alert => (
                <Box
                  key={alert.id}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 1,
                    }}
                  >
                    <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
                      {alert.title}
                    </Text>
                    <Label size="small" variant={alertVariant(alert.severity)}>
                      {alert.severity}
                    </Label>
                  </Box>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    {new Date(alert.timestamp).toLocaleString()}
                  </Text>
                </Box>
              ))
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

const AgentMonitoringExample: React.FC = () => {
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
          title="Agent Monitoring"
          description="Sign in to monitor runtime health and alerts."
          leadingIcon={<GraphIcon size={24} />}
        />
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
