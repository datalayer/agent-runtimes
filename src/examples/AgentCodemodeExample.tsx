/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCodemodeExample
 *
 * Demonstrates Code Mode: tools that return structured outputs with schemas
 * rendered inline as executable code blocks, diffs, or file previews.
 *
 * - Creates a cloud runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows a code panel alongside the chat displaying tool outputs with
 *   syntax highlighting, diff views, and the ability to accept/reject changes
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Text, Button, Spinner, Heading, Label, Flash } from '@primer/react';
import {
  AlertIcon,
  CodeIcon,
  DiffIcon,
  FileCodeIcon,
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
import { useAgent } from '../hooks/useAgent';

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'codemode-demo-agent';
const AGENT_SPEC_ID = 'mocks/monitor-sales-kpis';

// ─── Types ─────────────────────────────────────────────────────────────────

type CodeView = 'output' | 'diff';

interface CodeArtifact {
  id: string;
  tool_name: string;
  language: string;
  content: string;
  diff?: string;
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected';
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentCodemodeInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const {
    runtime,
    agent,
    status: runtimeStatus,
    isReady,
    error: hookError,
  } = useAgent({
    agentSpecId: AGENT_SPEC_ID,
    autoStart: true,
    agentConfig: {
      name: AGENT_NAME,
      transport: 'ag-ui',
      description: 'Agent with Code Mode structured tool outputs',
    },
  });

  const [codeView, setCodeView] = useState<CodeView>('output');
  const [artifacts, setArtifacts] = useState<CodeArtifact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = agent?.agentId || AGENT_NAME;
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

  // ── Poll code artifacts ───────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/codemode/artifacts`,
        );
        if (res.ok) {
          const d = await res.json();
          setArtifacts(Array.isArray(d) ? d : (d.artifacts ?? []));
        }
      } catch {
        /* ok */
      }
    };
    poll();
    const interval = setInterval(poll, 5_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  // ── Accept / Reject ───────────────────────────────────────────────────

  const handleDecision = useCallback(
    async (artifactId: string, decision: 'accepted' | 'rejected') => {
      if (!agentBaseUrl) return;
      setFlash(null);
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/codemode/artifacts/${artifactId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ status: decision }),
          },
        );
        if (res.ok) {
          setArtifacts(prev =>
            prev.map(a =>
              a.id === artifactId ? { ...a, status: decision } : a,
            ),
          );
          setFlash(`Change ${decision}`);
        }
      } catch {
        setFlash('Network error');
      }
    },
    [agentBaseUrl, agentId, authFetch],
  );

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
            ? 'Launching runtime for codemode agent…'
            : 'Creating codemode demo agent…'}
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
          {hookError || 'Agent failed to start'}
        </Text>
      </Box>
    );
  }

  const selected =
    artifacts.find(a => a.id === selectedId) ?? artifacts[0] ?? null;
  const pendingCount = artifacts.filter(a => a.status === 'pending').length;

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
        <CodeIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Code Mode — {podName}
        </Heading>
        {pendingCount > 0 && (
          <Label variant="attention" size="small">
            {pendingCount} pending
          </Label>
        )}
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

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            transport="ag-ui"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            title="Code Mode Agent"
            placeholder="Ask the agent to generate or modify code…"
            description={`${artifacts.length} code artifact${artifacts.length !== 1 ? 's' : ''}`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Generate script',
                message: 'Write a Python script to analyze the KPI data',
              },
              {
                title: 'Refactor',
                message: 'Refactor the last code block for readability',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Code panel */}
        <Box
          sx={{
            width: 480,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* View tabs */}
          <Box
            sx={{
              display: 'flex',
              borderBottom: '1px solid',
              borderColor: 'border.default',
              flexShrink: 0,
            }}
          >
            {(
              [
                {
                  key: 'output' as CodeView,
                  icon: FileCodeIcon,
                  label: 'Output',
                },
                { key: 'diff' as CodeView, icon: DiffIcon, label: 'Diff' },
              ] as const
            ).map(t => (
              <Button
                key={t.key}
                size="small"
                variant="invisible"
                leadingVisual={t.icon}
                onClick={() => setCodeView(t.key)}
                sx={{
                  flex: 1,
                  borderRadius: 0,
                  borderBottom:
                    codeView === t.key ? '2px solid' : '2px solid transparent',
                  borderColor: codeView === t.key ? 'accent.fg' : 'transparent',
                  fontWeight: codeView === t.key ? 'bold' : 'normal',
                }}
              >
                {t.label}
              </Button>
            ))}
          </Box>

          {/* Artifact list sidebar */}
          <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <Box
              sx={{
                width: 140,
                borderRight: '1px solid',
                borderColor: 'border.default',
                overflow: 'auto',
              }}
            >
              {artifacts.length === 0 ? (
                <Text
                  sx={{
                    p: 2,
                    color: 'fg.muted',
                    fontSize: 0,
                    display: 'block',
                  }}
                >
                  No artifacts yet.
                </Text>
              ) : (
                artifacts.map(a => (
                  <Box
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    sx={{
                      p: 2,
                      borderBottom: '1px solid',
                      borderColor: 'border.muted',
                      bg:
                        selected?.id === a.id ? 'accent.subtle' : 'transparent',
                      cursor: 'pointer',
                      ':hover': { bg: 'canvas.subtle' },
                    }}
                  >
                    <Text
                      sx={{ fontSize: 0, fontWeight: 'bold', display: 'block' }}
                    >
                      {a.tool_name}
                    </Text>
                    <Label
                      size="small"
                      variant={
                        a.status === 'accepted'
                          ? 'success'
                          : a.status === 'rejected'
                            ? 'danger'
                            : 'attention'
                      }
                    >
                      {a.status}
                    </Label>
                  </Box>
                ))
              )}
            </Box>

            {/* Code viewer */}
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'auto',
              }}
            >
              {selected ? (
                <>
                  <Box
                    sx={{
                      p: 2,
                      borderBottom: '1px solid',
                      borderColor: 'border.default',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Box>
                      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
                        {selected.tool_name}
                      </Text>
                      <Label size="small" variant="secondary" sx={{ ml: 1 }}>
                        {selected.language}
                      </Label>
                    </Box>
                    {selected.status === 'pending' && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="primary"
                          leadingVisual={CheckIcon}
                          onClick={() =>
                            handleDecision(selected.id, 'accepted')
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          leadingVisual={XIcon}
                          onClick={() =>
                            handleDecision(selected.id, 'rejected')
                          }
                        >
                          Reject
                        </Button>
                      </Box>
                    )}
                  </Box>
                  <Box
                    sx={{
                      flex: 1,
                      overflow: 'auto',
                      bg: 'canvas.subtle',
                      p: 3,
                    }}
                  >
                    <Box
                      as="pre"
                      sx={{
                        fontFamily: 'mono',
                        fontSize: 0,
                        m: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {codeView === 'diff' && selected.diff
                        ? selected.diff
                        : selected.content}
                    </Box>
                  </Box>
                </>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                    Ask the agent to generate code to see it here.
                  </Text>
                </Box>
              )}
            </Box>
          </Box>

          {flash && (
            <Flash
              variant={
                flash.includes('accepted')
                  ? 'success'
                  : flash.includes('rejected')
                    ? 'warning'
                    : 'danger'
              }
              sx={{ m: 2, fontSize: 0 }}
            >
              {flash}
            </Flash>
          )}
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

const AgentCodemodeExample: React.FC = () => {
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
          title="Agent Code Mode"
          description="Sign in to use Code Mode with structured tool outputs."
          leadingIcon={<CodeIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <ThemedProvider>
      <AgentCodemodeInner onLogout={handleLogout} />
    </ThemedProvider>
  );
};

export default AgentCodemodeExample;
