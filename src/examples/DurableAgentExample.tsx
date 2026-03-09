/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * DurableAgentExample
 *
 * Demonstrates launching a durable agent in the Datalayer cloud,
 * with pause/resume (CRIU checkpoint) and lifecycle controls.
 *
 * Prerequisites:
 *   - Set VITE_DATALAYER_RUN_URL and VITE_DATALAYER_API_TOKEN in .env
 *   - Backend: `python -m agent_runtimes --port 8765 --debug`
 *
 * This example authenticates via the Datalayer IAM store (same pattern
 * as OtelExample), creates an agent from the `mocks/monitor-sales-kpis`
 * spec, and renders a Chat with pause/resume/checkpoint buttons.
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback } from 'react';
import { Text, Button, Spinner, Label, Flash, Heading } from '@primer/react';
import {
  AlertIcon,
  PlayIcon,
  SquareIcon,
  HistoryIcon,
  CheckCircleIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { Chat } from '../chat';

// ─── Environment / defaults ────────────────────────────────────────────────

const AGENT_BASE_URL: string =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const RUN_URL: string =
  import.meta.env.VITE_DATALAYER_RUN_URL || 'https://prod1.datalayer.run';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';

// ─── Status badge ──────────────────────────────────────────────────────────

type AgentStatus =
  | 'creating'
  | 'running'
  | 'paused'
  | 'checkpointing'
  | 'error';

const STATUS_COLORS: Record<AgentStatus, string> = {
  creating: 'attention',
  running: 'success',
  paused: 'severe',
  checkpointing: 'accent',
  error: 'danger',
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface CheckpointInfo {
  checkpoint_id: string;
  s3_path: string;
  timestamp: string;
}

// ─── Component ─────────────────────────────────────────────────────────────

const DurableAgentExample: React.FC = () => {
  const { isSignedIn, token } = useSimpleAuthStore();

  const [agentId, setAgentId] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus>('creating');
  const [error, setError] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Authenticated fetch helper
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

  // Create agent from the durable KPI spec on mount
  useEffect(() => {
    if (!isSignedIn || !token) return;
    let cancelled = false;

    const ensureAgent = async () => {
      const agentName = 'durable-kpi-agent';

      try {
        // Check if already running
        const check = await authFetch(
          `${AGENT_BASE_URL}/api/v1/agents/${encodeURIComponent(agentName)}`,
        );
        if (check.ok) {
          if (!cancelled) {
            setAgentId(agentName);
            setStatus('running');
          }
          return;
        }

        // Create from spec
        const res = await authFetch(`${AGENT_BASE_URL}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            agent_spec_id: AGENT_SPEC_ID,
            transport: 'ag-ui',
            description:
              'Durable KPI agent example — exercises pause/resume and checkpointing',
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ detail: 'Unknown' }));
          if (res.status === 400 && data.detail?.includes('already exists')) {
            if (!cancelled) {
              setAgentId(agentName);
              setStatus('running');
            }
            return;
          }
          throw new Error(data.detail || `Create failed: ${res.status}`);
        }

        const data = await res.json();
        if (!cancelled) {
          setAgentId(data.id);
          setStatus('running');
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Agent creation failed',
          );
          setStatus('error');
        }
      }
    };

    ensureAgent();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, token, authFetch]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handlePause = useCallback(async () => {
    if (!agentId) return;
    setActionLoading(true);
    try {
      const res = await authFetch(
        `${RUN_URL}/api/runtimes/v1/runtimes/${agentId}/pause`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (res.ok) setStatus('paused');
      else throw new Error('Pause failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pause failed');
    } finally {
      setActionLoading(false);
    }
  }, [agentId, authFetch]);

  const handleResume = useCallback(async () => {
    if (!agentId) return;
    setActionLoading(true);
    try {
      const res = await authFetch(
        `${RUN_URL}/api/runtimes/v1/runtimes/${agentId}/resume`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (res.ok) setStatus('running');
      else throw new Error('Resume failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resume failed');
    } finally {
      setActionLoading(false);
    }
  }, [agentId, authFetch]);

  const handleCheckpoint = useCallback(async () => {
    if (!agentId) return;
    setActionLoading(true);
    setStatus('checkpointing');
    try {
      const res = await authFetch(
        `${RUN_URL}/api/runtimes/v1/runtimes/${agentId}/checkpoint`,
        {
          method: 'POST',
          body: JSON.stringify({
            agent_spec_id: AGENT_SPEC_ID,
            container: 'agent-runtimes',
          }),
        },
      );
      if (!res.ok) throw new Error('Checkpoint failed');
      const data = await res.json();
      setCheckpoints(prev => [
        {
          checkpoint_id: data.checkpoint_id || `ckpt-${Date.now()}`,
          s3_path: data.s3_path || '',
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
      setStatus('running');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkpoint failed');
      setStatus('running');
    } finally {
      setActionLoading(false);
    }
  }, [agentId, authFetch]);

  // ── Sign-in gate ─────────────────────────────────────────────────────────

  if (!isSignedIn) {
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
          <Heading sx={{ fontSize: 3 }}>Durable Agent Example</Heading>
          <Text sx={{ color: 'fg.muted', mb: 3 }}>
            Sign in with your Datalayer token to launch a cloud agent.
          </Text>
          <SignInSimple />
        </Box>
      </ThemedProvider>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (status === 'creating') {
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
            Launching durable agent from {AGENT_SPEC_ID}…
          </Text>
        </Box>
      </ThemedProvider>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (status === 'error') {
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
          <Text sx={{ color: 'danger.fg', fontSize: 2 }}>
            Agent failed to start
          </Text>
          <Text sx={{ color: 'fg.muted' }}>{error}</Text>
        </Box>
      </ThemedProvider>
    );
  }

  // ── Running / Paused ─────────────────────────────────────────────────────

  return (
    <ThemedProvider>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Toolbar */}
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
          <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
            Durable Agent — {agentId}
          </Heading>
          <Label variant={STATUS_COLORS[status] as any}>{status}</Label>
          {status === 'running' && (
            <>
              <Button
                size="small"
                leadingVisual={SquareIcon}
                onClick={handlePause}
                disabled={actionLoading}
              >
                Pause
              </Button>
              <Button
                size="small"
                leadingVisual={HistoryIcon}
                onClick={handleCheckpoint}
                disabled={actionLoading}
              >
                Checkpoint
              </Button>
            </>
          )}
          {status === 'paused' && (
            <Button
              size="small"
              variant="primary"
              leadingVisual={PlayIcon}
              onClick={handleResume}
              disabled={actionLoading}
            >
              Resume
            </Button>
          )}
          {actionLoading && <Spinner size="small" />}
        </Box>

        {/* Error flash */}
        {error && (
          <Flash variant="danger" sx={{ mx: 3, mt: 2 }}>
            {error}
          </Flash>
        )}

        {/* Checkpoints list */}
        {checkpoints.length > 0 && (
          <Box
            sx={{
              mx: 3,
              mt: 2,
              p: 2,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              sx={{
                fontWeight: 'semibold',
                fontSize: 1,
                display: 'block',
                mb: 1,
              }}
            >
              Checkpoints ({checkpoints.length})
            </Text>
            {checkpoints.map(ckpt => (
              <Box
                key={ckpt.checkpoint_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  fontSize: 0,
                  color: 'fg.muted',
                }}
              >
                <CheckCircleIcon size={12} />
                <Text>{ckpt.checkpoint_id}</Text>
                <Text sx={{ ml: 'auto' }}>
                  {new Date(ckpt.timestamp).toLocaleTimeString()}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {/* Chat area */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {agentId && status !== 'paused' ? (
            <Chat
              transport="ag-ui"
              baseUrl={AGENT_BASE_URL}
              agentId={agentId}
              title="Durable KPI Agent"
              placeholder="Ask about sales KPIs…"
              description="Durable agent with pause/resume and CRIU checkpointing"
              showHeader={false}
              showTokenUsage={true}
              autoFocus
              height="100%"
              runtimeId={agentId}
              historyEndpoint={`${AGENT_BASE_URL}/api/v1/history`}
              suggestions={[
                {
                  title: 'KPIs',
                  message: "Show me today's sales KPI dashboard",
                },
                {
                  title: 'Trends',
                  message: 'What are the current revenue trends?',
                },
              ]}
              submitOnSuggestionClick
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'fg.muted',
              }}
            >
              <Text sx={{ fontSize: 2 }}>
                Agent is paused — click Resume to continue the conversation.
              </Text>
            </Box>
          )}
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default DurableAgentExample;
