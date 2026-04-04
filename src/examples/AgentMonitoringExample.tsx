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
  AlertIcon,
  CheckCircleIcon,
  GraphIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useAgents } from '../hooks/useAgents';

const AGENT_NAME = 'monitoring-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';

type MonitoringStatus = 'healthy' | 'degraded' | 'critical' | 'unknown';
type AlertSeverity = 'info' | 'warning' | 'critical';

interface MonitoringSnapshot {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  latencyMs: number;
  errorRatePercent: number;
  queueDepth: number;
  status: MonitoringStatus;
}

interface MonitoringAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  timestamp: string;
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const toNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const randomOffset = (range: number) => (Math.random() - 0.5) * range;

const createSyntheticSnapshot = (
  previous?: MonitoringSnapshot,
): MonitoringSnapshot => {
  const baseCpu = previous?.cpuPercent ?? 42;
  const baseMemory = previous?.memoryPercent ?? 57;
  const baseLatency = previous?.latencyMs ?? 320;
  const baseErrorRate = previous?.errorRatePercent ?? 1.6;
  const baseQueueDepth = previous?.queueDepth ?? 12;

  const cpuPercent = clampPercent(baseCpu + randomOffset(10));
  const memoryPercent = clampPercent(baseMemory + randomOffset(8));
  const latencyMs = Math.max(30, baseLatency + randomOffset(120));
  const errorRatePercent = clampPercent(baseErrorRate + randomOffset(0.8));
  const queueDepth = Math.max(0, Math.round(baseQueueDepth + randomOffset(8)));

  let status: MonitoringStatus = 'healthy';
  if (errorRatePercent > 4 || latencyMs > 1200 || cpuPercent > 90) {
    status = 'critical';
  } else if (errorRatePercent > 2 || latencyMs > 700 || cpuPercent > 80) {
    status = 'degraded';
  }

  return {
    timestamp: new Date().toISOString(),
    cpuPercent,
    memoryPercent,
    latencyMs,
    errorRatePercent,
    queueDepth,
    status,
  };
};

const normalizeSnapshot = (
  raw: unknown,
  previous?: MonitoringSnapshot,
): MonitoringSnapshot => {
  if (!raw || typeof raw !== 'object') {
    return createSyntheticSnapshot(previous);
  }
  const data = raw as Record<string, unknown>;
  const snapshot = createSyntheticSnapshot(previous);

  const statusValue = String(data.status ?? snapshot.status).toLowerCase();
  const status: MonitoringStatus =
    statusValue === 'healthy' ||
    statusValue === 'degraded' ||
    statusValue === 'critical'
      ? statusValue
      : 'unknown';

  return {
    timestamp: String(data.timestamp ?? new Date().toISOString()),
    cpuPercent: clampPercent(
      toNumber(data.cpuPercent ?? data.cpu, snapshot.cpuPercent),
    ),
    memoryPercent: clampPercent(
      toNumber(data.memoryPercent ?? data.memory, snapshot.memoryPercent),
    ),
    latencyMs: Math.max(
      0,
      toNumber(data.latencyMs ?? data.latency, snapshot.latencyMs),
    ),
    errorRatePercent: clampPercent(
      toNumber(
        data.errorRatePercent ?? data.errorRate,
        snapshot.errorRatePercent,
      ),
    ),
    queueDepth: Math.max(
      0,
      Math.round(toNumber(data.queueDepth, snapshot.queueDepth)),
    ),
    status,
  };
};

const normalizeAlert = (
  raw: unknown,
  index: number,
): MonitoringAlert | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const data = raw as Record<string, unknown>;
  const severityValue = String(data.severity ?? 'info').toLowerCase();
  const severity: AlertSeverity =
    severityValue === 'warning' || severityValue === 'critical'
      ? severityValue
      : 'info';

  return {
    id: String(data.id ?? `alert-${Date.now()}-${index}`),
    title: String(data.title ?? 'Agent alert detected'),
    severity,
    timestamp: String(data.timestamp ?? new Date().toISOString()),
  };
};

