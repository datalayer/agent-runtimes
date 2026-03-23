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
import {
  AlertIcon,
  ShieldCheckIcon,
  SignOutIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './stores/themedProvider';
import { Chat } from '../chat';
import { useAgents } from '../hooks/useAgents';
import {
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../chat/tools';

const queryClient = new QueryClient();
const AGENT_NAME = 'tool-approval-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  note?: string;
  created_at?: string;
}

const AgentToolapprovalInner: React.FC<{ onLogout: () => void }> = ({
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
      transport: 'vercel-ai',
      description: 'Agent with runtime tool approvals',
    },
  });

  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [activeApproval, setActiveApproval] =
    useState<ToolApprovalRequest | null>(null);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);

  const agentBaseUrl = runtime?.agentBaseUrl || '';
  const agentId = runtime?.agentId || AGENT_NAME;
  const podName = runtime?.podName || '(launching...)';

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

  const pollApprovals = useCallback(async () => {
    if (!isReady || !agentBaseUrl) {
      return;
    }
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals?status=pending`,
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
          `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals/${requestId}/approve`,
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
          `${agentBaseUrl}/api/v1/agents/${agentId}/tool-approvals/${requestId}/reject`,
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
          <ShieldCheckIcon size={16} />
          <Heading as="h3" sx={{ fontSize: 2 }}>
            Tool Approval Demo - {podName}
          </Heading>
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
          title="Tool Approval Agent"
          placeholder="Ask for actions that require approval..."
          showHeader={false}
          showTokenUsage={true}
          autoFocus
          height="100%"
          runtimeId={podName}
          historyEndpoint={`${agentBaseUrl}/api/v1/history`}
          suggestions={[
            {
              title: 'Manual Approval Tool',
              message:
                'Use runtime sensitive echo with text hello and reason audit',
            },
            {
              title: 'Auto Tool',
              message: 'Use runtime echo with text hello world',
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

const AgentToolapprovalExample: React.FC = () => {
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
          leadingIcon={<ShieldCheckIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolapprovalInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolapprovalExample;
