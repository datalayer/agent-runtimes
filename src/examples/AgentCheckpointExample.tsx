/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCheckpointExample
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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Text,
  Button,
  IconButton,
  Spinner,
  Label,
  Flash,
  Heading,
  Tooltip,
} from '@primer/react';
import {
  AlertIcon,
  PlayIcon,
  SquareIcon,
  HistoryIcon,
  CheckCircleIcon,
  WorkflowIcon,
  SignOutIcon,
  XCircleIcon,
  ClockIcon,
  TagIcon,
  GlobeIcon,
  ZapIcon,
  GraphIcon,
  AiModelIcon,
  PeopleIcon,
  SidebarCollapseIcon,
  SidebarExpandIcon,
  SyncIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useDurableAgent } from '../runtime/useDurableAgent';
import type {
  DurableRuntimeStatus,
  CheckpointRecord,
} from '../runtime/useDurableAgent';

// ─── Running agent entry ───────────────────────────────────────────────────

interface RunningAgent {
  id: string;
  name?: string;
  description?: string;
  status?: string;
  protocol?: string;
  model?: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';

/**
 * Agent spec attributes displayed in the sidebar.
 * In production this would be fetched from the agentspecs service.
 */
const AGENT_SPEC = {
  id: 'monitor-sales-kpis',
  name: 'Monitor Sales KPIs',
  description:
    'Monitor and analyze sales KPIs from the CRM system. Generate daily reports, identify trends, and flag anomalies.',
  model: 'openai-gpt-4-1',
  protocol: 'ag-ui',
  memory: 'mem0',
  sandbox_variant: 'jupyter',
  environment_name: 'ai-agents-env',
  tags: ['support', 'chatbot', 'sales', 'kpi', 'monitoring'],
  trigger: {
    type: 'schedule',
    cron: '0 8 * * *',
    description: 'Every day at 8:00 AM UTC',
  },
  model_config: { temperature: 0.3, max_tokens: 4096 },
  advanced: {
    cost_limit: '$5.00 per run',
    time_limit: '300 seconds',
    max_iterations: 50,
    checkpoint_interval: 30,
  },
  icon: 'graph',
  emoji: '📊',
  color: '#2da44e',
};

// ─── Status badge ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DurableRuntimeStatus, string> = {
  idle: 'secondary',
  launching: 'attention',
  ready: 'success',
  paused: 'severe',
  resuming: 'accent',
  error: 'danger',
};

// ─── Sidebar width ─────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 300;

// ─── Spec attribute row helper ─────────────────────────────────────────────

