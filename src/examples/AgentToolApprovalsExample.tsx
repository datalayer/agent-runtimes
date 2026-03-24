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
import {
  Button,
  Heading,
  SegmentedControl,
  Spinner,
  Text,
} from '@primer/react';
import { AlertIcon, SignOutIcon, ToolsIcon } from '@primer/octicons-react';
import { useCoreStore } from '@datalayer/core';
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

const AI_AGENTS_API_PREFIX = '/api/ai-agents/v1';

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

const toWsUrl = (
  baseUrl: string,
  path: string,
  token?: string,
): string | null => {
  try {
    const url = new URL(baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = path;
    if (token) {
      url.searchParams.set('token', token);
    } else {
      url.search = '';
    }
    return url.toString();
  } catch {
    return null;
  }
};

const normalizeAiAgentsBaseUrl = (rawBaseUrl: string): string => {
  const trimmed = rawBaseUrl.replace(/\/$/, '');
  if (trimmed.endsWith(AI_AGENTS_API_PREFIX)) {
    return trimmed.slice(0, -AI_AGENTS_API_PREFIX.length);
  }
  return trimmed;
};

const queryClient = new QueryClient();
const AGENT_NAME = 'tool-approval-demo-agent';
const AGENT_SPEC_ID = 'simple-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const FALLBACK_AI_AGENTS_BASE_URL =
  import.meta.env.VITE_AI_AGENTS_URL || DEFAULT_SERVICE_URLS.AI_AGENTS;

type ApprovalMode = 'local' | 'server';

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  note?: string;
  created_at?: string;
  status?: string;
  agent_id?: string;
  backendBaseUrl?: string;
  apiPrefix?: string;
}

const approvalSignature = (
  toolName: string,
  args: Record<string, unknown>,
): string => `${normalizeToolName(toolName)}::${stableStringify(args ?? {})}`;

const AgentToolApprovalsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const [mode, setMode] = useState<ApprovalMode>('local');
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(AGENT_NAME);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [localApprovals, setLocalApprovals] = useState<ToolApprovalRequest[]>(
    [],
  );
  const [activeApproval, setActiveApproval] =
    useState<ToolApprovalRequest | null>(null);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [toolApprovalState, setToolApprovalState] = useState<
    Record<string, 'approved' | 'denied'>
  >({});
  const [wsState, setWsState] = useState<'connecting' | 'connected' | 'closed'>(
    'closed',
  );

  const createdApprovalSignatures = useRef<Set<string>>(new Set());
  const resolveLocalRef = useRef<
    (
      toolName: string,
      toolArgs: Record<string, unknown>,
    ) => Promise<ToolApprovalRequest | null>
  >(async () => null);
  const authFetchRef = useRef<
    (url: string, opts?: RequestInit) => Promise<Response>
  >((url, opts) => fetch(url, opts));
  const chatAuthToken: string | undefined = token === null ? undefined : token;
  const configuredAiAgentsBaseUrl = useCoreStore(
    (s: any) => s.configuration?.aiagentsRunUrl,
  );

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const aiAgentsBaseUrl = normalizeAiAgentsBaseUrl(
    configuredAiAgentsBaseUrl || FALLBACK_AI_AGENTS_BASE_URL,
  );
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
            enable_skills: false,
            skills: [],
            tools: ['runtime-echo', 'runtime-sensitive-echo'],
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
    if (!isReady) {
      return;
    }

    const fetchPendingApprovals = async (
      baseUrl: string,
      apiPrefix: string,
    ): Promise<ToolApprovalRequest[]> => {
      const res = await authFetch(`${baseUrl}${apiPrefix}`);
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      const allApprovals = Array.isArray(data)
        ? data
        : (data.approvals ?? data.requests ?? []);
      return allApprovals
        .filter(
          (approval: ToolApprovalRequest) =>
            approval.status === 'pending' &&
            (approval.agent_id === agentId || !approval.agent_id),
        )
        .map((approval: ToolApprovalRequest) => ({
          ...approval,
          backendBaseUrl: baseUrl,
          apiPrefix,
        }));
    };

    const source =
      mode === 'server'
        ? {
            baseUrl: aiAgentsBaseUrl,
            apiPrefix: `${AI_AGENTS_API_PREFIX}/tool-approvals`,
          }
        : { baseUrl: agentBaseUrl, apiPrefix: '/api/v1/tool-approvals' };

    try {
      const localPending = await fetchPendingApprovals(
        agentBaseUrl,
        '/api/v1/tool-approvals',
      );
      setLocalApprovals(localPending);

      const pendingForAgent = await fetchPendingApprovals(
        source.baseUrl,
        source.apiPrefix,
      );

      setApprovals(pendingForAgent);
    } catch (error) {
      if (mode === 'server') {
        setApprovalError(
          error instanceof Error
            ? error.message
            : 'Failed to fetch server approvals',
        );
      }
    }
  }, [isReady, mode, aiAgentsBaseUrl, agentBaseUrl, agentId, authFetch]);

  const resolveLocalApprovalForTool = useCallback(
    async (
      toolName: string,
      toolArgs: Record<string, unknown>,
    ): Promise<ToolApprovalRequest | null> => {
      const signature = approvalSignature(toolName, toolArgs);
      const matchFromState = localApprovals.find(
        approval =>
          approvalSignature(approval.tool_name, approval.tool_args ?? {}) ===
          signature,
      );
      if (matchFromState) {
        return matchFromState;
      }

      const res = await authFetch(`${agentBaseUrl}/api/v1/tool-approvals`);
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const allApprovals = Array.isArray(data)
        ? data
        : (data.approvals ?? data.requests ?? []);
      const pendingLocal = allApprovals
        .filter(
          (approval: ToolApprovalRequest) =>
            approval.status === 'pending' &&
            (approval.agent_id === agentId || !approval.agent_id),
        )
        .map((approval: ToolApprovalRequest) => ({
          ...approval,
          backendBaseUrl: agentBaseUrl,
          apiPrefix: '/api/v1/tool-approvals',
        }));
      setLocalApprovals(pendingLocal);
      return (
        pendingLocal.find(
          approval =>
            approvalSignature(approval.tool_name, approval.tool_args ?? {}) ===
            signature,
        ) || null
      );
    },
    [localApprovals, authFetch, agentBaseUrl, agentId],
  );

  useEffect(() => {
    void pollApprovals();
    const interval = setInterval(pollApprovals, 5000);
    return () => clearInterval(interval);
  }, [pollApprovals]);

  useEffect(() => {
    if (!isReady || mode !== 'server') {
      setWsState('closed');
      return;
    }

    const wsUrl = toWsUrl(
      aiAgentsBaseUrl,
      `${AI_AGENTS_API_PREFIX}/tool-approvals/ws`,
      chatAuthToken,
    );
    if (!wsUrl) {
      setWsState('closed');
      return;
    }

    let closedByCleanup = false;
    setWsState('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsState('connected');
      void pollApprovals();
    };

    ws.onmessage = event => {
      try {
        const payload = JSON.parse(String(event.data));
        const wsEvent = payload?.event as string | undefined;
        const approval = payload?.approval as ToolApprovalRequest | undefined;
        if (!wsEvent || !approval) {
          return;
        }

        if (wsEvent === 'tool_approval_created') {
          if (
            approval.status !== 'pending' ||
            (approval.agent_id && approval.agent_id !== agentId)
          ) {
            return;
          }
          setApprovals(prev => {
            const next = prev.filter(item => item.id !== approval.id);
            next.unshift({
              ...approval,
              backendBaseUrl: aiAgentsBaseUrl,
              apiPrefix: `${AI_AGENTS_API_PREFIX}/tool-approvals`,
            });
            return next;
          });
          return;
        }

        if (
          wsEvent === 'tool_approval_approved' ||
          wsEvent === 'tool_approval_rejected'
        ) {
          // Remove from the server approval queue.
          setApprovals(prev => prev.filter(item => item.id !== approval.id));

          // Bridge the decision to the local agent-runtimes approval.
          const action =
            wsEvent === 'tool_approval_approved' ? 'approve' : 'reject';
          void (async () => {
            try {
              const localMatch = await resolveLocalRef.current(
                approval.tool_name,
                approval.tool_args ?? {},
              );
              if (localMatch) {
                const localBaseUrl = `${agentBaseUrl}/api/v1/tool-approvals/${localMatch.id}/${action}`;
                await authFetchRef.current(localBaseUrl, {
                  method: 'POST',
                  body: JSON.stringify(
                    approval.note ? { note: approval.note } : {},
                  ),
                });
              }
            } catch {
              // Local bridge errors are non-fatal; poll will reconcile.
            }
          })();
          return;
        }
      } catch {
        // Ignore malformed WS payloads.
      }
    };

    ws.onclose = () => {
      if (!closedByCleanup) {
        setWsState('closed');
      }
    };

    ws.onerror = () => {
      setWsState('closed');
    };

    return () => {
      closedByCleanup = true;
      ws.close();
      setWsState('closed');
    };
  }, [
    isReady,
    mode,
    aiAgentsBaseUrl,
    agentBaseUrl,
    chatAuthToken,
    agentId,
    pollApprovals,
  ]);

  // Keep refs in sync so the WS handler always has the latest functions.
  useEffect(() => {
    resolveLocalRef.current = resolveLocalApprovalForTool;
  }, [resolveLocalApprovalForTool]);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const approve = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const approval = approvals.find(item => item.id === requestId);
        const baseUrl =
          approval?.backendBaseUrl ||
          (mode === 'server' ? aiAgentsBaseUrl : agentBaseUrl);
        const apiPrefix =
          approval?.apiPrefix ||
          (mode === 'server'
            ? `${AI_AGENTS_API_PREFIX}/tool-approvals`
            : '/api/v1/tool-approvals');

        const response = await authFetch(
          `${baseUrl}${apiPrefix}/${requestId}/approve`,
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

        // In server mode the WS event will remove from queue and bridge to
        // the local runtime — don't do it here to keep flow server-driven.
        if (mode !== 'server') {
          setApprovals(prev => prev.filter(a => a.id !== requestId));
          void pollApprovals();
        }
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
    [approvals, mode, aiAgentsBaseUrl, agentBaseUrl, authFetch, pollApprovals],
  );

  const reject = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const approval = approvals.find(item => item.id === requestId);
        const baseUrl =
          approval?.backendBaseUrl ||
          (mode === 'server' ? aiAgentsBaseUrl : agentBaseUrl);
        const apiPrefix =
          approval?.apiPrefix ||
          (mode === 'server'
            ? `${AI_AGENTS_API_PREFIX}/tool-approvals`
            : '/api/v1/tool-approvals');

        const response = await authFetch(
          `${baseUrl}${apiPrefix}/${requestId}/reject`,
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

        // In server mode the WS event will remove from queue and bridge to
        // the local runtime — don't do it here to keep flow server-driven.
        if (mode !== 'server') {
          setApprovals(prev => prev.filter(a => a.id !== requestId));
          void pollApprovals();
        }
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
    [approvals, mode, aiAgentsBaseUrl, agentBaseUrl, authFetch, pollApprovals],
  );

  const ensureServerApproval = useCallback(
    async (toolName: string, args: Record<string, unknown>) => {
      if (mode !== 'server' || !aiAgentsBaseUrl || !isReady) {
        return;
      }

      const signature = approvalSignature(toolName, args);
      if (createdApprovalSignatures.current.has(signature)) {
        return;
      }

      const alreadyTracked = approvals.some(
        approval =>
          approvalSignature(approval.tool_name, approval.tool_args ?? {}) ===
          signature,
      );
      if (alreadyTracked) {
        createdApprovalSignatures.current.add(signature);
        return;
      }

      createdApprovalSignatures.current.add(signature);

      try {
        const response = await authFetch(
          `${aiAgentsBaseUrl}${AI_AGENTS_API_PREFIX}/tool-approvals`,
          {
            method: 'POST',
            body: JSON.stringify({
              agent_id: agentId,
              pod_name: podName,
              tool_name: toolName,
              tool_args: args,
            }),
          },
        );

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(
            text ||
              `Failed creating server approval (${response.status} ${response.statusText})`,
          );
        }

        const created = (await response.json()) as ToolApprovalRequest;
        setApprovals(prev => {
          const next = prev.filter(item => item.id !== created.id);
          next.unshift({
            ...created,
            backendBaseUrl: aiAgentsBaseUrl,
            apiPrefix: `${AI_AGENTS_API_PREFIX}/tool-approvals`,
          });
          return next;
        });
      } catch (error) {
        createdApprovalSignatures.current.delete(signature);
        setApprovalError(
          error instanceof Error
            ? error.message
            : 'Failed to create server approval request',
        );
      }
    },
    [mode, aiAgentsBaseUrl, isReady, approvals, authFetch, agentId, podName],
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

      const requiresServerApproval =
        mode === 'server' &&
        normalizeToolName(toolName) ===
          normalizeToolName('runtime_sensitive_echo');

      if (requiresServerApproval && !matchedApproval) {
        void ensureServerApproval(toolName, args);
      }

      const toolDecision = toolApprovalState[toolCallId];
      const loadingThisApproval =
        !!matchedApproval && approvalLoading === matchedApproval.id;
      const approvalState: 'pending' | 'approved' | 'denied' | undefined =
        toolDecision ||
        (pendingByResult || requiresServerApproval || !!matchedApproval
          ? 'pending'
          : undefined);

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
      mode,
      findMatchingApproval,
      ensureServerApproval,
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

  const serverPanel =
    mode === 'server' ? (
      <Box
        sx={{
          width: 320,
          minWidth: 280,
          borderLeft: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          bg: 'canvas.subtle',
        }}
      >
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Heading as="h4" sx={{ fontSize: 1, mb: 1 }}>
            Server Approval Queue
          </Heading>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            WebSocket: {wsState} • Pending: {approvals.length}
          </Text>
        </Box>
        <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
          {approvals.length === 0 ? (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              No pending approvals.
            </Text>
          ) : (
            approvals.map(approval => (
              <Box
                key={approval.id}
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                  bg: 'canvas.default',
                }}
              >
                <Text sx={{ fontWeight: 600, fontSize: 1 }}>
                  {approval.tool_name}
                </Text>
                <Text sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                  {approval.id}
                </Text>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => void approve(approval.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() =>
                      void reject(approval.id, 'Rejected from queue')
                    }
                  >
                    Reject
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Box>
    ) : null;

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running - reconnected.
          </Text>
        </Box>
      )}

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

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            transport="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title={`Tool Approval Agent - ${podName}`}
            placeholder="Ask for actions that require approval..."
            showHeader={true}
            showNewChatButton={true}
            showClearButton={false}
            showTokenUsage={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            headerActions={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SegmentedControl
                  aria-label="Approval mode"
                  size="small"
                  onChange={index => setMode(index === 0 ? 'local' : 'server')}
                >
                  <SegmentedControl.Button selected={mode === 'local'}>
                    Local
                  </SegmentedControl.Button>
                  <SegmentedControl.Button selected={mode === 'server'}>
                    Server
                  </SegmentedControl.Button>
                </SegmentedControl>
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
            }
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

        {serverPanel}
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
          description="Sign in to test local and server-backed tool approvals."
          leadingIcon={<ToolsIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentToolApprovalsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentToolApprovalsExample;
