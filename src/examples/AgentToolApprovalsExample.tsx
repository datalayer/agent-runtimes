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
import { ErrorView } from './components';
import {
  Button,
  Heading,
  SegmentedControl,
  Spinner,
  Text,
} from '@primer/react';
import { SignOutIcon, ToolsIcon } from '@primer/octicons-react';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import type { RenderToolResult } from '../types';
import {
  ToolCallDisplay,
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../chat/tools';
import {
  parseAgentStreamMessage,
  type AgentStreamSnapshotPayload,
  type AgentStreamToolApprovalPayload,
} from '../types/stream';

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
const AGENT_NAME_PREFIX = 'tool-approval-demo-agent';
const DEFAULT_AGENT_SPEC_ID = 'demo-full';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const FALLBACK_AI_AGENTS_BASE_URL =
  import.meta.env.VITE_AI_AGENTS_URL || DEFAULT_SERVICE_URLS.AI_AGENTS;

const getSelectedAgentSpecIdFromUi = (): string => {
  const params = new URLSearchParams(window.location.search);

  const directKeys = [
    'agent_spec_id',
    'agentSpecId',
    'spec_id',
    'specId',
    'spec',
  ];
  for (const key of directKeys) {
    const value = params.get(key);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  const selectedAgentId = params.get('selectedAgentId');
  if (selectedAgentId?.startsWith('spec:')) {
    const specId = selectedAgentId.slice('spec:'.length).trim();
    if (specId) {
      return specId;
    }
  }

  return DEFAULT_AGENT_SPEC_ID;
};

const buildAgentNameForSpec = (specId: string): string => {
  const slug = specId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const base = slug ? `${AGENT_NAME_PREFIX}-${slug}` : AGENT_NAME_PREFIX;
  return uniqueAgentId(base);
};

type ApprovalMode = 'local' | 'server';

interface ToolApprovalRequest {
  id: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  tool_call_id?: string;
  note?: string;
  created_at?: string;
  status?: string;
  agent_id?: string;
}

const approvalSignature = (
  toolName: string,
  args: Record<string, unknown>,
): string => `${normalizeToolName(toolName)}::${stableStringify(args ?? {})}`;

type ApprovalWsDecisionMessage = {
  type: 'tool_approval_decision';
  approvalId: string;
  approved: boolean;
  note?: string;
};

const AgentToolApprovalsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const [selectedSpecId] = useState<string>(() =>
    getSelectedAgentSpecIdFromUi(),
  );
  const agentName = useMemo(
    () => buildAgentNameForSpec(selectedSpecId),
    [selectedSpecId],
  );

  const [mode, setMode] = useState<ApprovalMode>('local');
  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [_localApprovals, setLocalApprovals] = useState<ToolApprovalRequest[]>(
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

  const approvalWsRef = useRef<WebSocket | null>(null);
  const toolRespondersRef = useRef<
    Map<
      string,
      {
        toolCallId: string;
        toolName: string;
        respond?: (result: unknown) => void;
      }
    >
  >(new Map());
  const respondedToolCallsRef = useRef<Set<string>>(new Set());
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

  const emitServerToolDecision = useCallback(
    (
      toolName: string,
      toolArgs: Record<string, unknown>,
      approved: boolean,
      approvalId: string,
      message?: string,
    ): boolean => {
      const signature = approvalSignature(toolName, toolArgs);
      const responder = toolRespondersRef.current.get(signature);
      if (!responder?.respond) {
        return false;
      }

      if (respondedToolCallsRef.current.has(responder.toolCallId)) {
        return false;
      }

      setToolApprovalState(prev => ({
        ...prev,
        [responder.toolCallId]: approved ? 'approved' : 'denied',
      }));

      respondedToolCallsRef.current.add(responder.toolCallId);
      responder.respond({
        type: 'tool-approval-decision',
        approved,
        approvalId,
        toolName: responder.toolName || toolName,
        ...(message ? { message } : {}),
      });
      return true;
    },
    [],
  );

  const toApprovalRequest = useCallback(
    (payload: AgentStreamToolApprovalPayload): ToolApprovalRequest => ({
      id: payload.id,
      tool_name: payload.tool_name,
      tool_args: payload.tool_args,
      tool_call_id:
        typeof payload.tool_args?.tool_call_id === 'string'
          ? payload.tool_args.tool_call_id
          : undefined,
      note: payload.note ?? undefined,
      created_at: payload.created_at,
      status: payload.status,
      agent_id: payload.agent_id,
    }),
    [],
  );

  const isApprovalForActiveAgent = useCallback(
    (approval: ToolApprovalRequest): boolean => {
      if (!approval.agent_id) {
        return true;
      }
      if (approval.agent_id === agentId) {
        return true;
      }
      // Server mode can stream agent identifiers that do not match the local
      // runtime id format, so do not drop pending approvals in that mode.
      return mode === 'server';
    },
    [agentId, mode],
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
            name: agentName,
            description: 'Agent with runtime tool approvals',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: selectedSpecId,
            enable_skills: false,
            skills: [],
            tools: ['runtime-echo', 'runtime-sensitive-echo'],
          }),
        });

        let resolvedAgentId = agentName;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
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
  }, [agentBaseUrl, authFetch, agentName, selectedSpecId]);

  useEffect(() => {
    setApprovals([]);
    setLocalApprovals([]);
  }, [agentId, mode]);

  useEffect(() => {
    if (!isReady) {
      setWsState('closed');
      return;
    }

    const wsSourceBaseUrl = mode === 'server' ? aiAgentsBaseUrl : agentBaseUrl;
    const wsPath =
      mode === 'server'
        ? `${AI_AGENTS_API_PREFIX}/ws`
        : '/api/v1/tool-approvals/ws';

    const wsUrl = toWsUrl(wsSourceBaseUrl, wsPath, chatAuthToken);
    if (!wsUrl) {
      setWsState('closed');
      return;
    }

    let closedByCleanup = false;
    setWsState('connecting');
    const ws = new WebSocket(wsUrl);
    approvalWsRef.current = ws;

    ws.onopen = () => {
      setWsState('connected');
    };

    ws.onmessage = event => {
      try {
        const stream = parseAgentStreamMessage(JSON.parse(String(event.data)));
        if (!stream) {
          return;
        }

        if (stream.type === 'agent.snapshot') {
          const payload =
            stream.payload as unknown as AgentStreamSnapshotPayload;
          const snapshotApprovals = (payload.approvals ?? [])
            .filter(
              approval =>
                approval.status === 'pending' &&
                isApprovalForActiveAgent(toApprovalRequest(approval)),
            )
            .map(toApprovalRequest);
          setApprovals(snapshotApprovals);
          setLocalApprovals(snapshotApprovals);
          return;
        }

        if (stream.type === 'tool_approval_created') {
          const approval = toApprovalRequest(
            stream.payload as unknown as AgentStreamToolApprovalPayload,
          );
          if (
            approval.status !== 'pending' ||
            !isApprovalForActiveAgent(approval)
          ) {
            return;
          }
          setApprovals(prev => {
            const next = prev.filter(item => item.id !== approval.id);
            next.unshift(approval);
            return next;
          });
          setLocalApprovals(prev => {
            const next = prev.filter(item => item.id !== approval.id);
            next.unshift(approval);
            return next;
          });
          return;
        }

        if (
          stream.type === 'tool_approval_approved' ||
          stream.type === 'tool_approval_rejected'
        ) {
          const approval = toApprovalRequest(
            stream.payload as unknown as AgentStreamToolApprovalPayload,
          );

          setApprovals(prev => prev.filter(item => item.id !== approval.id));
          setLocalApprovals(prev =>
            prev.filter(item => item.id !== approval.id),
          );
          emitServerToolDecision(
            approval.tool_name,
            approval.tool_args ?? {},
            stream.type === 'tool_approval_approved',
            approval.id,
            approval.note,
          );
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
      approvalWsRef.current = null;
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
    isApprovalForActiveAgent,
    emitServerToolDecision,
    toApprovalRequest,
  ]);

  const approve = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const ws = approvalWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('Approval websocket is not connected');
        }

        const decision: ApprovalWsDecisionMessage = {
          type: 'tool_approval_decision',
          approvalId: requestId,
          approved: true,
          ...(note ? { note } : {}),
        };
        ws.send(JSON.stringify(decision));
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
    [],
  );

  const reject = useCallback(
    async (requestId: string, note?: string): Promise<boolean> => {
      setApprovalLoading(requestId);
      setApprovalError(null);
      try {
        const ws = approvalWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('Approval websocket is not connected');
        }

        const decision: ApprovalWsDecisionMessage = {
          type: 'tool_approval_decision',
          approvalId: requestId,
          approved: false,
          ...(note ? { note } : {}),
        };
        ws.send(JSON.stringify(decision));
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
    [],
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
    async (
      toolCallId: string,
      requestId: string,
      toolName: string,
      respond?: (result: unknown) => void,
    ) => {
      const ok = await approve(requestId, 'Approved from tool message card');
      if (ok) {
        if (mode !== 'server') {
          setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'approved' }));
          respond?.({
            type: 'tool-approval-decision',
            approved: true,
            approvalId: requestId,
            toolName,
          });
        }
      }
    },
    [approve, mode],
  );

  const handleToolLevelDeny = useCallback(
    async (
      toolCallId: string,
      requestId: string,
      toolName: string,
      respond?: (result: unknown) => void,
    ) => {
      const ok = await reject(requestId, 'Rejected from tool message card');
      if (ok) {
        if (mode !== 'server') {
          setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'denied' }));
          respond?.({
            type: 'tool-approval-decision',
            approved: false,
            approvalId: requestId,
            toolName,
          });
        }
      }
    },
    [reject, mode],
  );

  const renderToolResult: RenderToolResult = useCallback(
    ({ toolCallId, toolName, args, result, status, error, respond }) => {
      const signature = approvalSignature(toolName, args);
      if (respond && status === 'inProgress') {
        toolRespondersRef.current.set(signature, {
          toolCallId,
          toolName,
          respond,
        });
      } else if (status === 'complete' || status === 'error') {
        toolRespondersRef.current.delete(signature);
      }

      const matchedApproval = findMatchingApproval(toolName, args);
      const resultObject =
        result && typeof result === 'object'
          ? (result as Record<string, unknown>)
          : undefined;
      const pendingByResult =
        status === 'inProgress' && resultObject?.pending_approval === true;
      const approvalIdFromResult =
        typeof resultObject?.approval_id === 'string'
          ? resultObject.approval_id
          : typeof resultObject?.approvalId === 'string'
            ? resultObject.approvalId
            : null;
      const effectiveApprovalId = matchedApproval?.id ?? approvalIdFromResult;

      const toolDecision = toolApprovalState[toolCallId];
      const loadingThisApproval =
        !!effectiveApprovalId && approvalLoading === effectiveApprovalId;
      const approvalState: 'pending' | 'approved' | 'denied' | undefined =
        toolDecision ||
        (pendingByResult || !!effectiveApprovalId ? 'pending' : undefined);

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
            effectiveApprovalId
              ? () =>
                  void handleToolLevelApprove(
                    toolCallId,
                    effectiveApprovalId,
                    toolName,
                    respond,
                  )
              : undefined
          }
          onDeny={
            effectiveApprovalId
              ? () =>
                  void handleToolLevelDeny(
                    toolCallId,
                    effectiveApprovalId,
                    toolName,
                    respond,
                  )
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
    return <ErrorView error={hookError} onLogout={onLogout} />;
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
            protocol="vercel-ai"
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
                  "Call the runtime_sensitive_echo tool with text 'hello' and reason 'audit', then reply with the tool result.",
              },
              {
                title: 'Run tool without approval',
                message:
                  "Call the runtime_echo tool with text 'hello world', then reply with the tool result.",
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
