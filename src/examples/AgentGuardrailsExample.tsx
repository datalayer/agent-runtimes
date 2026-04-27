/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentGuardrailsExample
 *
 * Demonstrates cost budget guardrails and tool approval flow for durable agents.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows a real-time cost tracker alongside the chat
 * - Surfaces tool approval requests: when the agent calls a tool marked
 *   `approval: manual`, a banner appears with Approve / Reject buttons
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Text,
  Button,
  Spinner,
  Heading,
  Label,
  Flash,
  ProgressBar,
} from '@primer/react';
import {
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
  DotFillIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { buildOtelWebSocketUrl } from '@datalayer/core/lib/otel';
import { useCoreStore } from '@datalayer/core/lib/state';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import type {
  AgentStreamSnapshotPayload,
  AgentStreamToolApprovalPayload,
} from '../types/stream';
import { parseAgentStreamMessage } from '../types/stream';
import { getAgentSpecs } from '../specs/agents';
import { subscribeOtelWs } from '../context/otelWsPool';
import { toMetricValue } from '../hooks/useMonitoring';
import { useAIAgentsWebSocket } from '../hooks';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'guardrails-demo-agent';
const AGENT_SPEC_ID = 'demo-guardrails';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const OTEL_BASE_URL_ENV = import.meta.env.VITE_OTEL_BASE_URL;
const DATALAYER_RUN_URL_ENV = import.meta.env.DATALAYER_RUN_URL;
const OTEL_SERVICE_NAME = 'agent-runtimes';
const COST_RUN_METRIC = 'agent_runtimes.capability.cost.run.usd';
const COST_CUMULATIVE_METRIC = 'agent_runtimes.capability.cost.cumulative.usd';

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const resolvePerRunBudgetFromSpec = (agentSpecId: string): number | null => {
  const spec = getAgentSpecs(agentSpecId);
  if (!spec?.guardrails?.length) {
    return null;
  }

  for (const guardrail of spec.guardrails) {
    if (!guardrail || typeof guardrail !== 'object') {
      continue;
    }
    const costBudget = (guardrail as Record<string, unknown>).cost_budget;
    if (!costBudget || typeof costBudget !== 'object') {
      continue;
    }
    const perRunUsd = toNumberOrNull(
      (costBudget as Record<string, unknown>).per_run_usd,
    );
    if (perRunUsd != null) {
      return perRunUsd;
    }
  }

  return null;
};

const DEFAULT_RUN_BUDGET_USD = resolvePerRunBudgetFromSpec(AGENT_SPEC_ID);

// ─── Types ─────────────────────────────────────────────────────────────────

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  created_at: string;
}

interface OtelCostSample {
  timestampMs: number;
  runUsd: number;
  cumulativeUsd: number;
}

const toApprovalRequest = (
  payload: AgentStreamToolApprovalPayload,
): ToolApprovalRequest => ({
  id: payload.id,
  tool_name: payload.tool_name,
  tool_args: payload.tool_args ?? {},
  created_at: payload.created_at ?? new Date().toISOString(),
});

const normalizeBaseUrl = (rawBaseUrl: string): string => {
  if (
    rawBaseUrl.startsWith('http://') ||
    rawBaseUrl.startsWith('https://') ||
    rawBaseUrl.startsWith('ws://') ||
    rawBaseUrl.startsWith('wss://')
  ) {
    return rawBaseUrl;
  }

  const protocol =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? 'https:'
      : 'http:';
  const host = typeof window !== 'undefined' ? window.location.host : '';
  return `${protocol}//${host}${rawBaseUrl}`;
};

const parseAttributes = (attrs: unknown): Record<string, unknown> => {
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    return attrs as Record<string, unknown>;
  }
  if (typeof attrs === 'string') {
    try {
      return JSON.parse(attrs) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
};

const extractServiceName = (
  row: Record<string, unknown>,
): string | undefined => {
  const directCandidates = [row.service_name, row.service, row.serviceName];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }

  const resourceAttributes = row.resource_attributes;
  if (resourceAttributes && typeof resourceAttributes === 'object') {
    const nested = (resourceAttributes as Record<string, unknown>)[
      'service.name'
    ];
    if (typeof nested === 'string' && nested.length > 0) {
      return nested;
    }
  }

  return undefined;
};

const extractAgentId = (row: Record<string, unknown>): string | undefined => {
  const attrs = parseAttributes(row.attributes);
  const aid = attrs['agent.id'];
  return typeof aid === 'string' ? aid : undefined;
};