const SpecRow: React.FC<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  label: string;
  value: string;
}> = ({ icon: Icon, label, value }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 2,
      fontSize: 0,
      mb: 1,
    }}
  >
    {Icon && (
      <Box sx={{ color: 'fg.muted', flexShrink: 0, mt: '2px' }}>
        <Icon size={12} />
      </Box>
    )}
    <Text sx={{ color: 'fg.muted', flexShrink: 0, minWidth: 80 }}>{label}</Text>
    <Text sx={{ fontWeight: 'semibold', wordBreak: 'break-word' }}>
      {value}
    </Text>
  </Box>
);

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentCheckpointInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const {
    runtime,
    runtimeStatus,
    agent,
    agentEndpoint: _agentEndpoint,
    isReady,
    error: hookError,
    launchRuntime,
    createAgent,
    pause,
    resume,
    terminate,
    checkpoint,
    refreshCheckpoints,
    checkpoints,
  } = useDurableAgent({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: false,
    agentSpec: AGENT_SPEC,
    agentConfig: {
      name: 'durable-kpi-agent',
      transport: 'ag-ui',
      description:
        'Durable KPI agent — exercises pause/resume and CRIU checkpointing',
    },
  });

  const [isStarting, setIsStarting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningAgents, setRunningAgents] = useState<RunningAgent[]>([]);

  const displayError = hookError?.message || actionError;
  const podName = runtime?.podName || '(launching…)';
  const agentId = agent?.agentId || AGENT_SPEC_ID;
  const agentBaseUrl = runtime?.agentBaseUrl || '';

  const handleLaunch = useCallback(async () => {
    setIsStarting(true);
    setActionError(null);
    try {
      await launchRuntime();
      await createAgent();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setIsStarting(false);
    }
  }, [launchRuntime, createAgent]);

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
      await checkpoint();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Checkpoint failed');
    } finally {
      setActionLoading(false);
    }
  }, [checkpoint]);

  // Fetch running agents from the sidecar
  const refreshAgents = useCallback(async () => {
    if (!agentBaseUrl) return;
    try {
      const res = await fetch(`${agentBaseUrl}/api/v1/agents`);
      if (!res.ok) return;
      const data = await res.json();
      setRunningAgents(data.agents ?? []);
    } catch {
      // silently ignore – agents list is informational
    }
  }, [agentBaseUrl]);

  // Refresh checkpoints and agents when runtime becomes ready
  useEffect(() => {
    if (runtimeStatus === 'ready' && runtime) {
      refreshCheckpoints();
      refreshAgents();
    }
  }, [runtimeStatus, runtime, refreshCheckpoints, refreshAgents]);

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

  // ── Idle — show launch page ──────────────────────────────────────────────

  if (runtimeStatus === 'idle' && !isStarting) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 60px)',
          gap: 3,
        }}
      >
        <WorkflowIcon size={48} />
        <Heading as="h2" sx={{ fontSize: 3 }}>
          Durable Agent
        </Heading>
        <Text sx={{ color: 'fg.muted', textAlign: 'center', maxWidth: 400 }}>
          Launch a cloud runtime with pause/resume and CRIU checkpointing. The
          agent will be deployed from the <strong>{AGENT_SPEC_ID}</strong> spec.
        </Text>
        {displayError && (
          <Flash variant="danger" sx={{ maxWidth: 400 }}>
            {displayError}
          </Flash>
        )}
        <Button
          variant="primary"
          size="large"
          leadingVisual={PlayIcon}
          onClick={handleLaunch}
        >
          Launch Durable Agent
        </Button>
        {token && <UserBadge token={token} />}
        <Button
          size="small"
          variant="invisible"
          onClick={onLogout}
          leadingVisual={SignOutIcon}
          sx={{ color: 'fg.muted', mt: 2 }}
        >
          Sign out
        </Button>
      </Box>
    );
  }

  // ── Launching ────────────────────────────────────────────────────────────

  if (
    runtimeStatus === 'launching' ||
    isStarting ||
    (runtimeStatus === 'ready' && !isReady)
  ) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 60px)',
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
        <Button
          size="small"
          variant="invisible"
          onClick={() => setSidebarOpen(prev => !prev)}
          leadingVisual={sidebarOpen ? SidebarCollapseIcon : SidebarExpandIcon}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Durable Agent — {podName}
        </Heading>
        <Label variant={STATUS_COLORS[runtimeStatus] as any}>
          {runtimeStatus}
        </Label>
        {(runtimeStatus === 'ready' ||
          runtimeStatus === 'resuming' ||
          runtimeStatus === 'paused') && (
          <>
            <Button
              size="small"
              leadingVisual={SquareIcon}
              onClick={handlePause}
              disabled={actionLoading || runtimeStatus === 'paused'}
            >
              Pause
            </Button>
            {runtimeStatus === 'paused' ? (
              <Button
                size="small"
                variant="primary"
                leadingVisual={PlayIcon}
                onClick={handleResume}
                disabled={actionLoading}
              >
                Resume
              </Button>
            ) : (
              <Button
                size="small"
                leadingVisual={HistoryIcon}
                onClick={handleCheckpoint}
                disabled={actionLoading}
              >
                Checkpoint
              </Button>
            )}
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
        {token && <UserBadge token={token} />}
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

      {/* Error flash */}
      {displayError && (
        <Flash variant="danger" sx={{ mx: 3, mt: 2 }}>
          {displayError}
        </Flash>
      )}

      {/* Main content: Sidebar + Chat */}
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        {sidebarOpen && (
          <Box
            sx={{
              width: SIDEBAR_WIDTH,
              flexShrink: 0,
              borderRight: '1px solid',
              borderColor: 'border.default',
              overflowY: 'auto',
              bg: 'canvas.subtle',
            }}
          >
            {/* Spec Attributes */}
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}
              >
                <Text sx={{ fontSize: '20px' }}>{AGENT_SPEC.emoji}</Text>
                <Heading as="h4" sx={{ fontSize: 2, m: 0 }}>
                  {AGENT_SPEC.name}
                </Heading>
              </Box>
              <Text
                sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mb: 3 }}
              >
                {AGENT_SPEC.description}
              </Text>

              <SpecRow
                icon={AiModelIcon}
                label="Model"
                value={AGENT_SPEC.model}
              />
              <SpecRow
                icon={GlobeIcon}
                label="Protocol"
                value={AGENT_SPEC.protocol}
              />
              <SpecRow
                icon={ZapIcon}
                label="Memory"
                value={AGENT_SPEC.memory}
              />
              <SpecRow
                icon={GraphIcon}
                label="Environment"
                value={AGENT_SPEC.environment_name}
              />
              <SpecRow
                icon={ClockIcon}
                label="Trigger"
                value={AGENT_SPEC.trigger.description}
              />
              <SpecRow
                icon={TagIcon}
                label="Tags"
                value={AGENT_SPEC.tags.join(', ')}
              />

              <Box
                sx={{
                  mt: 2,
                  pt: 2,
                  borderTop: '1px solid',
                  borderColor: 'border.default',
                }}
              >
                <Text
                  sx={{
                    fontWeight: 'semibold',
                    fontSize: 0,
                    display: 'block',
                    mb: 1,
                  }}
                >
                  Advanced
                </Text>
                <SpecRow
                  label="Cost limit"
                  value={AGENT_SPEC.advanced.cost_limit}
                />
                <SpecRow
                  label="Time limit"
                  value={AGENT_SPEC.advanced.time_limit}
                />
                <SpecRow
                  label="Max iterations"
                  value={String(AGENT_SPEC.advanced.max_iterations)}
                />
                <SpecRow
                  label="Checkpoint interval"
                  value={`${AGENT_SPEC.advanced.checkpoint_interval}s`}
                />
                <SpecRow
                  label="Temperature"
                  value={String(AGENT_SPEC.model_config.temperature)}
                />
                <SpecRow
                  label="Max tokens"
                  value={String(AGENT_SPEC.model_config.max_tokens)}
                />
              </Box>
            </Box>

            {/* Running Agents */}
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <PeopleIcon size={14} />
                <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
                  Running Agents ({runningAgents.length})
                </Text>
              </Box>
              {runningAgents.length === 0 ? (
                <Text
                  sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}
                >
                  No agents running on this runtime.
                </Text>
              ) : (
                runningAgents.map((a: RunningAgent) => (
                  <Box
                    key={a.id}
                    sx={{
                      p: 2,
                      mb: 1,
                      bg: 'canvas.default',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Label variant="success" sx={{ fontSize: '10px' }}>
                        {a.status ?? 'running'}
                      </Label>
                      <Text
                        sx={{ fontWeight: 'semibold', fontSize: 0, flex: 1 }}
                      >
                        {a.name ?? a.id}
                      </Text>
                    </Box>
                    {a.description && (
                      <Text
                        sx={{
                          fontSize: 0,
                          color: 'fg.muted',
                          display: 'block',
                          mb: 1,
                        }}
                      >
                        {a.description}
                      </Text>
                    )}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {a.protocol && (
                        <Label sx={{ fontSize: '10px' }} variant="accent">
                          {a.protocol}
                        </Label>
                      )}
                      <Box sx={{ flex: 1 }} />
                      <Button
                        size="small"
                        variant="danger"
                        leadingVisual={XCircleIcon}
                        onClick={handleTerminate}
                        disabled={actionLoading}
                        sx={{ fontSize: 0 }}
                      >
                        Terminate
                      </Button>
                    </Box>
                  </Box>
                ))
              )}
            </Box>

            {/* Checkpoints List */}
            <Box sx={{ p: 3 }}>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <HistoryIcon size={14} />
                <Text sx={{ fontWeight: 'semibold', fontSize: 1, flex: 1 }}>
                  Checkpoints ({checkpoints.length})
                </Text>
                <IconButton
                  aria-label="Refresh checkpoints"
                  icon={SyncIcon}
                  size="small"
                  variant="invisible"
                  onClick={refreshCheckpoints}
                />
              </Box>
              {checkpoints.length === 0 ? (
                <Text
                  sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}
                >
                  No checkpoints yet. Click "Checkpoint" to create one.
                </Text>
              ) : (
                checkpoints.map((ckpt: CheckpointRecord) => (
                  <Box
                    key={ckpt.id}
                    sx={{
                      p: 2,
                      mb: 1,
                      bg: 'canvas.default',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      {ckpt.status === 'failed' ? (
                        <AlertIcon size={12} fill="var(--fgColor-danger)" />
                      ) : (
                        <CheckCircleIcon size={12} />
                      )}
                      <Text
                        sx={{ fontWeight: 'semibold', fontSize: 0, flex: 1 }}
                      >
                        {ckpt.name}
                      </Text>
                      <Label
                        variant={
                          ckpt.status === 'failed'
                            ? 'danger'
                            : ckpt.status === 'paused'
                              ? 'done'
                              : 'secondary'
                        }
                        sx={{ fontSize: '9px', textTransform: 'capitalize' }}
                      >
                        {ckpt.status}
                      </Label>
                    </Box>
                    <Text
                      sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}
                    >
                      {new Date(ckpt.updated_at).toLocaleString()}
                    </Text>
                    {ckpt.status_message && (
                      <Tooltip text={ckpt.status_message} direction="w">
                        <button
                          type="button"
                          style={{
                            all: 'unset',
                            display: 'block',
                            marginTop: 4,
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%',
                            fontSize: 'var(--text-body-size-small, 12px)',
                            color:
                              'var(--fgColor-danger, var(--color-danger-fg))',
                          }}
                        >
                          {ckpt.status_message}
                        </button>
                      </Tooltip>
                    )}
                    {ckpt.agentspec_id && (
                      <Label sx={{ mt: 1, fontSize: '10px' }} variant="accent">
                        {ckpt.agentspec_id}
                      </Label>
                    )}
                  </Box>
                ))
              )}
            </Box>
          </Box>
        )}

        {/* ── Chat area ───────────────────────────────────────────────── */}
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
    </Box>
  );
};

// ─── Sync token to core IAM store ──────────────────────────────────────────

/**
 * Sync a token into the core `iamStore` so that stateful API helpers
 * (e.g. `createRuntime`) can authenticate requests.  `useSimpleAuthStore`
 * is a lightweight localStorage-backed store used by `SignInSimple`, but
 * the stateful runtimes API reads credentials from `iamStore`.
 */
const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentCheckpointExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  // Sync persisted token (from a previous session) to iamStore on mount
  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  // Wrap setAuth to also sync the token to iamStore on sign-in
  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      syncTokenToIamStore(newToken);
    },
    [setAuth],
  );

  // Clear iamStore token on logout
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
          title="Agent Checkpointing"
          description="Sign in to launch and checkpoint durable agents."
          leadingIcon={<WorkflowIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <AgentCheckpointInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentCheckpointExample;
