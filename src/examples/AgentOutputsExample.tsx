/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentOutputsExample
 *
 * Demonstrates rich output rendering for agent responses: structured data
 * tables, charts, downloadable artifacts, and multi-format output panels.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent on its sidecar
 * - Shows an output gallery alongside the chat with tabs for different
 *   output formats (table, JSON, chart, file)
 */

/// <reference types="vite/client" />

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, Button, Spinner, Heading, Label } from '@primer/react';
import {
  TableIcon,
  FileIcon,
  CodeIcon,
  GraphIcon,
  DownloadIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { useAgents } from '../hooks/useAgents';
import { Chat } from '../chat';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'output-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';

// ─── Types ─────────────────────────────────────────────────────────────────

type OutputTab = 'table' | 'json' | 'chart' | 'files';

interface OutputArtifact {
  id: string;
  type: 'table' | 'json' | 'chart' | 'file';
  name: string;
  timestamp: string;
  preview?: string;
  size?: number;
}

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentOutputsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
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
      description: 'Agent with rich output rendering and artifact management',
    },
  });

  const [activeTab, setActiveTab] = useState<OutputTab>('table');
  const [artifacts, setArtifacts] = useState<OutputArtifact[]>([]);

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

  // ── Poll output artifacts ─────────────────────────────────────────────

  useEffect(() => {
    if (!isReady || !agentBaseUrl) return;
    const poll = async () => {
      try {
        const res = await authFetch(
          `${agentBaseUrl}/api/v1/agents/${agentId}/outputs`,
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
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [isReady, agentBaseUrl, agentId, authFetch]);

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
            ? 'Launching runtime for output agent…'
            : 'Creating output demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const filtered = artifacts.filter(a => a.type === activeTab);

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
        <TableIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Agent Outputs — {podName}
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
            title="Output Agent"
            placeholder="Ask the agent to generate reports, data, or files…"
            description={`${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''} produced`}
            showHeader={true}
            autoFocus
            height="100%"
            runtimeId={podName}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Generate report',
                message: 'Generate a KPI summary report as a table',
              },
              {
                title: 'Export JSON',
                message: 'Export the latest sales data as JSON',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Output panel */}
        <Box
          sx={{
            width: 380,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
          }}
        >
          {/* Output type tabs */}
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
                { key: 'table' as OutputTab, icon: TableIcon, label: 'Table' },
                { key: 'json' as OutputTab, icon: CodeIcon, label: 'JSON' },
                { key: 'chart' as OutputTab, icon: GraphIcon, label: 'Chart' },
                { key: 'files' as OutputTab, icon: FileIcon, label: 'Files' },
              ] as const
            ).map(t => (
              <Button
                key={t.key}
                size="small"
                variant="invisible"
                leadingVisual={t.icon}
                onClick={() => setActiveTab(t.key)}
                sx={{
                  flex: 1,
                  borderRadius: 0,
                  borderBottom:
                    activeTab === t.key ? '2px solid' : '2px solid transparent',
                  borderColor:
                    activeTab === t.key ? 'accent.fg' : 'transparent',
                  fontWeight: activeTab === t.key ? 'bold' : 'normal',
                }}
              >
                {t.label}
              </Button>
            ))}
          </Box>

          {/* Artifact list */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Outputs
            </Heading>

            {filtered.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No {activeTab} outputs yet. Ask the agent to generate some.
              </Text>
            ) : (
              filtered.map(art => (
                <Box
                  key={art.id}
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
                    <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
                      {art.name}
                    </Text>
                    <Label size="small" variant="secondary">
                      {art.size != null
                        ? `${(art.size / 1024).toFixed(1)} KB`
                        : activeTab}
                    </Label>
                  </Box>
                  {art.preview && (
                    <Box
                      sx={{
                        bg: 'canvas.subtle',
                        p: 2,
                        borderRadius: 2,
                        fontFamily: 'mono',
                        fontSize: 0,
                        mb: 1,
                        maxHeight: 120,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {art.preview}
                    </Box>
                  )}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 0,
                      color: 'fg.muted',
                    }}
                  >
                    <Text>{new Date(art.timestamp).toLocaleString()}</Text>
                    <Button
                      size="small"
                      variant="invisible"
                      leadingVisual={DownloadIcon}
                      onClick={() =>
                        window.open(
                          `${agentBaseUrl}/api/v1/agents/${agentId}/outputs/${art.id}/download`,
                        )
                      }
                    >
                      Download
                    </Button>
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

const AgentOutputsExample: React.FC = () => {
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
          title="Agent Outputs"
          description="Sign in to view and manage agent output artifacts."
          leadingIcon={<TableIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentOutputsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentOutputsExample;
