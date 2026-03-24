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
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './stores/themedProvider';
import { Chat, type RenderToolResult } from '../chat';
import {
  ToolCallDisplay,
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../chat/tools';

const normalizeToolName = (value: string): string =>
  value.replace(/[-_]/g, '').toLowerCase();

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, itemValue]) =>
        `${JSON.stringify(key)}:${stableStringify(itemValue)}`,
    );
  return `{${entries.join(',')}}`;
};

const queryClient = new QueryClient();
const AGENT_NAME = 'tool-approval-demo-agent';
const AGENT_SPEC_ID = 'monitor-sales-kpis';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_AI_AGENTS_BASE_URL =
  import.meta.env.VITE_AI_AGENTS_URL || DEFAULT_SERVICE_URLS.AI_AGENTS;

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  note?: string;
  created_at?: string;
}

const AgentToolApprovalAsyncInner: React.FC<{ onLogout: () => void }> = ({
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
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [toolApprovalState, setToolApprovalState] = useState<
    Record<string, 'approved' | 'denied'>
  >({});
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const aiAgentsBaseUrl = DEFAULT_AI_AGENTS_BASE_URL;
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
            system_prompt:
              'You are a helpful assistant. You have access to three tools: runtime_echo (echoes text, no approval needed), runtime_sensitive_echo (echoes text, requires approval), and runtime_send_mail (sends an email, requires approval). When asked to list your tools, call each tool with a brief description as the argument to demonstrate them. Do not call list_skills, load_skill, read_skill_resource, or run_skill_script.',
            enable_skills: false,
            skills: [],
            tools: [
              'runtime-echo',
              'runtime-sensitive-echo',
              'runtime-send-mail',
            ],
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
        `${aiAgentsBaseUrl}/api/ai-agents/v1/tool-approvals`,
      );
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const allApprovals = Array.isArray(data)
        ? data
        : (data.approvals ?? data.requests ?? []);
      const pendingForAgent = allApprovals.filter(
        (
          approval: ToolApprovalRequest & {
            agent_id?: string;
            status?: string;
          },
        ) => approval.agent_id === agentId && approval.status === 'pending',
      );
      setApprovals(pendingForAgent);
    } catch {
      // Ignore transient polling errors.
    }
  }, [isReady, aiAgentsBaseUrl, agentId, authFetch]);

  useEffect(() => {
    pollApprovals();
    const interval = setInterval(pollApprovals, 5000);
    return () => clearInterval(interval);
  }, [pollApprovals]);

  const approve = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      if (!agentBaseUrl) {
        return false;
      }
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const response = await authFetch(
          `${aiAgentsBaseUrl}/api/ai-agents/v1/tool-approvals/${requestId}/approve`,
          {
            method: 'POST',
            body: JSON.stringify(note ? { note } : {}),
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(
            errorText ||
              `Failed to approve request (${response.status} ${response.statusText})`,
          );
        }

        setApprovals(prev => prev.filter(a => a.id !== requestId));
        void pollApprovals();
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to approve tool request';
        setApprovalError(message);
        return false;
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, aiAgentsBaseUrl, authFetch, pollApprovals],
  );

  const reject = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      if (!agentBaseUrl) {
        return false;
      }
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const response = await authFetch(
          `${aiAgentsBaseUrl}/api/ai-agents/v1/tool-approvals/${requestId}/reject`,
          {
            method: 'POST',
            body: JSON.stringify(note ? { note } : {}),
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(
            errorText ||
              `Failed to reject request (${response.status} ${response.statusText})`,
          );
        }

        setApprovals(prev => prev.filter(a => a.id !== requestId));
        void pollApprovals();
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to reject tool request';
        setApprovalError(message);
        return false;
      } finally {
        setApprovalLoading(null);
      }
    },
    [agentBaseUrl, aiAgentsBaseUrl, authFetch, pollApprovals],
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

  const findMatchingApproval = useCallback(
    (
      toolName: string,
      args: Record<string, unknown>,
    ): ToolApprovalRequest | null => {
      const normalizedToolName = normalizeToolName(toolName);
      const argsSig = stableStringify(args ?? {});
      return (
        approvals.find(approval => {
          if (normalizeToolName(approval.tool_name) !== normalizedToolName) {
            return false;
          }
          return stableStringify(approval.tool_args ?? {}) === argsSig;
        }) || null
      );
    },
    [approvals],
  );

  const handleToolLevelApprove = useCallback(
    async (toolCallId: string, requestId: string) => {
      const ok = await approve(requestId, 'Approved from tool message card');
      if (ok) {
        setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'approved' }));
      }
    },
    [approve],
  );

  const handleToolLevelDeny = useCallback(
    async (toolCallId: string, requestId: string) => {
      const ok = await reject(requestId, 'Rejected from tool message card');
      if (ok) {
        setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'denied' }));
      }
    },
    [reject],
  );

  const renderToolResult: RenderToolResult = useCallback(
    ({ toolCallId, toolName, args, result, status, error }) => {
      const matchedApproval = findMatchingApproval(toolName, args);
      const resultObject =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : undefined;
      const pendingByResult =
        status === 'inProgress' && resultObject?.pending_approval === true;
      const toolDecision = toolApprovalState[toolCallId];
      const loadingThisApproval =
        !!matchedApproval && approvalLoading === matchedApproval.id;
      const approvalState: 'pending' | 'approved' | 'denied' | undefined =
        toolDecision ||
        (pendingByResult || !!matchedApproval ? 'pending' : undefined);

      return (
        <ToolCallDisplay
          toolCallId={toolCallId}
          toolName={toolName}
          args={args}
          result={result}
          status={status}
          error={error}
          approvalRequired={!!approvalState}
          approvalState={approvalState}
          approvalLoading={loadingThisApproval}
          onApprove={
            matchedApproval
              ? () =>
                  void handleToolLevelApprove(toolCallId, matchedApproval.id)
              : undefined
          }
          onDeny={
            matchedApproval
              ? () => void handleToolLevelDeny(toolCallId, matchedApproval.id)
              : undefined
          }
        />
      );
    },
    [
      findMatchingApproval,
      toolApprovalState,
      approvalLoading,
      handleToolLevelApprove,
      handleToolLevelDeny,
    ],
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
            Tool Approval Demo (Async) - {podName}
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
            const ok = await approve(activeApproval.id);
            if (ok) {
              setActiveApproval(null);
            }
          }
        }}
        onDeny={async () => {
          if (activeApproval) {
            const ok = await reject(
              activeApproval.id,
              'Rejected from tool approval dialog',
            );
            if (ok) {
              setActiveApproval(null);
            }
          }
        }}
        onClose={() => setActiveApproval(null)}
      />

      {approvalError && (
        <Box sx={{ px: 3, py: 1 }}>
          <Text sx={{ color: 'danger.fg', fontSize: 0 }}>{approvalError}</Text>
        </Box>
      )}

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
              title: 'List your tools',
              message: 'list your tools',
            },
            {
              title: 'Run tool with approval',
              message:
                'Call the runtime_sensitive_echo tool with text "hello" and reason "audit". Use a tool call only and do not write Python code.',
            },
            {
              title: 'Run tool without approval',
              message:
                'Call the runtime_echo tool with text "hello world". Use a tool call only and do not write Python code.',
            },
          ]}
          renderToolResult={renderToolResult}
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

const AgentToolApprovalsAsyncExample: React.FC = () => {
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
          title="Tool Approval Agent (Async)"
          description="Sign in to test ai-agents-backed asynchronous tool approvals."
          leadingIcon={<ToolsIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolApprovalAsyncInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolApprovalsAsyncExample;
