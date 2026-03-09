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
 * Uses the `useDurableAgent` hook which:
 *   1. Creates a cloud runtime via the Datalayer Runtimes API
 *      (environment: 'ai-agents-env')
 *   2. Deploys an agent on the runtime's agent-runtimes sidecar
 *   3. Provides pause/resume/terminate lifecycle backed by CRIU
 *
 * Prerequisites:
 *   - Datalayer core configuration (runtimesRunUrl, aiagentsRunUrl)
 *   - Valid IAM token (set via SignInSimple or iamStore)
 */

/// <reference types="vite/client" />

import React, { useState, useCallback } from 'react';
import { Text, Button, Spinner, Label, Flash, Heading } from '@primer/react';
import {
  AlertIcon,
  PlayIcon,
  SquareIcon,
  HistoryIcon,
  CheckCircleIcon,
  WorkflowIcon,
  SignOutIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { Chat } from '../chat';
import { useDurableAgent } from '../runtime/useDurableAgent';
import type { DurableRuntimeStatus } from '../runtime/useDurableAgent';

// ─── Defaults ──────────────────────────────────────────────────────────────

const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';

// ─── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DurableRuntimeStatus, string> = {
  idle: 'secondary',
  launching: 'attention',
  ready: 'success',
  paused: 'severe',
  resuming: 'accent',
  error: 'danger',
};

// ─── Types ─────────────────────────────────────────────────────────────────

interface CheckpointInfo {
  checkpoint_id: string;
  timestamp: string;
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const DurableAgentInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const {
    runtime,
    runtimeStatus,
    agent,
    agentEndpoint,
    isReady,
    error: hookError,
    pause,
    resume,
    terminate,
  } = useDurableAgent({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: 'durable-kpi-agent',
      transport: 'ag-ui',
      description:
        'Durable KPI agent — exercises pause/resume and CRIU checkpointing',
    },
  });

  const [checkpoints, setCheckpoints] = useState<CheckpointInfo[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const displayError = hookError?.message || actionError;
  const podName = runtime?.podName || '(launching…)';
  const agentId = agent?.agentId || AGENT_SPEC_ID;
  const agentBaseUrl = runtime?.agentBaseUrl || '';

  // ── Actions ──────────────────────────────────────────────────────────────

  const handlePause = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await pause();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Pause failed');
    } finally {
      setActionLoading(false);
    }
  }, [pause]);

  const handleResume = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await resume();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Resume failed');
    } finally {
      setActionLoading(false);
    }
  }, [resume]);

  const handleCheckpoint = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      // Pause creates a CRIU checkpoint
      await pause();
      setCheckpoints(prev => [
        {
          checkpoint_id: `ckpt-${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
      // Resume immediately after checkpoint
      await resume();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Checkpoint failed');
    } finally {
      setActionLoading(false);
    }
  }, [pause, resume]);

  const handleTerminate = useCallback(async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await terminate();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Terminate failed');
    } finally {
      setActionLoading(false);
    }
  }, [terminate]);

  // ── Launching ────────────────────────────────────────────────────────────

  if (
    runtimeStatus === 'idle' ||
    runtimeStatus === 'launching' ||
    (runtimeStatus === 'ready' && !isReady)
  ) {
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
            ? `Launching runtime for ${AGENT_SPEC_ID}…`
            : 'Creating agent on runtime…'}
        </Text>
      </Box>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (runtimeStatus === 'error' && !runtime) {
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
        <Text sx={{ color: 'danger.fg', fontSize: 2 }}>
          Agent failed to start
        </Text>
        <Text sx={{ color: 'fg.muted' }}>{displayError}</Text>
      </Box>
    );
  }

  // ── Running / Paused ─────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
          Durable Agent — {podName}
        </Heading>
        <Label variant={STATUS_COLORS[runtimeStatus] as any}>
          {runtimeStatus}
        </Label>
        {(runtimeStatus === 'ready' || runtimeStatus === 'resuming') && (
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
            <Button
              size="small"
              variant="danger"
              leadingVisual={XCircleIcon}
              onClick={handleTerminate}
              disabled={actionLoading}
            >
              Terminate
            </Button>
          </>
        )}
        {runtimeStatus === 'paused' && (
          <>
            <Button
              size="small"
              variant="primary"
              leadingVisual={PlayIcon}
              onClick={handleResume}
              disabled={actionLoading}
            >
              Resume
            </Button>
            <Button
              size="small"
              variant="danger"
              leadingVisual={XCircleIcon}
              onClick={handleTerminate}
              disabled={actionLoading}
            >
              Terminate
            </Button>
          </>
        )}
        {actionLoading && <Spinner size="small" />}
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

      {/* Error flash */}
      {displayError && (
        <Flash variant="danger" sx={{ mx: 3, mt: 2 }}>
          {displayError}
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
        {isReady && runtimeStatus !== 'paused' ? (
          <Chat
            transport="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Durable KPI Agent"
            placeholder="Ask about sales KPIs…"
            description="Durable agent with pause/resume and CRIU checkpointing"
            showHeader={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
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
              {runtimeStatus === 'paused'
                ? 'Agent is paused — click Resume to continue the conversation.'
                : 'Connecting to agent…'}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

// ─── Main component with auth gate ─────────────────────────────────────────

const DurableAgentExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={setAuth}
          title="Durable Agents"
          description="Sign in to launch and manage durable agents."
          leadingIcon={<WorkflowIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <DurableAgentInner onLogout={clearAuth} />
    </ThemedProvider>
  );
};

export default DurableAgentExample;
