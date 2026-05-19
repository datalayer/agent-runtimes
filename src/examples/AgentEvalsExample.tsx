/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentEvalsExample
 *
 * Demonstrates agent evaluation workflows: scoring agent responses, tracking
 * quality metrics, and reviewing evaluation history over time.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows an evaluation panel alongside the chat with quality scores,
 *   pass/fail status, and the ability to run eval suites
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
  BeakerIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { Chat } from '../chat';
import { useAgentRuntimes } from '../hooks/useAgentRuntimes';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'eval-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';

// ─── Types ─────────────────────────────────────────────────────────────────

interface EvalRun {
  id: string;
  timestamp: string;
  suiteName: string;
  passed: number;
  failed: number;
  score: number; // 0–1
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentEvalsInner: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const {
    runtime,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useAgentRuntimes({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: agentName,
      model: 'bedrock:us.anthropic.claude-3-5-haiku-20241022-v1:0',
      protocol: 'vercel-ai',
      description: 'Agent with evaluation and quality scoring',
    },
  });

  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [evalId, setEvalId] = useState<string | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = runtime?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';
  const controlPlaneBaseUrl =
    (import.meta.env.VITE_RUN_URL as string | undefined) ||
    (agentBaseUrl ? new URL(agentBaseUrl).origin : '');

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

