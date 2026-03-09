/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * DurableGuardrailsExample
 *
 * Demonstrates cost budget guardrails and tool approval flow for durable agents.
 *
 * - Launches an agent with a $5 cost limit per run
 * - Shows a real-time cost tracker alongside the chat
 * - Surfaces tool approval requests: when the agent calls a tool marked
 *   `approval: manual`, a banner appears with Approve / Reject buttons
 *
 * Backend: `python -m agent_runtimes --port 8765 --debug`
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
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { Chat } from '../chat';

// ─── Constants ─────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:8765';
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

// ─── Component ─────────────────────────────────────────────────────────────

const DurableGuardrailsExample: React.FC = () => {
  const [agentId, setAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(true);

  // Cost tracking
  const [costUsd, setCostUsd] = useState(0);
  const [totalTokens, setTotalTokens] = useState(0);

  // Tool approval queue
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  // ── Create agent ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      try {
        const check = await fetch(
          `${BASE_URL}/api/v1/agents/${encodeURIComponent(AGENT_NAME)}`,
        );
        if (check.ok) {
          if (!cancelled) {
            setAgentId(AGENT_NAME);
            setIsCreating(false);
          }
          return;
        }

        const res = await fetch(`${BASE_URL}/api/v1/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: AGENT_NAME,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'ag-ui',
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ detail: 'Unknown' }));
          if (res.status === 400 && d.detail?.includes('already exists')) {
            if (!cancelled) {
              setAgentId(AGENT_NAME);
              setIsCreating(false);
            }
            return;
          }
          throw new Error(d.detail);
        }
        const data = await res.json();
        if (!cancelled) {
          setAgentId(data.id);
          setIsCreating(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed');
          setIsCreating(false);
        }
      }
    };
    create();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Poll cost + tool approvals ───────────────────────────────────────────

  useEffect(() => {
    if (!agentId) return;
    const poll = async () => {
      try {
        // Cost usage
        const costRes = await fetch(
          `${BASE_URL}/api/v1/agents/${agentId}/cost`,
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
        const apprRes = await fetch(
          `${BASE_URL}/api/v1/agents/${agentId}/tool-approvals?status=pending`,
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
  }, [agentId]);

  // ── Approve / Reject ─────────────────────────────────────────────────────

  const handleApprove = useCallback(
    async (requestId: string) => {
      setApprovalLoading(requestId);
      try {
        await fetch(
          `${BASE_URL}/api/v1/agents/${agentId}/tool-approvals/${requestId}/approve`,
          { method: 'POST' },
        );
        setApprovals(prev => prev.filter(a => a.id !== requestId));
      } catch {
        /* ok */
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentId],
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      setApprovalLoading(requestId);
      try {
        await fetch(
          `${BASE_URL}/api/v1/agents/${agentId}/tool-approvals/${requestId}/reject`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
    [agentId],
  );

  // ── Loading / Error ──────────────────────────────────────────────────────

  if (isCreating) {
    return (
      <ThemedProvider>
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
            Creating guardrails demo agent…
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  if (error || !agentId) {
    return (
      <ThemedProvider>
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
          <Text sx={{ color: 'danger.fg' }}>{error || 'No agent ID'}</Text>
        </Box>
      </ThemedProvider>
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
    <ThemedProvider>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
              Guardrails Demo
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
          <Label variant="secondary">
            {totalTokens.toLocaleString()} tokens
          </Label>
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
            baseUrl={BASE_URL}
            agentId={agentId}
            title="Guardrails Agent"
            placeholder="Ask something that triggers tools…"
            description="Agent with $5 cost limit and tool approval gates"
            showHeader={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${BASE_URL}/api/v1/history`}
            suggestions={[
              { title: 'Update CRM', message: 'Update the CRM records for Q3' },
              { title: 'Report', message: 'Generate the weekly KPI report' },
            ]}
            submitOnSuggestionClick
          />
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default DurableGuardrailsExample;
