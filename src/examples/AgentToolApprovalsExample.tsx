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
import { Button, Spinner, Text } from '@primer/react';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import {
  CheckCircleIcon,
  SignOutIcon,
  ToolsIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import type { RenderToolResult } from '../types';
import { ToolCallDisplay, type PendingApproval } from '../chat/tools';
import {
  parseAgentStreamMessage,
  type AgentStreamSnapshotPayload,
  type AgentStreamToolApprovalPayload,
} from '../types/stream';

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

const AI_AGENTS_API_PREFIX = '/api/ai-agents/v1';

const normalizeAiAgentsBaseUrl = (rawBaseUrl: string): string => {
  const trimmed = rawBaseUrl.replace(/\/$/, '');
  if (trimmed.endsWith(AI_AGENTS_API_PREFIX)) {
    return trimmed.slice(0, -AI_AGENTS_API_PREFIX.length);
  }
  return trimmed;
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

type ApprovalUiStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalActionBanner {
  id: string;
  toolName: string;
  status: Exclude<ApprovalUiStatus, 'pending'>;
}

const normalizeAgentId = (value?: string): string =>
  (value ?? '').trim().toLowerCase();

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

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [toolApprovalState, setToolApprovalState] = useState<
    Record<string, 'approved' | 'denied'>
  >({});
  const [approvalActionBanner, setApprovalActionBanner] =
    useState<ApprovalActionBanner | null>(null);
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
        toolArgs: Record<string, unknown>;
        respond?: (result: unknown) => void;
      }
    >
  >(new Map());
  const respondedToolCallsRef = useRef<Set<string>>(new Set());
  const pendingWithoutApprovalRef = useRef<Set<string>>(new Set());
  const pendingSnapshotRequestedRef = useRef<Set<string>>(new Set());
  const queuedResultBackedApprovalsRef = useRef<Set<string>>(new Set());
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

  const requestApprovalSnapshot = useCallback((reason: string) => {
    const ws = approvalWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }
    ws.send(JSON.stringify({ type: 'tool-approvals-history' }));
    console.info('[AgentToolApprovalsExample] Requested approval snapshot', {
      reason,
    });
  }, []);

  const emitServerToolDecision = useCallback(
    (
      toolCallId: string | undefined,
      toolName: string,
      toolArgs: Record<string, unknown>,
      approved: boolean,
      approvalId: string,
      message?: string,
    ): boolean => {
      console.info(
        '[AgentToolApprovalsExample] emitServerToolDecision called',
        {
          toolCallId,
          toolName,
          approved,
          approvalId,
          knownResponderToolCallIds: Array.from(
            toolRespondersRef.current.keys(),
          ),
        },
      );
      let responder =
        toolCallId && toolRespondersRef.current.has(toolCallId)
          ? toolRespondersRef.current.get(toolCallId)
          : undefined;

      if (!responder) {
        const signature = approvalSignature(toolName, toolArgs);
        responder = Array.from(toolRespondersRef.current.values()).find(
          entry => {
            return (
              approvalSignature(entry.toolName, entry.toolArgs) === signature
            );
          },
        );
      }

      if (!responder?.respond) {
        console.info(
          '[AgentToolApprovalsExample] No responder found for server decision',
          {
            toolCallId,
            toolName,
            approvalId,
            knownResponderToolCallIds: Array.from(
              toolRespondersRef.current.keys(),
            ),
          },
        );
        return false;
      }

      if (respondedToolCallsRef.current.has(responder.toolCallId)) {
        return false;
      }

      setToolApprovalState(prev => ({
        ...prev,
        [responder.toolCallId]: approved ? 'approved' : 'denied',
      }));

      setApprovals(prev =>
        prev.map(item =>
          item.id === approvalId
            ? {
                ...item,
                status: approved ? 'approved' : 'rejected',
                note: message ?? item.note,
              }
            : item,
        ),
      );
      setApprovalActionBanner({
        id: approvalId,
        toolName: responder.toolName || toolName,
        status: approved ? 'approved' : 'rejected',
      });

      respondedToolCallsRef.current.add(responder.toolCallId);
      console.info(
        '[AgentToolApprovalsExample] Applying server decision via responder',
        {
          toolCallId: responder.toolCallId,
          approvalId,
          approved,
        },
      );
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

  useEffect(() => {
    if (!approvalActionBanner) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setApprovalActionBanner(current =>
        current?.id === approvalActionBanner.id ? null : current,
      );
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [approvalActionBanner]);

  const toApprovalRequest = useCallback(
    (payload: AgentStreamToolApprovalPayload): ToolApprovalRequest => {
      const raw = payload as AgentStreamToolApprovalPayload & {
        approval_id?: string;
        toolName?: string;
        toolCallId?: string;
        agentId?: string;
        createdAt?: string;
        updatedAt?: string;
      };
      return {
        id:
          typeof payload.id === 'string' && payload.id.length > 0
            ? payload.id
            : typeof raw.approval_id === 'string'
              ? raw.approval_id
              : '',
        tool_name:
          typeof payload.tool_name === 'string' && payload.tool_name.length > 0
            ? payload.tool_name
            : typeof raw.toolName === 'string'
              ? raw.toolName
              : 'unknown_tool',
        tool_args: payload.tool_args,
        tool_call_id:
          typeof payload.tool_call_id === 'string'
            ? payload.tool_call_id
            : typeof raw.toolCallId === 'string'
              ? raw.toolCallId
              : typeof payload.tool_args?.tool_call_id === 'string'
                ? payload.tool_args.tool_call_id
                : undefined,
        note: payload.note ?? undefined,
        created_at: payload.created_at ?? raw.createdAt,
        status: payload.status,
        agent_id: payload.agent_id ?? raw.agentId,
      };
    },
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
      const normalizedApprovalAgentId = normalizeAgentId(approval.agent_id);
      const normalizedActiveAgentId = normalizeAgentId(agentId);
      if (
        normalizedApprovalAgentId.includes(normalizedActiveAgentId) ||
        normalizedActiveAgentId.includes(normalizedApprovalAgentId)
      ) {
        return true;
      }
      return false;
    },
    [agentId],
  );

  const enqueueResultBackedApproval = useCallback(
    (approval: ToolApprovalRequest) => {
      if (!approval.id) {
        return;
      }
      if (queuedResultBackedApprovalsRef.current.has(approval.id)) {
        return;
      }
      queuedResultBackedApprovalsRef.current.add(approval.id);
      queueMicrotask(() => {
        queuedResultBackedApprovalsRef.current.delete(approval.id);
        if (!isApprovalForActiveAgent(approval)) {
          return;
        }
        setApprovals(prev => {
          if (prev.some(item => item.id === approval.id)) {
            return prev;
          }
          return [approval, ...prev];
        });
      });
    },
    [isApprovalForActiveAgent],
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
  }, [agentId]);

  useEffect(() => {
    if (!isReady) {
      setWsState('closed');
      return;
    }

    const wsUrl = toWsUrl(
      aiAgentsBaseUrl,
      `${AI_AGENTS_API_PREFIX}/ws`,
      chatAuthToken,
    );
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
      ws.send(JSON.stringify({ type: 'tool-approvals-history' }));
    };

    ws.onmessage = event => {
      try {
        const raw = JSON.parse(String(event.data));

        if (
          raw &&
          typeof raw === 'object' &&
          (raw as Record<string, unknown>).type === 'tool-approvals-history'
        ) {
          const data = (raw as { data?: { approvals?: unknown[] } }).data;
          const list = Array.isArray(data?.approvals)
            ? data.approvals
                .map(item =>
                  toApprovalRequest(item as AgentStreamToolApprovalPayload),
                )
                .filter(approval => isApprovalForActiveAgent(approval))
            : [];
          pendingSnapshotRequestedRef.current.clear();
          setApprovals(list);
          return;
        }

        const stream = parseAgentStreamMessage(raw);
        if (!stream) {
          return;
        }
        console.debug(
          '[AgentToolApprovalsExample] WS stream event',
          stream.type,
          stream.payload,
        );

        if (stream.type === 'agent.snapshot') {
          const payload =
            stream.payload as unknown as AgentStreamSnapshotPayload;
          const snapshotApprovals = (payload.approvals ?? [])
            .map(toApprovalRequest)
            .filter(approval => isApprovalForActiveAgent(approval));
          pendingSnapshotRequestedRef.current.clear();
          setApprovals(snapshotApprovals);
          return;
        }

        if (stream.type === 'tool_approval_created') {
          const approval = toApprovalRequest(
            stream.payload as unknown as AgentStreamToolApprovalPayload,
          );
          if (!isApprovalForActiveAgent(approval)) {
            return;
          }
          pendingSnapshotRequestedRef.current.delete(
            approval.tool_call_id ?? '',
          );
          setApprovals(prev => {
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

          setApprovals(prev =>
            prev.map(item =>
              item.id === approval.id
                ? {
                    ...item,
                    status:
                      stream.type === 'tool_approval_approved'
                        ? 'approved'
                        : 'rejected',
                    note: approval.note ?? item.note,
                  }
                : item,
            ),
          );
          emitServerToolDecision(
            approval.tool_call_id,
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
    aiAgentsBaseUrl,
    agentBaseUrl,
    chatAuthToken,
    agentId,
    isApprovalForActiveAgent,
    emitServerToolDecision,
    toApprovalRequest,
  ]);

  const approve = useCallback(
    async (
      requestId: string,
      note?: string,
      _source: 'inline' | 'banner' = 'banner',
    ): Promise<boolean> => {
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
    async (
      requestId: string,
      note?: string,
      _source: 'inline' | 'banner' = 'banner',
    ): Promise<boolean> => {
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
      approvals
        .filter(req => (req.status ?? 'pending') === 'pending')
        .map(req => ({
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
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
    ): ToolApprovalRequest | null => {
      const byToolCallId = approvals.find(
        approval => approval.tool_call_id === toolCallId,
      );
      if (byToolCallId) {
        return byToolCallId;
      }
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
      _toolArgs: Record<string, unknown>,
      _respond?: (result: unknown) => void,
    ) => {
      // Deferred approvals unblock the server via the WS `tool_approval_decision`
      // message (same path the top banner uses). Do NOT also call `respond()`
      // here: that would trigger a parallel continuation POST and race with
      // the server-side `request_and_wait` resume, making the inline click
      // appear ineffective.
      //
      // IMPORTANT: do NOT add the toolCallId to `respondedToolCallsRef`
      // here either — that guard is owned by `emitServerToolDecision`,
      // which fires when the server echoes `tool_approval_approved` and
      // is the single point that invokes `responder.respond(...)` to
      // resume the conversation. Marking it responded locally would make
      // the WS handler skip the responder and the agent reply would
      // never arrive.
      setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'approved' }));
      void toolName;
      await approve(requestId, 'Approved from tool message card', 'inline');
    },
    [approve],
  );

  const handleToolLevelDeny = useCallback(
    async (
      toolCallId: string,
      requestId: string,
      toolName: string,
      _toolArgs: Record<string, unknown>,
      _respond?: (result: unknown) => void,
    ) => {
      // See `handleToolLevelApprove` — rely exclusively on the WS decision
      // so the server's deferred manager can resume the single open stream.
      // Do not pre-populate `respondedToolCallsRef`; the WS event handler
      // does that after calling the responder so the conversation can
      // continue with the denial result.
      setToolApprovalState(prev => ({ ...prev, [toolCallId]: 'denied' }));
      void toolName;
      await reject(requestId, 'Rejected from tool message card', 'inline');
    },
    [reject],
  );

  const renderToolResult: RenderToolResult = useCallback(
    ({ toolCallId, toolName, args, result, status, error, respond }) => {
      if (respond && (status === 'inProgress' || status === 'executing')) {
        toolRespondersRef.current.set(toolCallId, {
          toolCallId,
          toolName,
          toolArgs: args,
          respond,
        });
        console.info('[AgentToolApprovalsExample] Registered responder', {
          toolCallId,
          status,
          toolName,
        });
      }

      const matchedApproval = findMatchingApproval(toolCallId, toolName, args);
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
      const resultHasDecision =
        !!resultObject && typeof resultObject?.approved === 'boolean';
      const effectiveApprovalId = matchedApproval?.id ?? approvalIdFromResult;

      if (approvalIdFromResult && !matchedApproval?.id && !resultHasDecision) {
        enqueueResultBackedApproval({
          id: approvalIdFromResult,
          tool_name: toolName,
          tool_args: args,
          tool_call_id: toolCallId,
          status: 'pending',
          created_at: new Date().toISOString(),
          agent_id: agentId,
        });
      }

      if (
        (pendingByResult || status === 'executing') &&
        !matchedApproval?.id &&
        !approvalIdFromResult
      ) {
        pendingWithoutApprovalRef.current.add(toolCallId);
        console.info(
          '[AgentToolApprovalsExample] Pending approval without authoritative id yet',
          {
            toolCallId,
            toolName,
            pendingByResult,
          },
        );
      }

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
                    args,
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
                    args,
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
      agentId,
      enqueueResultBackedApproval,
      handleToolLevelApprove,
      handleToolLevelDeny,
    ],
  );

  useEffect(() => {
    if (pendingWithoutApprovalRef.current.size === 0) {
      return;
    }
    const pendingToolCallIds = Array.from(pendingWithoutApprovalRef.current);
    pendingWithoutApprovalRef.current.clear();
    const notYetRequested = pendingToolCallIds.filter(
      toolCallId => !pendingSnapshotRequestedRef.current.has(toolCallId),
    );
    if (notYetRequested.length === 0) {
      return;
    }
    notYetRequested.forEach(toolCallId => {
      pendingSnapshotRequestedRef.current.add(toolCallId);
    });
    requestApprovalSnapshot('inline-pending-without-any-approval-id');
  }, [approvals, wsState, requestApprovalSnapshot]);

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
        <Text sx={{ color: 'fg.muted' }}>Launching tool approvals demo...</Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

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

      {approvalActionBanner && (
        <Box sx={{ px: 3, py: 1 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              color:
                approvalActionBanner.status === 'approved'
                  ? 'success.fg'
                  : 'danger.fg',
            }}
          >
            {approvalActionBanner.status === 'approved' ? (
              <CheckCircleIcon size={14} />
            ) : (
              <XCircleIcon size={14} />
            )}
            <Text
              sx={{
                color: 'inherit',
                fontSize: 0,
                fontWeight: 600,
              }}
            >
              {approvalActionBanner.status === 'approved'
                ? 'Approved'
                : 'Rejected'}{' '}
              {approvalActionBanner.toolName}.
            </Text>
          </Box>
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
            pendingApprovals={pendingApprovals}
            onApproveApproval={approve}
            onRejectApproval={reject}
          />
        </Box>
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
          description="Sign in to test runtime-backed tool approvals."
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