  const evalApiFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const response = await authFetch(
        `${controlPlaneBaseUrl}/api/ai-agents/v1${path}`,
        opts,
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (payload as any)?.success === false) {
        throw new Error(
          (payload as any)?.detail ||
            (payload as any)?.message ||
            `Eval API request failed (${response.status})`,
        );
      }
      return payload;
    },
    [authFetch, controlPlaneBaseUrl],
  );

  const mapRuns = useCallback((rows: any[]): EvalRun[] => {
    return rows.map((run: any) => {
      const passRateRaw =
        run?.metrics?.pass_rate ??
        run?.summary?.pass_rate ??
        run?.summary?.score ??
        0;
      const score = Math.max(0, Math.min(1, Number(passRateRaw) || 0));
      const passed = Number(run?.summary?.passed ?? Math.round(score * 100));
      const failed = Number(run?.summary?.failed ?? Math.max(0, 100 - passed));
      return {
        id: String(run?.id || Math.random()),
        timestamp: String(
          run?.created_at || run?.updated_at || new Date().toISOString(),
        ),
        suiteName: String(
          run?.summary?.suite_name || run?.summary?.name || 'default-suite',
        ),
        passed,
        failed,
        score,
      };
    });
  }, []);

  useEffect(() => {
    if (!isReady || !controlPlaneBaseUrl) return;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      try {
        const evalName = `agent-evals-${agentId}`;
        const evalsRes = await evalApiFetch(
          `/evals/evals?source=hosted&q=${encodeURIComponent(evalName)}&limit=50`,
        );
        const evals = Array.isArray((evalsRes as any)?.evals)
          ? (evalsRes as any).evals
          : [];
        let evalRecord = evals.find((d: any) => d?.name === evalName);

        if (!evalRecord) {
          const createdEvalRes = await evalApiFetch('/evals/evals', {
            method: 'POST',
            body: JSON.stringify({
              name: evalName,
              description: `Hosted eval for ${agentId}`,
              source: 'hosted',
              kind: 'agent-quality',
              schema: {},
              tags: ['agent-runtimes', 'example'],
              metadata: { agent_id: agentId },
              cases: [],
            }),
          });
          evalRecord = (createdEvalRes as any)?.eval;
        }

        if (!evalRecord?.id) {
          throw new Error('Failed to initialize eval.');
        }
        setEvalId(evalRecord.id);

        const experimentsRes = await evalApiFetch(
          `/evals/experiments?eval_id=${encodeURIComponent(evalRecord.id)}&limit=50`,
        );
        const experiments = Array.isArray((experimentsRes as any)?.experiments)
          ? (experimentsRes as any).experiments
          : [];
        let experiment = experiments.find(
          (e: any) => e?.name === 'default-suite',
        );

        if (!experiment) {
          const createdExperimentRes = await evalApiFetch(
            '/evals/experiments',
            {
              method: 'POST',
              body: JSON.stringify({
                eval_id: evalRecord.id,
                name: 'default-suite',
                description: 'Default evaluation suite for AgentEvalsExample.',
                status: 'ready',
                config: {
                  mode: 'offline',
                  target_agent_id: agentId,
                  target_pod_name: podName,
                },
                summary: {},
                tags: ['example'],
              }),
            },
          );
          experiment = (createdExperimentRes as any)?.experiment;
        }

        if (!experiment?.id) {
          throw new Error('Failed to initialize eval experiment.');
        }
        setExperimentId(experiment.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Eval bootstrap failed.';
        setFlash(message);
      } finally {
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
  }, [isReady, controlPlaneBaseUrl, agentId, podName, evalApiFetch]);

  // ── Poll eval results ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !controlPlaneBaseUrl || !experimentId) return;
    const poll = async () => {
      try {
        const res = await evalApiFetch(
          `/evals/experiments/${encodeURIComponent(experimentId)}/runs?limit=50`,
        );
        const rows = Array.isArray((res as any)?.runs) ? (res as any).runs : [];
        setEvalRuns(mapRuns(rows));
      } catch {
        /* ok */
      }
    };
    void poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, [isReady, controlPlaneBaseUrl, experimentId, evalApiFetch, mapRuns]);

  // ── Run eval suite ────────────────────────────────────────────────────

  const handleRunEval = useCallback(async () => {
    if (!controlPlaneBaseUrl || !experimentId) return;
    setIsRunning(true);
    setFlash(null);
    try {
      const syntheticScore = Number((0.75 + Math.random() * 0.2).toFixed(3));
      const passed = Math.round(syntheticScore * 100);
      const failed = Math.max(0, 100 - passed);

      await evalApiFetch(
        `/evals/experiments/${encodeURIComponent(experimentId)}/runs`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: 'completed',
            metrics: {
              pass_rate: syntheticScore,
              avg_score: syntheticScore,
            },
            summary: {
              suite_name: 'default-suite',
              passed,
              failed,
              runtime_id: podName,
            },
            report: {
              source: 'AgentEvalsExample',
              eval_id: evalId,
              experiment_id: experimentId,
              agent_id: agentId,
            },
          }),
        },
      );
      setFlash('Evaluation run persisted');

      const updatedRuns = await evalApiFetch(
        `/evals/experiments/${encodeURIComponent(experimentId)}/runs?limit=50`,
      );
      const rows = Array.isArray((updatedRuns as any)?.runs)
        ? (updatedRuns as any).runs
        : [];
      setEvalRuns(mapRuns(rows));
    } catch {
      setFlash('Failed to persist evaluation run');
    } finally {
      setIsRunning(false);
    }
  }, [
    controlPlaneBaseUrl,
    experimentId,
    evalApiFetch,
    mapRuns,
    podName,
    evalId,
    agentId,
  ]);

  // ── Loading / Error ───────────────────────────────────────────────────

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
            ? 'Launching runtime for eval agent…'
            : 'Creating eval demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  if (isBootstrapping) {
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
          Preparing hosted eval and experiment...
        </Text>
      </Box>
    );
  }

  const latestScore = evalRuns.length > 0 ? evalRuns[0].score : null;

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
        <BeakerIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Evaluation — {podName}
        </Heading>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Eval Agent"
            placeholder="Chat with the agent, then run evaluations…"
            description={
              latestScore != null
                ? `Last score: ${(latestScore * 100).toFixed(0)}%`
                : 'No evaluations run yet'
            }
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Summarize KPIs',
                message: 'Summarize the latest KPI data',
              },
              {
                title: 'Run eval',
                message: 'Evaluate your last 10 responses',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Eval panel */}
        <Box
          sx={{
            width: 350,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {/* Run eval */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <BeakerIcon size={16} />
              <Heading as="h3" sx={{ fontSize: 2 }}>
                Run Evaluation
              </Heading>
            </Box>

            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
              Execute the default evaluation suite and persist results to
              /api/ai-agents/v1/evals.
            </Text>

            <Button
              size="small"
              variant="primary"
              leadingVisual={PlayIcon}
              onClick={handleRunEval}
              disabled={isRunning}
              sx={{ width: '100%' }}
            >
              {isRunning ? 'Running…' : 'Run Eval Suite'}
            </Button>

            {flash && (
              <Flash
                variant={flash.includes('started') ? 'success' : 'danger'}
                sx={{ mt: 2, fontSize: 0 }}
              >
                {flash}
              </Flash>
            )}
          </Box>

          {/* Eval history */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Evaluation History
            </Heading>

            {evalRuns.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No evaluation runs recorded yet.
              </Text>
            ) : (
              evalRuns.slice(0, 20).map(run => (
                <Box
                  key={run.id}
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
                    <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                      {run.suiteName}
                    </Text>
                    <Label
                      variant={
                        run.score >= 0.8
                          ? 'success'
                          : run.score >= 0.5
                            ? 'attention'
                            : 'danger'
                      }
                      size="small"
                    >
                      {(run.score * 100).toFixed(0)}%
                    </Label>
                  </Box>
                  <ProgressBar progress={run.score * 100} sx={{ mb: 1 }} />
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 0,
                      color: 'fg.muted',
                    }}
                  >
                    <Text>
                      <CheckCircleIcon size={12} /> {run.passed} passed
                    </Text>
                    <Text>
                      <XCircleIcon size={12} /> {run.failed} failed
                    </Text>
                    <Text>{new Date(run.timestamp).toLocaleDateString()}</Text>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Box>
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

const AgentEvalsExample: React.FC = () => {
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
        <AgentEvalsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentEvalsExample;
