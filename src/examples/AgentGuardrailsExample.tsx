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
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import type {
  AgentStreamSnapshotPayload,
  AgentStreamToolApprovalPayload,
} from '../types/stream';
import { parseAgentStreamMessage } from '../types/stream';

const queryClient = new QueryClient();
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'guardrails-demo-agent';
const AGENT_SPEC_ID = 'guardrails-cost-tracking-demo';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  created_at: string;
}

const toWsUrl = (baseUrl: string, path: string): string | null => {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    return url.toString();
  } catch {
    return null;
  }
};

const toApprovalRequest = (
  payload: AgentStreamToolApprovalPayload,
): ToolApprovalRequest => ({
  id: payload.id,
  tool_name: payload.tool_name,
  tool_args: payload.tool_args ?? {},
  created_at: payload.created_at ?? new Date().toISOString(),
});

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentGuardrailsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  // Cost tracking
  const [costUsd, setCostUsd] = useState(0);
  const [runBudgetUsd, setRunBudgetUsd] = useState<number | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);

  // Tool approval queue
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'closed'>(
    'closed',
  );

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
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
  }, [agentBaseUrl, authFetch]);

  useEffect(() => {
    if (!isReady) {
      setWsState('closed');
      return;
    }

    const wsUrl = toWsUrl(
      agentBaseUrl,
      `/api/v1/tool-approvals/ws?agent_id=${encodeURIComponent(agentId)}`,
    );
    if (!wsUrl) {
      setWsState('closed');
      return;
    }

    let closedByCleanup = false;
    setWsState('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsState('connected');
    };

    ws.onmessage = event => {
      try {
        const stream = parseAgentStreamMessage(JSON.parse(String(event.data)));
        if (!stream) {
          return;
        }

        if (stream.type === 'agent.snapshot') {
          const payload =
            stream.payload as unknown as AgentStreamSnapshotPayload;
          const nextApprovals = (payload.approvals ?? []).map(
            toApprovalRequest,
          );
          setApprovals(nextApprovals);

          const snapshotCost =
            payload.contextSnapshot?.costUsage ?? payload.costUsage;
          if (snapshotCost) {
            setCostUsd(
              Number(
                snapshotCost.lastTurnCostUsd ??
                  snapshotCost.cumulativeCostUsd ??
                  0,
              ),
            );
            setRunBudgetUsd(
              snapshotCost.perRunBudgetUsd == null
                ? null
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
        // Ignore malformed websocket payloads.
      }
    };

    ws.onclose = () => {
      if (!closedByCleanup) {
        setWsState('closed');
      }
    };

    ws.onerror = () => {
      setWsState('closed');
    };

    return () => {
      closedByCleanup = true;
      ws.close();
      setWsState('closed');
    };
  }, [isReady, agentBaseUrl, agentId]);

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
    [agentBaseUrl, agentId, authFetch],
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
    [agentBaseUrl, agentId, authFetch],
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

  const budgetForProgress = runBudgetUsd && runBudgetUsd > 0 ? runBudgetUsd : 1;
  const costPercent = Math.min((costUsd / budgetForProgress) * 100, 100);
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
              ${costUsd.toFixed(4)}
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              {runBudgetUsd != null
                ? ` / $${runBudgetUsd.toFixed(2)} run budget`
                : ' / no run budget'}
            </Text>
          </Box>
          <ProgressBar progress={costPercent} sx={{ height: 6 }} />
        </Box>

        {/* Token counter */}
        <Label variant="secondary">{totalTokens.toLocaleString()} tokens</Label>
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
          description="CostTracking-style guardrail with budget limits and tool approval gates"
          showHeader={false}
          showTokenUsage={true}
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
          title="Guardrails Agent"
          description="Sign in to use agents with cost and tool guardrails."
          leadingIcon={<ShieldCheckIcon size={24} />}
        />
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
