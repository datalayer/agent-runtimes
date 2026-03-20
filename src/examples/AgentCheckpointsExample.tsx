/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCheckpointsExample
 *
 * Demonstrates launching a agent in the Datalayer cloud,
 * with pause/resume (checkpoint) and lifecycle controls.
 *
 * Uses the `useAgent` hook which:
 *   1. Creates a cloud agent runtime via the Datalayer Runtimes API
 *      (environment: 'ai-agents-env')
 *   2. Deploys an agent on the runtime's agent-runtimes sidecar
 *   3. Provides pause/resume/terminate lifecycle backed by CRIU
 *
 * Prerequisites:
 *   - Datalayer core configuration (runtimesRunUrl, aiagentsRunUrl)
 *   - Valid IAM token (set via SignInSimple or iamStore)
 */

/// <reference types="vite/client" />

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  AgentIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { coreStore } from '@datalayer/core';
import { ThemedProvider } from './stores/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useAgents, AGENT_STATUS_COLORS } from '../hooks/useAgents';
import type { CheckpointRecord } from '../hooks/useAgents';

const queryClient = new QueryClient();

type CheckpointMode = 'criu' | 'light';

// ─── Running agent entry ───────────────────────────────────────────────────

interface RunningAgent {
  id: string;
  podName: string;
  name?: string;
  description?: string;
  status?: string;
  protocol?: string;
  model?: string;
  environmentName?: string;
  jupyterBaseUrl?: string;
}

// ─── Defaults ──────────────────────────────────────────────────────────────

const AGENT_SPEC_ID = 'monitor-sales-kpis';
const DEMO_AGENT_NAME = AGENT_SPEC_ID;
const LIGHT_CHECKPOINT_MESSAGES = [
  '[Checkpoint] Captured message history snapshot',
  '[Checkpoint] Saved conversational context for lightweight resume',
];

/**
 * Agent spec attributes displayed in the sidebar.
 * In production this would be fetched from the agentspecs service.
 */
