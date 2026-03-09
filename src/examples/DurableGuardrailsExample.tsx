/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * DurableGuardrailsExample
 *
 * Demonstrates cost budget guardrails and tool approval flow for durable agents.
 *
 * - Creates a cloud runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows a real-time cost tracker alongside the chat
 * - Surfaces tool approval requests: when the agent calls a tool marked
 *   `approval: manual`, a banner appears with Approve / Reject buttons
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback } from 'react';
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
  AlertIcon,
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useDurableAgent } from '../runtime/useDurableAgent';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'guardrails-demo-agent';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';
const COST_LIMIT_USD = 5.0;

// ─── Types ─────────────────────────────────────────────────────────────────

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  timestamp: string;
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const DurableGuardrailsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const {
    runtime,
    agent,
    runtimeStatus,
    isReady,
    error: hookError,
  } = useDurableAgent({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: AGENT_NAME,
      transport: 'ag-ui',
      description: 'Agent with cost budget and tool approval guardrails',
    },
  });

  // Cost tracking
  const [costUsd, setCostUsd] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);

  // Tool approval queue
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = agent?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';

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

  // ── Poll cost + tool approvals ───────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        // Cost usage
        const costRes = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/cost`,
        );
        if (costRes.ok) {
          const d = await costRes.json();
          setCostUsd(d.total_cost_usd ?? d.cost ?? 0);
          setTotalTokens(d.total_tokens ?? 0);
        }
      } catch {
        /* endpoint may not be wired */
      }

      try {
        // Tool approvals
        const apprRes = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals?status=pending`,
        );
        if (apprRes.ok) {
          const d = await apprRes.json();
          setApprovals(Array.isArray(d) ? d : (d.requests ?? []));
        }
      } catch {
        /* ok */
      }
    };

    poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  // ── Approve / Reject ─────────────────────────────────────────────────────

  const handleApprove = useCallback(
    async (requestId: string) => {
      if (!agentBaseUrl) return;
      setApprovalLoading(requestId);
      try {
        await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals/${requestId}/approve`,
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
          `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals/${requestId}/reject`,
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
          {runtimeStatus === 'launching'
            ? 'Launching runtime for guardrails agent…'
            : 'Creating guardrails demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
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
        <AlertIcon size={48} />
        <Text sx={{ color: 'danger.fg' }}>
          {hookError?.message || 'Agent failed to start'}
        </Text>
      </Box>
    );
  }

  const costPercent = Math.min((costUsd / COST_LIMIT_USD) * 100, 100);
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShieldCheckIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2 }}>
            Guardrails Demo — {podName}
          </Heading>
        </Box>

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
              / ${COST_LIMIT_USD.toFixed(2)} limit
            </Text>
          </Box>
          <ProgressBar progress={costPercent} sx={{ height: 6 }} />
        </Box>

        {/* Token counter */}
        <Label variant="secondary">{totalTokens.toLocaleString()} tokens</Label>
        {token && <UserBadge token={token} />}
        <Button
          size="small"
          variant="invisible"
          onClick={onLogout}
          leadingVisual={SignOutIcon}
          sx={{ color: 'fg.muted' }}
        >
          Logout
        </Button>
      </Box>

      {/* Tool approval banners */}
      {approvals.map(req => (
        <Flash key={req.id} variant="warning" sx={{ mx: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Text sx={{ flex: 1, fontSize: 1 }}>
              <strong>{req.tool_name}</strong> requests approval
              {req.arguments
                ? ` — ${JSON.stringify(req.arguments).slice(0, 120)}`
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
          transport="ag-ui"
          baseUrl={agentBaseUrl}
          agentId={agentId}
          title="Guardrails Agent"
          placeholder="Ask something that triggers tools…"
          description="Agent with $5 cost limit and tool approval gates"
          showHeader={false}
          showTokenUsage={true}
          autoFocus
          height="100%"
          runtimeId={podName}
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

// ─── Main component with auth gate ─────────────────────────────────────────

const DurableGuardrailsExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={setAuth}
          title="Guardrails Agent"
          description="Sign in to use agents with cost and tool guardrails."
          leadingIcon={<ShieldCheckIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <DurableGuardrailsInner onLogout={clearAuth} />
    </ThemedProvider>
  );
};

export default DurableGuardrailsExample;
