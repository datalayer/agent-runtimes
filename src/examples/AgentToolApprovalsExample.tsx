/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@datalayer/primer-addons';
import { Button, Heading, Spinner, Text } from '@primer/react';
import { AlertIcon, ToolsIcon, SignOutIcon } from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './stores/themedProvider';
import { Chat } from '../chat';
import {
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../chat/tools';

const queryClient = new QueryClient();
const AGENT_NAME = 'tool-approval-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  note?: string;
  created_at?: string;
}

const AgentToolApprovalInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(AGENT_NAME);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [activeApproval, setActiveApproval] =
    useState<ToolApprovalRequest | null>(null);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const podName = 'localhost';

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

  useEffect(() => {
    let isCancelled = false;

    const createLocalAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: AGENT_NAME,
            description: 'Agent with runtime tool approvals',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
          }),
        });

        let resolvedAgentId = AGENT_NAME;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || AGENT_NAME;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (response.status === 409 || /already exists/i.test(detail || '')) {
            isAlreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create local agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(isAlreadyRunning);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createLocalAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, authFetch]);

  const pollApprovals = useCallback(async () => {
    if (!isReady || !agentBaseUrl) {
      return;
    }
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/ai-agents/v1/tool-approvals?agent_id=${encodeURIComponent(agentId)}&status=pending`,
      );
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setApprovals(Array.isArray(data) ? data : (data.requests ?? []));
    } catch {
      // Ignore transient polling errors.
    }
  }, [isReady, agentBaseUrl, agentId, authFetch]);

  useEffect(() => {
    pollApprovals();
    const interval = setInterval(pollApprovals, 5000);
    return () => clearInterval(interval);
  }, [pollApprovals]);

  const approve = useCallback(
    async (requestId: string, note?: string) => {
      if (!agentBaseUrl) {
        return;
      }
      setApprovalLoading(requestId);
      try {
        await authFetch(
          `${agentBaseUrl}/api/ai-agents/v1/tool-approvals/${requestId}/approve`,
          {
            method: 'POST',
            body: JSON.stringify(note ? { note } : {}),
          },
        );
        setApprovals(prev => prev.filter(a => a.id !== requestId));
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, agentId, authFetch],
  );

  const reject = useCallback(
    async (requestId: string, note?: string) => {
      if (!agentBaseUrl) {
        return;
      }
      setApprovalLoading(requestId);
      try {
        await authFetch(
          `${agentBaseUrl}/api/ai-agents/v1/tool-approvals/${requestId}/reject`,
          {
            method: 'POST',
            body: JSON.stringify(note ? { note } : {}),
          },
        );
        setApprovals(prev => prev.filter(a => a.id !== requestId));
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, agentId, authFetch],
  );

  const pendingApprovals: PendingApproval[] = useMemo(
    () =>
      approvals.map(req => ({
        id: req.id,
        toolName: req.tool_name,
        toolDescription: req.note,
        args: req.tool_args ?? {},
        agentId,
        requestedAt: req.created_at ?? new Date().toISOString(),
      })),
    [approvals, agentId],
  );

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
        <Text sx={{ color: 'fg.muted' }}>Launching tool approval demo...</Text>
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

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          <ToolsIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2 }}>
            Tool Approval Demo - {podName}
          </Heading>
          {isReconnectedAgent && (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              Agent already running - reconnected
            </Text>
          )}
        </Box>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Pending: {pendingApprovals.length}
        </Text>
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

      <ToolApprovalBanner
        pendingApprovals={pendingApprovals}
        onReview={approval => {
          const req = approvals.find(a => a.id === approval.id) || null;
          setActiveApproval(req);
        }}
        onApproveAll={async () => {
          for (const approval of approvals) {
            await approve(approval.id);
          }
        }}
      />

      <ToolApprovalDialog
        isOpen={!!activeApproval}
        toolName={activeApproval?.tool_name ?? ''}
        toolDescription={activeApproval?.note}
        args={activeApproval?.tool_args ?? {}}
        onApprove={async () => {
          if (activeApproval) {
            await approve(activeApproval.id);
          }
          setActiveApproval(null);
        }}
        onDeny={async () => {
          if (activeApproval) {
            await reject(
              activeApproval.id,
              'Rejected from tool approval dialog',
            );
          }
          setActiveApproval(null);
        }}
        onClose={() => setActiveApproval(null)}
      />

      {approvalLoading && (
        <Box sx={{ px: 3, py: 1 }}>
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Processing approval request...
          </Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Chat
          transport="vercel-ai"
          baseUrl={agentBaseUrl}
          agentId={agentId}
          authToken={chatAuthToken}
          title="Tool Approval Agent"
          placeholder="Ask for actions that require approval..."
          showHeader={false}
          showTokenUsage={true}
          autoFocus
          height="100%"
          runtimeId={agentId}
          historyEndpoint={`${agentBaseUrl}/api/v1/history`}
          suggestions={[
            {
              title: 'List Tools',
              message:
                'List the available tools first, then ask me which one to run. Use tool calls only and do not write Python code.',
            },
            {
              title: 'Manual Approval Tool',
              message:
                'Call the runtime_sensitive_echo tool with text "hello" and reason "audit". Use a tool call only and do not write Python code.',
            },
            {
              title: 'Fake Mail Tool',
              message:
                'Call the runtime_send_mail tool with to "finance@example.com", subject "KPI Alert", and body "Revenue dropped by 12 percent this week". Use a tool call only and do not write Python code.',
            },
            {
              title: 'Auto Tool',
              message:
                'Call the runtime_echo tool with text "hello world". Use a tool call only and do not write Python code.',
            },
          ]}
          submitOnSuggestionClick
        />
      </Box>
    </Box>
  );
};

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

const AgentToolApprovalsExample: React.FC = () => {
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
          title="Tool Approval Agent"
          description="Sign in to test manual and automatic tool approvals."
          leadingIcon={<ToolsIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolApprovalInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolApprovalsExample;