const AGENT_SPEC = {
  id: 'monitor-sales-kpis',
  name: 'Monitor Sales KPIs',
  description:
    'Monitor and analyze sales KPIs from the CRM system. Generate daily reports, identify trends, and flag anomalies.',
  model: 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0',
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

const STATUS_COLORS = AGENT_STATUS_COLORS;

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

const AgentCheckpointsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const {
    runtime,
    status: runtimeStatus,
    endpoint: _agentEndpoint,
    isReady,
    error: hookError,
    launchRuntime,
    connectToRuntime,
    pause,
    resume,
    terminate,
    refreshCheckpoints,
    checkpoints,
    runtimes: agentRuntimes,
    refetchRuntimes,
    deleteRuntimeByPod,
    deletePausedRuntimeByPod,
  } = useAgents({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: false,
    agentSpec: AGENT_SPEC,
    agentConfig: {
      name: DEMO_AGENT_NAME,
      transport: 'ag-ui',
      description:
        'Monitor Sales KPI agent — exercises pause/resume checkpointing',
    },
  });

  const [isStarting, setIsStarting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [runningAgentsOverride, setRunningAgentsOverride] = useState<
    RunningAgent[] | null
  >(null);
  const [resumeMode, setResumeMode] = useState<CheckpointMode>('light');
  const autoConnectAttemptRef = useRef<string | null>(null);

  const displayError = hookError || actionError;
  const podName = runtime?.podName || '(launching…)';
  const agentId = runtime?.agentId || AGENT_SPEC_ID;
  const agentBaseUrl = runtime?.agentBaseUrl || '';

  const handleLaunch = useCallback(async () => {
    setIsStarting(true);
    setActionError(null);
    try {
      await launchRuntime();
      // Auto-create effect will fire once durableStatus='ready' and runtime is set.
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Launch failed');
    } finally {
      setIsStarting(false);
    }
  }, [launchRuntime]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const refreshAgents = useCallback(async () => {
    await refetchRuntimes();
  }, [refetchRuntimes]);

  const handlePause = useCallback(
    async (mode: CheckpointMode) => {
      setActionLoading(true);
      setActionError(null);
      try {
        await pause(
          mode,
          mode === 'light' ? LIGHT_CHECKPOINT_MESSAGES : undefined,
        );
        await Promise.all([refreshCheckpoints(), refreshAgents()]);
        await terminate();
        setRunningAgentsOverride([]);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Checkpoint failed');
      } finally {
        setActionLoading(false);
      }
    },
    [pause, refreshCheckpoints, refreshAgents, terminate],
  );

  const handleResume = useCallback(
    async (mode: CheckpointMode, checkpointId?: string, podName?: string) => {
      setActionLoading(true);
      setActionError(null);
      try {
        await resume(mode, checkpointId, podName);
        await Promise.all([refreshCheckpoints(), refreshAgents()]);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Resume failed');
      } finally {
        setActionLoading(false);
      }
    },
    [resume, refreshCheckpoints, refreshAgents],
  );

  // Refresh lists when a runtime connection is established.
  useEffect(() => {
    if (runtime?.podName) {
      refreshCheckpoints();
      refreshAgents();
    }
  }, [runtime?.podName, refreshCheckpoints, refreshAgents]);

  // Clear the manual override once a real runtimes fetch lands.
  useEffect(() => {
    if (runningAgentsOverride && agentRuntimes) {
      setRunningAgentsOverride(null);
    }
  }, [agentRuntimes, runningAgentsOverride]);

  const runningAgents = useMemo<RunningAgent[]>(() => {
    if (runningAgentsOverride) return runningAgentsOverride;
    return (agentRuntimes || []).map(rt => ({
      id: rt.id,
      podName: rt.pod_name,
      name: rt.name,
      description: rt.environment_title || rt.environment_name,
      status: rt.status,
      protocol: 'ag-ui',
      environmentName: rt.environment_name,
      jupyterBaseUrl: rt.url,
    }));
  }, [agentRuntimes, runningAgentsOverride]);

  // Auto-bind to matching runtime when idle so actions target a real runtime.
  useEffect(() => {
    if (runtime) {
      autoConnectAttemptRef.current = null;
      return;
    }

    if (
      (runtimeStatus !== 'idle' && runtimeStatus !== 'disconnected') ||
      runningAgents.length === 0
    ) {
      return;
    }

    const candidate =
      runningAgents.find(a => a.name === DEMO_AGENT_NAME) || runningAgents[0];
    if (!candidate?.jupyterBaseUrl || !candidate.environmentName) {
      return;
    }

    // Prevent reconnect loops to the same runtime while status remains idle/disconnected.
    if (autoConnectAttemptRef.current === candidate.podName) {
      return;
    }
    autoConnectAttemptRef.current = candidate.podName;

    connectToRuntime({
      podName: candidate.podName,
      environmentName: candidate.environmentName,
      jupyterBaseUrl: candidate.jupyterBaseUrl,
    });
  }, [runtime, runtimeStatus, runningAgents, connectToRuntime]);

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

  const handleTerminateRuntime = useCallback(
    async (agent: RunningAgent) => {
      setActionLoading(true);
      setActionError(null);
      try {
        const isCurrentRuntime = runtime?.podName === agent.podName;
        const isLastKnownRuntime =
          runningAgents.length === 1 &&
          runningAgents[0].podName === agent.podName;
        if (agent.status === 'paused') {
          await deletePausedRuntimeByPod(agent.podName);
        } else {
          await deleteRuntimeByPod(agent.podName);
        }
        // Ensure sidebar terminate resets to the home state like header terminate.
        if (isCurrentRuntime || isLastKnownRuntime) {
          await terminate();
        }
        await Promise.all([refreshAgents(), refreshCheckpoints()]);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : 'Terminate failed');
      } finally {
        setActionLoading(false);
      }
    },
    [
      deletePausedRuntimeByPod,
      deleteRuntimeByPod,
      refreshAgents,
      refreshCheckpoints,
      runningAgents,
      runtime?.podName,
      terminate,
    ],
  );

  const pausedAgents = runningAgents.filter(a => a.status === 'paused');
  const activeAgents = runningAgents.filter(a => a.status !== 'paused');
  const checkpointRuntimeIds = new Set(
    checkpoints
      .map((ckpt: CheckpointRecord) => ckpt.runtime_uid)
      .filter((value): value is string => Boolean(value)),
  );
  const pausedAgentsWithoutCheckpoint = pausedAgents.filter(
    (a: RunningAgent) => !checkpointRuntimeIds.has(a.podName),
  );

  const showNoAgentRunningView =
    (runtimeStatus === 'idle' || runtimeStatus === 'disconnected') &&
    !isStarting;
  const showLaunchingView =
    runtimeStatus === 'launching' ||
    runtimeStatus === 'connecting' ||
    isStarting;

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
          Agent — {podName}
        </Heading>
        <Label variant={STATUS_COLORS[runtimeStatus]}>{runtimeStatus}</Label>
        {(runtimeStatus === 'ready' ||
          runtimeStatus === 'resumed' ||
          runtimeStatus === 'resuming' ||
          runtimeStatus === 'paused') && (
          <>
            <Button
              size="small"
              leadingVisual={SquareIcon}
              onClick={() => handlePause('light')}
              disabled={
                actionLoading ||
                runtimeStatus === 'paused' ||
                runtimeStatus === 'resumed'
              }
            >
              Checkpoint (Light) + Terminate
            </Button>
            <Button
              size="small"
              leadingVisual={SquareIcon}
              onClick={() => handlePause('criu')}
              disabled={
                actionLoading ||
                runtimeStatus === 'paused' ||
                runtimeStatus === 'resumed'
              }
            >
              Checkpoint (CRIU) + Terminate
            </Button>
            {runtimeStatus === 'paused' ? (
              <>
                <Button
                  size="small"
                  variant="primary"
                  leadingVisual={PlayIcon}
                  onClick={() => handleResume(resumeMode)}
                  disabled={actionLoading}
                >
                  {resumeMode === 'light' ? 'Resume (light)' : 'Resume (criu)'}
                </Button>
                <Button
                  size="small"
                  variant={resumeMode === 'light' ? 'primary' : 'invisible'}
                  onClick={() => setResumeMode('light')}
                  disabled={actionLoading}
                >
                  Light
                </Button>
                <Button
                  size="small"
                  variant={resumeMode === 'criu' ? 'primary' : 'invisible'}
                  onClick={() => setResumeMode('criu')}
                  disabled={actionLoading}
                >
                  CRIU checkpoint
                </Button>
              </>
            ) : null}
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
              display: 'flex',
              flexDirection: 'column',
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
                order: 3,
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
                order: 2,
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
                  Running Agents ({activeAgents.length})
                </Text>
              </Box>
              {activeAgents.length === 0 ? (
                <Text
                  sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}
                >
                  No running agents.
                </Text>
              ) : (
                activeAgents.map((a: RunningAgent) => (
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
                      <Label
                        variant={
                          STATUS_COLORS[
                            (a.id === agentId || a.name === DEMO_AGENT_NAME
                              ? runtimeStatus
                              : a.status) ?? 'running'
                          ] ?? 'secondary'
                        }
                        sx={{ fontSize: '10px' }}
                      >
                        {(a.id === agentId || a.name === DEMO_AGENT_NAME
                          ? runtimeStatus
                          : a.status) ?? 'running'}
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
                        onClick={() => handleTerminateRuntime(a)}
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
            <Box
              sx={{
                order: 1,
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <HistoryIcon size={14} />
                <Text sx={{ fontWeight: 'semibold', fontSize: 1, flex: 1 }}>
                  Checkpoints (
                  {checkpoints.length + pausedAgentsWithoutCheckpoint.length})
                </Text>
                <IconButton
                  aria-label="Refresh checkpoints"
                  icon={SyncIcon}
                  size="small"
                  variant="invisible"
                  onClick={refreshCheckpoints}
                />
              </Box>
              {/* Paused agents shown as checkpoint entries */}
              {pausedAgentsWithoutCheckpoint.map((a: RunningAgent) => (
                <Box
                  key={`paused-${a.id}`}
                  sx={{
                    p: 2,
                    mb: 1,
                    bg: 'canvas.default',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'attention.muted',
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
                    <SquareIcon size={12} />
                    <Text sx={{ fontWeight: 'semibold', fontSize: 0, flex: 1 }}>
                      {a.name ?? a.id}
                    </Text>
                    <Label variant="severe" sx={{ fontSize: '9px' }}>
                      paused
                    </Label>
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
                      mt: 2,
                      display: 'flex',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Button
                      size="small"
                      variant="primary"
                      leadingVisual={PlayIcon}
                      onClick={() =>
                        handleResume(resumeMode, undefined, a.podName)
                      }
                      disabled={actionLoading}
                    >
                      Resume
                    </Button>
                  </Box>
                </Box>
              ))}
              {checkpoints.length === 0 &&
              pausedAgentsWithoutCheckpoint.length === 0 ? (
                <Text
                  sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}
                >
                  No checkpoints yet. Use Checkpoint (Light) or Checkpoint
                  create one.
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
                    {ckpt.checkpoint_mode && (
                      <Label
                        sx={{ mt: 1, mr: 1, fontSize: '10px' }}
                        variant="attention"
                      >
                        {ckpt.checkpoint_mode.toUpperCase()}
                      </Label>
                    )}
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
                    {ckpt.agent_spec_id && (
                      <Label sx={{ mt: 1, fontSize: '10px' }} variant="accent">
                        {ckpt.agent_spec_id}
                      </Label>
                    )}
                    <Box
                      sx={{
                        mt: 2,
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button
                        size="small"
                        variant="primary"
                        leadingVisual={PlayIcon}
                        onClick={() =>
                          handleResume(
                            ckpt.checkpoint_mode || 'light',
                            ckpt.id,
                            ckpt.runtime_uid,
                          )
                        }
                        disabled={actionLoading || ckpt.status === 'failed'}
                      >
                        Resume
                      </Button>
                    </Box>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        )}

        {/* ── Chat area ───────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, minHeight: 0 }}>
          {showLaunchingView ? (
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
                {runtimeStatus === 'launching'
                  ? `Launching runtime for ${AGENT_SPEC_ID}…`
                  : 'Creating agent on runtime…'}
              </Text>
            </Box>
          ) : showNoAgentRunningView ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 3,
                px: 3,
              }}
            >
              <AgentIcon size={48} />
              <Heading as="h2" sx={{ fontSize: 3 }}>
                Checkpoint Agent
              </Heading>
              <Text
                sx={{ color: 'fg.muted', textAlign: 'center', maxWidth: 560 }}
              >
                Launch a cloud agent runtime with pause/resume checkpointing.
                The agent will be deployed from the{' '}
                <strong>{AGENT_SPEC_ID}</strong> spec.
              </Text>
              {displayError && (
                <Flash variant="danger" sx={{ maxWidth: 560, width: '100%' }}>
                  {displayError}
                </Flash>
              )}
              <Button
                variant="primary"
                size="large"
                leadingVisual={PlayIcon}
                onClick={handleLaunch}
              >
                Launch Agent
              </Button>
            </Box>
          ) : (isReady || runtimeStatus === 'resumed') &&
            runtimeStatus !== 'paused' ? (
            <Chat
              transport="ag-ui"
              baseUrl={agentBaseUrl}
              agentId={agentId}
              title="Monitor Sales KPI Agent"
              placeholder="Ask about sales KPIs…"
              description="Monitor Sales KPI agent with pause/resume checkpointing"
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
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'fg.muted',
                gap: 3,
              }}
            >
              {runtimeStatus === 'paused' ? (
                <Text sx={{ fontSize: 2 }}>
                  Agent is paused — click Resume to continue the conversation.
                </Text>
              ) : runtimeStatus === 'idle' ||
                runtimeStatus === 'disconnected' ? (
                <Text sx={{ fontSize: 2 }}>
                  No active runtime connection. Launch an agent or select one in
                  the sidebar.
                </Text>
              ) : runtimeStatus === 'error' ? (
                <>
                  <AlertIcon size={32} />
                  <Text sx={{ fontSize: 2, color: 'danger.fg' }}>
                    Agent failed to connect
                  </Text>
                  {displayError && (
                    <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                      {displayError}
                    </Text>
                  )}
                  <Button variant="primary" onClick={handleLaunch}>
                    Retry Launch
                  </Button>
                </>
              ) : (
                <>
                  <Spinner size="medium" />
                  <Text sx={{ fontSize: 2 }}>
                    Connecting to agent… (status: {runtimeStatus})
                  </Text>
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentCheckpointsExample: React.FC = () => {
  const { token, setAuth, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  // Sync persisted token (from a previous session) to iamStore on mount
  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      import('@datalayer/core/lib/state').then(({ iamStore }) => {
        iamStore.setState({ token });
      });
    }
  }, [token]);

  // Wrap setAuth to also sync the token to iamStore on sign-in
  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      hasSynced.current = true;
      import('@datalayer/core/lib/state').then(({ iamStore }) => {
        iamStore.setState({ token: newToken });
      });
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

  const loginUrl = useRef(
    `${
      coreStore.getState().configuration?.iamRunUrl ||
      coreStore.getState().configuration?.runUrl ||
      'https://prod1.datalayer.run'
    }/api/iam/v1/login`,
  ).current;

  if (!token) {
    return (
      <ThemedProvider>
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          loginUrl={loginUrl}
          title="Agent Checkpointing"
          description="Sign in to launch and checkpoint durable agents."
          leadingIcon={<WorkflowIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <QueryClientProvider client={queryClient}>
        <AgentCheckpointsInner onLogout={handleLogout} />
      </QueryClientProvider>
    </ThemedProvider>
  );
};

export default AgentCheckpointsExample;
