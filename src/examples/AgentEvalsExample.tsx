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
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import { useAgents } from '../hooks/useAgents';

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
      description: 'Agent with evaluation and quality scoring',
    },
  });

  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = runtime?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching…)';

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

  // ── Poll eval results ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/eval/runs`,
        );
        if (res.ok) {
          const d = await res.json();
          setEvalRuns(Array.isArray(d) ? d : (d.runs ?? []));
        }
      } catch {
        /* ok */
      }
    };
    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  // ── Run eval suite ────────────────────────────────────────────────────

  const handleRunEval = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsRunning(true);
    setFlash(null);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/eval/run`,
        { method: 'POST' },
      );
      if (res.ok) {
        setFlash('Evaluation suite started');
      } else {
        setFlash(`Failed to start eval (${res.status})`);
      }
    } catch {
      setFlash('Network error');
    } finally {
      setIsRunning(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

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
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="ag-ui"
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
              Execute the default evaluation suite against recent agent
              responses. Results are scored automatically.
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
          title="Agent Evaluation"
          description="Sign in to evaluate agent quality and review scores."
          leadingIcon={<BeakerIcon size={24} />}
        />
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