const rowTimestampMs = (row: Record<string, unknown>): number => {
  const nanoTs = row.timestamp_unix_nano ?? row.observed_timestamp_unix_nano;
  if (typeof nanoTs === 'number' && nanoTs > 0) {
    return nanoTs / 1_000_000;
  }
  if (typeof nanoTs === 'string' && nanoTs.length > 0) {
    const parsed = Number(nanoTs);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed / 1_000_000;
    }
  }
  const isoTs = row.timestamp;
  if (typeof isoTs === 'string' && isoTs.length > 0) {
    const ms = new Date(isoTs).getTime();
    if (Number.isFinite(ms) && ms > 0) {
      return ms;
    }
  }
  return 0;
};

const selectLatestOtelCost = (
  rows: Array<Record<string, unknown>>,
  agentId: string,
): OtelCostSample | null => {
  const filtered = rows.filter(row => {
    const metricName = row.metric_name;
    if (
      metricName !== COST_RUN_METRIC &&
      metricName !== COST_CUMULATIVE_METRIC
    ) {
      return false;
    }
    if (extractServiceName(row) !== OTEL_SERVICE_NAME) {
      return false;
    }
    return extractAgentId(row) === agentId;
  });

  if (filtered.length === 0) {
    return null;
  }

  let latestTimestampMs = 0;
  let runUsd = 0;
  let cumulativeUsd = 0;

  for (const row of filtered) {
    const ts = rowTimestampMs(row);
    if (!Number.isFinite(ts) || ts <= 0) {
      continue;
    }

    if (ts > latestTimestampMs) {
      latestTimestampMs = ts;
      runUsd = 0;
      cumulativeUsd = 0;
    }

    if (ts !== latestTimestampMs) {
      continue;
    }

    const value = Math.max(0, toMetricValue(row));
    if (row.metric_name === COST_RUN_METRIC) {
      runUsd += value;
    } else if (row.metric_name === COST_CUMULATIVE_METRIC) {
      cumulativeUsd = Math.max(cumulativeUsd, value);
    }
  }

  if (latestTimestampMs <= 0) {
    return null;
  }

  return {
    timestampMs: latestTimestampMs,
    runUsd,
    cumulativeUsd,
  };
};

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentGuardrailsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const { configuration } = useCoreStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  // Cost tracking
  const [snapshotRunCostUsd, setSnapshotRunCostUsd] = useState(0);
  const [runBudgetUsd, setRunBudgetUsd] = useState<number | null>(
    DEFAULT_RUN_BUDGET_USD,
  );
  const [totalTokens, setTotalTokens] = useState(0);
  const [otelRunCostUsd, setOtelRunCostUsd] = useState<number | null>(null);
  const [otelCumulativeCostUsd, setOtelCumulativeCostUsd] = useState<
    number | null
  >(null);
  const [otelSampleTimestamp, setOtelSampleTimestamp] = useState<number | null>(
    null,
  );

  // Tool approval queue
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const otelBaseUrl =
    configuration?.otelRunUrl ||
    configuration?.runUrl ||
    OTEL_BASE_URL_ENV ||
    DATALAYER_RUN_URL_ENV ||
    'https://prod1.datalayer.run';
  const podName = agentId;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  // Authenticated fetch helper (for sidecar endpoints)
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
            description: 'Agent with cost budget and tool approval guardrails',
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
  }, [agentBaseUrl, agentName, authFetch]);

  const handleGuardrailsStreamMessage = useCallback(
    (message: { raw?: unknown }) => {
      try {
        const stream = parseAgentStreamMessage(message?.raw ?? message);
        if (!stream) {
          return;
        }

        if (stream.type === 'agent.snapshot') {
          const payload =
            stream.payload as unknown as AgentStreamSnapshotPayload;
          setApprovals((payload.approvals ?? []).map(toApprovalRequest));

          const snapshotCost =
            payload.contextSnapshot?.costUsage ?? payload.costUsage;
          if (snapshotCost) {
            setSnapshotRunCostUsd(
              Number(
                snapshotCost.cumulativeCostUsd ??
                  snapshotCost.lastTurnCostUsd ??
                  0,
              ),
            );
            setRunBudgetUsd(prev =>
              snapshotCost.perRunBudgetUsd == null
                ? (prev ?? DEFAULT_RUN_BUDGET_USD)
                : Number(snapshotCost.perRunBudgetUsd),
            );
            setTotalTokens(Number(snapshotCost.totalTokensUsed ?? 0));
          }
          return;
        }

        if (stream.type === 'tool_approval_created') {
          const approval = toApprovalRequest(
            stream.payload as unknown as AgentStreamToolApprovalPayload,
          );
          setApprovals(prev => {
            const next = prev.filter(item => item.id !== approval.id);
            next.unshift(approval);
            return next;
          });
          return;
        }

        if (
          stream.type === 'tool_approval_approved' ||
          stream.type === 'tool_approval_rejected'
        ) {
          const approval =
            stream.payload as unknown as AgentStreamToolApprovalPayload;
          setApprovals(prev => prev.filter(item => item.id !== approval.id));
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    },
    [],
  );

  const approvalSocket = useAIAgentsWebSocket({
    enabled: isReady && Boolean(agentBaseUrl),
    baseUrl: agentBaseUrl,
    path: '/api/v1/tool-approvals/ws',
    queryParams: { agent_id: agentId },
    onMessage: handleGuardrailsStreamMessage,
    reconnectDelayMs: attempt =>
      Math.min(1000 * 2 ** Math.max(0, attempt - 1), 10000),
  });
  const wsState = approvalSocket.connectionState;

  useEffect(() => {
    setOtelRunCostUsd(null);
    setOtelCumulativeCostUsd(null);
    setOtelSampleTimestamp(null);

    if (!isReady || !token) {
      return;
    }

    let wsUrl: string;
    try {
      wsUrl = buildOtelWebSocketUrl({
        baseUrl: normalizeBaseUrl(otelBaseUrl),
        token,
      });
    } catch {
      return;
    }

    const unsubscribe = subscribeOtelWs(wsUrl, msg => {
      if (msg.signal !== 'metrics' || !Array.isArray(msg.data)) {
        return;
      }

      const sample = selectLatestOtelCost(msg.data, agentId);
      if (!sample) {
        return;
      }

      setOtelRunCostUsd(sample.runUsd);
      setOtelCumulativeCostUsd(sample.cumulativeUsd);
      setOtelSampleTimestamp(sample.timestampMs);
    });

    return unsubscribe;
  }, [agentId, isReady, otelBaseUrl, token]);

  // ── Approve / Reject ─────────────────────────────────────────────────────

  const handleApprove = useCallback(
    async (requestId: string) => {
      if (!agentBaseUrl) return;
      setApprovalLoading(requestId);
      try {
        await authFetch(
          `${agentBaseUrl}/api/v1/tool-approvals/${requestId}/approve`,
          { method: 'POST' },
        );
        setApprovals(prev => prev.filter(a => a.id !== requestId));
      } catch {
        /* ok */
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, authFetch],
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      if (!agentBaseUrl) return;
      setApprovalLoading(requestId);
      try {
        await authFetch(
          `${agentBaseUrl}/api/v1/tool-approvals/${requestId}/reject`,
          {
            method: 'POST',
            body: JSON.stringify({ reason: 'User rejected' }),
          },
        );
        setApprovals(prev => prev.filter(a => a.id !== requestId));
      } catch {
        /* ok */
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, authFetch],
  );

  // ── Loading / Error ──────────────────────────────────────────────────────

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
          Launching guardrails demo agent...
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const runCostUsd = Math.max(snapshotRunCostUsd, otelRunCostUsd ?? 0);
  const cumulativeCostUsd = otelCumulativeCostUsd;
  const isOverRunBudget =
    runBudgetUsd != null && runBudgetUsd > 0 && runCostUsd > runBudgetUsd;
  const runBudgetDisplayUsd =
    runBudgetUsd != null ? runBudgetUsd.toFixed(2) : '0.00';
  const overBudgetBanner = isOverRunBudget
    ? {
        variant: 'danger' as const,
        message: `Run budget exceeded: $${runCostUsd.toFixed(4)} / $${runBudgetDisplayUsd}. Start a new run or adjust the budget before sending more messages.`,
      }
    : undefined;
  const budgetForProgress = runBudgetUsd && runBudgetUsd > 0 ? runBudgetUsd : 1;
  const usagePercentRaw = (runCostUsd / budgetForProgress) * 100;
  const costPercent = Math.min(usagePercentRaw, 100);
  const usageSafePercent = Math.min(costPercent, 50);
  const usageWatchPercent = Math.min(Math.max(costPercent - 50, 0), 30);
  const usageDangerPercent = Math.min(Math.max(costPercent - 80, 0), 20);
  const overBudgetPercent = Math.max(usagePercentRaw - 100, 0);
  const overBudgetAmountUsd =
    runBudgetUsd != null && runBudgetUsd > 0
      ? Math.max(runCostUsd - runBudgetUsd, 0)
      : 0;
  const costColor =
    costPercent > 80
      ? 'danger.fg'
      : costPercent > 50
        ? 'attention.fg'
        : 'success.fg';

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Guardrails header bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        {isReconnectedAgent && (
          <Label variant="secondary" size="small">
            Reconnected
          </Label>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldCheckIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2 }}>
            Guardrails Demo — {podName}
          </Heading>
        </Box>
        <Label variant={wsState === 'connected' ? 'success' : 'secondary'}>
          {wsState}
        </Label>

        {/* Cost tracker */}
        <Box sx={{ flex: 1, maxWidth: 300 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 0,
              mb: 1,
            }}
          >
            <Text sx={{ color: costColor, fontWeight: 'semibold' }}>
              ${runCostUsd.toFixed(4)}
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              {runBudgetUsd != null
                ? ` / $${runBudgetUsd.toFixed(2)} run budget`
                : ' / no run budget'}
            </Text>
          </Box>
          <ProgressBar
            aria-label="Run budget usage"
            aria-valuenow={Math.max(0, costPercent)}
            sx={{ height: 6 }}
          >
            <ProgressBar.Item
              progress={usageSafePercent}
              style={{ backgroundColor: 'var(--bgColor-success-emphasis)' }}
              aria-label={`Healthy usage ${usageSafePercent.toFixed(1)}%`}
            />
            <ProgressBar.Item
              progress={usageWatchPercent}
              style={{ backgroundColor: 'var(--bgColor-accent-emphasis)' }}
              aria-label={`Watch usage ${usageWatchPercent.toFixed(1)}%`}
            />
            <ProgressBar.Item
              progress={usageDangerPercent}
              style={{ backgroundColor: 'var(--bgColor-danger-emphasis)' }}
              aria-label={`Critical usage ${usageDangerPercent.toFixed(1)}%`}
            />
          </ProgressBar>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
              mt: 1,
            }}
            role="presentation"
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DotFillIcon size={12} fill="var(--bgColor-success-emphasis)" />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>0-50%</Text>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DotFillIcon size={12} fill="var(--bgColor-accent-emphasis)" />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>50-80%</Text>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DotFillIcon size={12} fill="var(--bgColor-danger-emphasis)" />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>80-100%</Text>
            </Box>
            {overBudgetPercent > 0 && (
              <Label variant="danger" size="small">
                +{overBudgetPercent.toFixed(1)}% over
              </Label>
            )}
          </Box>
        </Box>

        <Label variant={otelSampleTimestamp == null ? 'secondary' : 'success'}>
          OTEL {otelSampleTimestamp == null ? 'waiting' : 'live'}
        </Label>

        {cumulativeCostUsd != null && (
          <Label variant="secondary">
            Total ${cumulativeCostUsd.toFixed(4)}
          </Label>
        )}

        {/* Token counter */}
        <Label variant="secondary">{totalTokens.toLocaleString()} tokens</Label>
      </Box>

      {isOverRunBudget && (
        <Flash variant="danger" sx={{ mx: 3, mt: 2 }}>
          <Text sx={{ fontSize: 1 }}>
            <strong>Run budget exceeded.</strong> Current run cost is $
            {runCostUsd.toFixed(4)} against a budget of ${runBudgetDisplayUsd}
            {overBudgetAmountUsd > 0
              ? ` (over by $${overBudgetAmountUsd.toFixed(4)}).`
              : '.'}{' '}
            Start a new run or increase the run budget before continuing.
          </Text>
        </Flash>
      )}

      {/* Tool approval banners */}
      {approvals.map(req => (
        <Flash key={req.id} variant="warning" sx={{ mx: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Text sx={{ flex: 1, fontSize: 1 }}>
              <strong>{req.tool_name}</strong> requests approval
              {req.tool_args
                ? ` — ${JSON.stringify(req.tool_args).slice(0, 120)}`
                : ''}
            </Text>
            <Button
              size="small"
              variant="primary"
              leadingVisual={CheckIcon}
              onClick={() => handleApprove(req.id)}
              disabled={approvalLoading === req.id}
            >
              Approve
            </Button>
            <Button
              size="small"
              variant="danger"
              leadingVisual={XIcon}
              onClick={() => handleReject(req.id)}
              disabled={approvalLoading === req.id}
            >
              Reject
            </Button>
          </Box>
        </Flash>
      ))}

      {/* Chat */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Chat
          protocol="vercel-ai"
          baseUrl={agentBaseUrl}
          agentId={agentId}
          authToken={chatAuthToken}
          title="Guardrails Agent"
          placeholder="Ask something that triggers tools…"
          description="Cost guardrail with OTEL-backed gauge and manual tool approval gates"
          showHeader={false}
          showTokenUsage={true}
          errorBanner={overBudgetBanner}
          disableInputPrompt={isOverRunBudget}
          autoFocus
          height="100%"
          runtimeId={agentId}
          historyEndpoint={`${agentBaseUrl}/api/v1/history`}
          suggestions={[
            { title: 'Update CRM', message: 'Update the CRM records for Q3' },
            { title: 'Report', message: 'Generate the weekly KPI report' },
          ]}
          submitOnSuggestionClick
        />
      </Box>
    </Box>
  );
};

// ─── Sync token to core IAM store ──────────────────────────────────────────

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentGuardrailsExample: React.FC = () => {
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
        <AgentGuardrailsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentGuardrailsExample;