const statusVariant = (status: MonitoringStatus) => {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'attention';
  if (status === 'critical') return 'danger';
  return 'secondary';
};

const alertVariant = (severity: AlertSeverity) => {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'attention';
  return 'secondary';
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  percent: number;
}> = ({ label, value, percent }) => {
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>
        <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>{value}</Text>
      </Box>
      <Box
        sx={{
          width: '100%',
          height: 8,
          bg: 'canvas.subtle',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${clampPercent(percent)}%`,
            height: '100%',
            bg: percent >= 85 ? 'danger.emphasis' : 'accent.emphasis',
            transition: 'width 300ms ease-out',
          }}
        />
      </Box>
    </Box>
  );
};

const AgentMonitoringInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const {
    runtime,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useAgents({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: AGENT_NAME,
      protocol: 'ag-ui',
      description: 'Agent with runtime and alert monitoring signals',
    },
  });

  const [snapshots, setSnapshots] = useState<MonitoringSnapshot[]>([]);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = runtime?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';

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
    if (!isReady || !agentBaseUrl) return;

    const poll = async () => {
      let nextSnapshot: MonitoringSnapshot | null = null;
      let nextAlerts: MonitoringAlert[] | null = null;

      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/monitoring`,
        );
        if (res.ok) {
          const data = await res.json();
          const rawSnapshot = data?.snapshot ?? data?.metrics ?? data;
          nextAlerts = Array.isArray(data?.alerts)
            ? data.alerts
                .map((a: unknown, i: number) => normalizeAlert(a, i))
                .filter(
                  (a: MonitoringAlert | null): a is MonitoringAlert => !!a,
                )
                .slice(0, 25)
            : [];
          setSnapshots(prev => {
            nextSnapshot = normalizeSnapshot(rawSnapshot, prev[0]);
            return [nextSnapshot, ...prev].slice(0, 40);
          });
          if (nextAlerts) {
            setAlerts(nextAlerts);
          }
          return;
        }
      } catch {
        // Keep UI responsive with synthetic values when endpoint is unavailable.
      }

      setSnapshots(prev => {
        if (prev.length > 0) {
          return prev;
        }
        return [createSyntheticSnapshot()];
      });
    };

    poll();
    const interval = window.setInterval(poll, 10_000);
    return () => window.clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

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
          {runtimeStatus === 'launching'
            ? 'Launching runtime for monitoring agent…'
            : 'Creating monitoring demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const latest = snapshots[0] ?? createSyntheticSnapshot();

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
        <Label variant={statusVariant(latest.status)} size="small">
          {latest.status}
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
            protocol="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Monitoring Agent"
            placeholder="Ask about performance, latency, and alert trends…"
            description={`${alerts.length} active alert${alerts.length !== 1 ? 's' : ''}`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Health summary',
                message: 'Summarize current agent health and key bottlenecks',
              },
              {
                title: 'Alert triage',
                message:
                  'List critical alerts first and suggest immediate mitigations',
              },
            ]}
            submitOnSuggestionClick
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
              Live Metrics
            </Heading>
            <MetricRow
              label="CPU"
              value={`${latest.cpuPercent.toFixed(1)}%`}
              percent={latest.cpuPercent}
            />
            <MetricRow
              label="Memory"
              value={`${latest.memoryPercent.toFixed(1)}%`}
              percent={latest.memoryPercent}
            />
            <MetricRow
              label="Latency"
              value={`${Math.round(latest.latencyMs)} ms`}
              percent={(latest.latencyMs / 2000) * 100}
            />
            <MetricRow
              label="Error Rate"
              value={`${latest.errorRatePercent.toFixed(2)}%`}
              percent={latest.errorRatePercent * 20}
            />
            <MetricRow
              label="Queue Depth"
              value={`${latest.queueDepth}`}
              percent={latest.queueDepth}
            />
          </Box>

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
