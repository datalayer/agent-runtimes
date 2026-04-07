/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentTriggersExample
 *
 * Demonstrates multiple trigger types for agents: cron schedules,
 * webhook URLs, event-based listeners, and manual invocations.
 *
 * - Creates a cloud agent runtime (environment: 'ai-agents-env') via the Datalayer
 *   Runtimes API and deploys an agent via its sidecar
 * - Shows a tabbed control panel to configure each trigger type
 * - Lists recent trigger history and next scheduled run
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
  TextInput,
  Flash,
  Timeline,
  Truncate,
  Tooltip,
} from '@primer/react';
import {
  ClockIcon,
  SyncIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  SignOutIcon,
  GlobeIcon,
  ZapIcon,
  EyeIcon,
  EyeClosedIcon,
  TrashIcon,
  CopyIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ErrorView } from './components';
import { ThemedProvider } from './utils/themedProvider';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { UserBadge } from '@datalayer/core/lib/views/profile';
import { Chat } from '../chat';
import {
  ToolApprovalBanner,
  ToolApprovalDialog,
  type PendingApproval,
} from '../chat/tools';
import {
  useAgentEvents,
  useDeleteAgentEvent,
  useMarkEventRead,
  useMarkEventUnread,
  useAIAgentsWebSocket,
} from '../hooks';
import type { AgentEvent } from '../types';
import { VercelAIAdapter } from '../protocols';
import { createUserMessage } from '../types/messages';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'trigger-demo-agent';
const AGENT_SPEC_ID = 'demo-one-trigger';
const APPROVAL_AGENT_NAME = 'trigger-approval-demo-agent';
const APPROVAL_AGENT_SPEC_ID = 'demo-one-trigger-approval';
const ONCE_TRIGGER_PROMPT =
  "List the user's top 3 public and top 3 private GitHub repositories, ranked by recent activity, and provide a brief summary of each.";
const ONCE_TRIGGER_APPROVAL_PROMPT =
  "Call runtime_sensitive_echo exactly once with message='Tool approval demo executed' and reason='audit'. Do not call any other tool.";
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';
const DEFAULT_CRON = '0 8 * * *'; // daily at 08:00 UTC

// ─── Types ─────────────────────────────────────────────────────────────────

type TriggerTab = 'once' | 'cron' | 'webhook' | 'event' | 'manual';

interface TriggerRecord {
  id: string;
  timestamp: string;
  status: 'success' | 'failure' | 'running';
  duration_ms?: number;
  source?: TriggerTab;
}



// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentTriggerInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(AGENT_NAME);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  // Cron state
  const [cronExpr, setCronExpr] = useState(DEFAULT_CRON);
  const [editCron, setEditCron] = useState(DEFAULT_CRON);
  const [nextRun, setNextRun] = useState<string | null>(null);
  const [triggerHistory, setTriggerHistory] = useState<TriggerRecord[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTriggeringNow, setIsTriggeringNow] = useState(false);
  const [triggerFlash, setTriggerFlash] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<TriggerTab>('once');

  // Once trigger state
  const [isLaunchingOnce, setIsLaunchingOnce] = useState(false);
  const [onceFlash, setOnceFlash] = useState<string | null>(null);
  const [lastOnceStartedAt, setLastOnceStartedAt] = useState<string | null>(null);
  const [hasTriggeredOnce, setHasTriggeredOnce] = useState(false);
  const [streamedOnceOutput, setStreamedOnceOutput] = useState<string | null>(null);
  const [streamedOnceEndedAt, setStreamedOnceEndedAt] = useState<string | null>(null);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookEnabled, setWebhookEnabled] = useState(false);

  // Sidebar messages state
  const [sidebarMessages, setSidebarMessages] = useState<Array<{
    id: string;
    role: string;
    content: unknown;
    createdAt?: string;
  }>>([]);
  const [sidebarMessagesError, setSidebarMessagesError] = useState<string | null>(null);

  // Event state
  const [eventTopic, setEventTopic] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [eventSubscribed, setEventSubscribed] = useState(false);

  // Approval agent state
  const [approvalAgentId, setApprovalAgentId] = useState<string>(APPROVAL_AGENT_NAME);
  const [approvalAgentReady, setApprovalAgentReady] = useState(false);
  const [isLaunchingApproval, setIsLaunchingApproval] = useState(false);
  const [approvalFlash, setApprovalFlash] = useState<string | null>(null);
  const [hasTriggeredApproval, setHasTriggeredApproval] = useState(false);

  // Tool approval state
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
  const [approvals, setApprovals] = useState<ToolApprovalRequest[]>([]);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [activeApproval, setActiveApproval] = useState<ToolApprovalRequest | null>(null);

  // Approval sidebar messages
  const [approvalSidebarMessages, setApprovalSidebarMessages] = useState<Array<{
    id: string;
    role: string;
    content: unknown;
    createdAt?: string;
  }>>([]);
  const approvalStreamRef = useRef<{
    adapter: VercelAIAdapter;
    unsubscribe: () => void;
  } | null>(null);

  // Events hooks
  const eventsQuery = useAgentEvents(agentId);
  const deleteEventMutation = useDeleteAgentEvent(agentId);
  const markReadMutation = useMarkEventRead(agentId);
  const markUnreadMutation = useMarkEventUnread(agentId);
  const agentEvents: AgentEvent[] = eventsQuery.data?.events ?? [];

  // WebSocket for real-time event updates
  useAIAgentsWebSocket({
    channels: agentId ? [`agent:${agentId}`] : [],
  });

  // Authenticated fetch helper (for sidecar endpoints)
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

  // ── Create agent on local server ─────────────────────────────────────────

  useEffect(() => {
    let isCancelled = false;

    const createAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: AGENT_NAME,
            description: 'Agent with cron, webhook, event, and manual triggers',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            tools: [],
          }),
        });

        let resolvedAgentId = AGENT_NAME;

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
            // Agent already running — reuse it
          } else {
            throw new Error(
              detail || `Failed to create agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
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

    void createAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, authFetch]);

  // ── Poll trigger metadata ─────────────────────────────────────────────
  // TODO: enable once the ai-agents service exposes /trigger and
  //       /trigger/history endpoints on the platform API.
  //       Currently these endpoints don't exist on either the local
  //       agent-runtimes server or the ai-agents service.



  const upsertSidebarMessage = useCallback(
    (
      setMessages: React.Dispatch<
        React.SetStateAction<
          Array<{
            id: string;
            role: string;
            content: unknown;
            createdAt?: string;
          }>
        >
      >,
      message: {
        id: string;
        role: string;
        content: unknown;
        createdAt?: string;
      },
    ) => {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === message.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...message };
          return next;
        }
        return [...prev, message];
      });
    },
    [],
  );

  const streamRunMessages = useCallback(
    async (
      targetAgentId: string,
      prompt: string,
      setMessages: React.Dispatch<
        React.SetStateAction<
          Array<{
            id: string;
            role: string;
            content: unknown;
            createdAt?: string;
          }>
        >
      >,
      setError: React.Dispatch<React.SetStateAction<string | null>>,
      options?: { keepAliveForApproval?: boolean },
    ): Promise<{ finalAssistantText: string | null; pendingApproval: boolean }> => {
      const endpoint = `${agentBaseUrl}/api/v1/vercel-ai/${encodeURIComponent(targetAgentId)}`;
      if (options?.keepAliveForApproval && approvalStreamRef.current) {
        approvalStreamRef.current.unsubscribe();
        approvalStreamRef.current.adapter.disconnect();
        approvalStreamRef.current = null;
      }
      const adapter = new VercelAIAdapter({
        protocol: 'vercel-ai',
        baseUrl: endpoint,
        agentId: targetAgentId,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      let latestAssistantText: string | null = null;
      let pendingApproval = false;

      const unsubscribe = adapter.subscribe(event => {
        if (event.type === 'message' && event.message) {
          const msg = event.message;
          const content =
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content);
          if (msg.role === 'assistant') {
            latestAssistantText = content;
          }
          upsertSidebarMessage(setMessages, {
            id: msg.id,
            role: msg.role,
            content,
            createdAt: msg.createdAt?.toISOString(),
          });
          return;
        }

        if (event.type === 'tool-call' && event.toolCall) {
          upsertSidebarMessage(setMessages, {
            id: `tool-call-${event.toolCall.toolCallId}`,
            role: 'tool',
            content: `${event.toolCall.toolName}(${JSON.stringify(event.toolCall.args)})`,
            createdAt: event.timestamp.toISOString(),
          });
          return;
        }

        if (event.type === 'tool-result' && event.toolResult) {
          const resultObj =
            event.toolResult.result &&
            typeof event.toolResult.result === 'object'
              ? (event.toolResult.result as Record<string, unknown>)
              : undefined;
          if (resultObj?.pending_approval === true) {
            pendingApproval = true;
          }
          upsertSidebarMessage(setMessages, {
            id: `tool-result-${event.toolResult.toolCallId}`,
            role: 'tool',
            content: JSON.stringify(event.toolResult.result),
            createdAt: event.timestamp.toISOString(),
          });
        }
      });

      try {
        setError(null);
        await adapter.connect();
        await adapter.sendMessage(createUserMessage(prompt));
        return { finalAssistantText: latestAssistantText, pendingApproval };
      } catch (error) {
        setError(
          error instanceof Error ? error.message : 'Streaming request failed',
        );
        throw error;
      } finally {
        if (options?.keepAliveForApproval && pendingApproval) {
          approvalStreamRef.current = { adapter, unsubscribe };
        } else {
          unsubscribe();
          adapter.disconnect();
        }
      }
    },
    [agentBaseUrl, token, upsertSidebarMessage],
  );

  useEffect(() => {
    return () => {
      if (approvalStreamRef.current) {
        approvalStreamRef.current.unsubscribe();
        approvalStreamRef.current.adapter.disconnect();
        approvalStreamRef.current = null;
      }
    };
  }, []);

  // ── Create approval agent on local server ────────────────────────────────

  useEffect(() => {
    if (!isReady) return;
    let isCancelled = false;

    const createApprovalAgent = async () => {
      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: APPROVAL_AGENT_NAME,
            description: 'Agent with once trigger and tool approval',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: APPROVAL_AGENT_SPEC_ID,
            tools: ['runtime-sensitive-echo'],
          }),
        });

        let resolvedId = APPROVAL_AGENT_NAME;

        if (response.ok) {
          const data = await response.json();
          resolvedId = data?.id || APPROVAL_AGENT_NAME;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';
          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail = data?.detail || data?.message || '';
          } else {
            detail = await response.text();
          }
          if (response.status === 409 || /already exists/i.test(detail || '')) {
            // Already running — reuse
          } else {
            console.warn('Failed to create approval agent:', detail);
            return;
          }
        }

        if (!isCancelled) {
          setApprovalAgentId(resolvedId);
          setApprovalAgentReady(true);
        }
      } catch (error) {
        console.warn('Approval agent creation failed:', error);
      }
    };

    void createApprovalAgent();
    return () => { isCancelled = true; };
  }, [isReady, agentBaseUrl, authFetch]);

  // ── Poll tool approvals ─────────────────────────────────────────────────

  const pollApprovals = useCallback(async () => {
    if (!approvalAgentReady) return;
    try {
      const res = await authFetch(`${agentBaseUrl}/api/v1/tool-approvals`);
      if (!res.ok) return;
      const data = await res.json();
      const all = Array.isArray(data) ? data : (data.approvals ?? data.requests ?? []);
      const pending = all.filter(
        (a: any) => a.status === 'pending' && (!a.agent_id || a.agent_id === approvalAgentId),
      );
      setApprovals(pending);
    } catch {
      // Non-fatal
    }
  }, [approvalAgentReady, agentBaseUrl, approvalAgentId, authFetch]);

  useEffect(() => {
    if (!hasTriggeredApproval) return;
    void pollApprovals();
    const interval = setInterval(pollApprovals, 2000);
    return () => clearInterval(interval);
  }, [hasTriggeredApproval, pollApprovals]);

  // Approval sidebar messages are populated from live Vercel stream events.

  // ── Approve / Reject handlers ───────────────────────────────────────────

  const handleApprove = useCallback(async (requestId: string) => {
    setApprovalLoading(requestId);
    setApprovalError(null);
    try {
      const approval = approvals.find(a => a.id === requestId);
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/tool-approvals/${requestId}/approve`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (!res.ok) {
        throw new Error(`Approve failed (${res.status})`);
      }
      if (approval?.tool_call_id && approvalStreamRef.current) {
        await approvalStreamRef.current.adapter.sendToolResult(
          approval.tool_call_id,
          {
            toolCallId: approval.tool_call_id,
            success: true,
            result: {
              approved: true,
              approvalId: requestId,
              message: 'Approved from trigger panel',
            },
          },
        );
        approvalStreamRef.current.unsubscribe();
        approvalStreamRef.current.adapter.disconnect();
        approvalStreamRef.current = null;
      }
      setApprovals(prev => prev.filter(a => a.id !== requestId));
      void pollApprovals();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Failed to approve');
    } finally {
      setApprovalLoading(null);
    }
  }, [agentBaseUrl, authFetch, pollApprovals, approvals]);

  const handleReject = useCallback(async (requestId: string, note?: string) => {
    setApprovalLoading(requestId);
    setApprovalError(null);
    try {
      const approval = approvals.find(a => a.id === requestId);
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/tool-approvals/${requestId}/reject`,
        { method: 'POST', body: JSON.stringify(note ? { note } : {}) },
      );
      if (!res.ok) {
        throw new Error(`Reject failed (${res.status})`);
      }
      if (approval?.tool_call_id && approvalStreamRef.current) {
        await approvalStreamRef.current.adapter.sendToolResult(
          approval.tool_call_id,
          {
            toolCallId: approval.tool_call_id,
            success: true,
            result: {
              approved: false,
              approvalId: requestId,
              message: note || 'Rejected from trigger panel',
            },
          },
        );
        approvalStreamRef.current.unsubscribe();
        approvalStreamRef.current.adapter.disconnect();
        approvalStreamRef.current = null;
      }
      setApprovals(prev => prev.filter(a => a.id !== requestId));
      void pollApprovals();
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'Failed to reject');
    } finally {
      setApprovalLoading(null);
    }
  }, [agentBaseUrl, authFetch, pollApprovals, approvals]);

  // ── Launch once trigger with approval ────────────────────────────────────

  const handleLaunchOnceApproval = useCallback(async () => {
    if (!agentBaseUrl || !approvalAgentReady) return;
    setIsLaunchingApproval(true);
    setApprovalFlash(null);
    setApprovalSidebarMessages([]);
    setSidebarMessagesError(null);
    setHasTriggeredApproval(true);
    const runId = `once-approval-${Date.now()}`;
    const startTime = new Date().toISOString();
    setTriggerHistory(prev => [
      {
        id: runId,
        timestamp: startTime,
        status: 'running' as const,
        source: 'once' as TriggerTab,
      },
      ...prev,
    ]);
    try {
      setApprovalFlash(
        'Once trigger with approval launched — waiting for tool approval.',
      );
      const streamResult = await streamRunMessages(
        approvalAgentId,
        ONCE_TRIGGER_APPROVAL_PROMPT,
        setApprovalSidebarMessages,
        setSidebarMessagesError,
        { keepAliveForApproval: true },
      );
      if (!streamResult.pendingApproval && approvalStreamRef.current) {
        approvalStreamRef.current.unsubscribe();
        approvalStreamRef.current.adapter.disconnect();
        approvalStreamRef.current = null;
      }
      setTriggerHistory(prev =>
        prev.map(r =>
          r.id === runId
            ? {
                ...r,
                status: 'success' as const,
                duration_ms: Date.now() - new Date(startTime).getTime(),
              }
            : r,
        ),
      );
    } catch {
      setApprovalFlash('Network error');
      setTriggerHistory(prev =>
        prev.map(r => r.id === runId ? { ...r, status: 'failure' as const } : r),
      );
    } finally {
      setIsLaunchingApproval(false);
    }
  }, [
    agentBaseUrl,
    approvalAgentReady,
    approvalAgentId,
    streamRunMessages,
  ]);

  // ── Pending approvals for banner/dialog ──────────────────────────────────

  const pendingApprovals: PendingApproval[] = approvals.map(req => ({
    id: req.id,
    toolName: req.tool_name,
    toolDescription: req.note,
    args: req.tool_args ?? {},
    agentId: approvalAgentId,
    requestedAt: req.created_at ?? new Date().toISOString(),
  }));

  // ── Update cron ──────────────────────────────────────────────────────────

  const handleUpdateCron = useCallback(async () => {
    if (!agentBaseUrl || !editCron.trim()) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger`,
        {
          method: 'PUT',
          body: JSON.stringify({ cron: editCron.trim() }),
        },
      );
      if (res.ok) {
        const d = await res.json();
        setCronExpr(d.cron ?? editCron.trim());
        if (d.next_run) setNextRun(d.next_run);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, editCron, authFetch]);

  // ── Manual trigger ───────────────────────────────────────────────────────

  const handleTriggerNow = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsTriggeringNow(true);
    setTriggerFlash(null);
    const runId = `manual-${Date.now()}`;
    const startTime = new Date().toISOString();
    setTriggerHistory(prev => [
      {
        id: runId,
        timestamp: startTime,
        status: 'running' as const,
        source: 'manual' as TriggerTab,
      },
      ...prev,
    ]);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/run`,
        { method: 'POST', body: JSON.stringify({ source: 'manual' }) },
      );
      if (res.ok) {
        setTriggerFlash('Trigger fired successfully');
        setTriggerHistory(prev =>
          prev.map(r =>
            r.id === runId
              ? {
                  ...r,
                  status: 'success' as const,
                  duration_ms: Date.now() - new Date(startTime).getTime(),
                }
              : r,
          ),
        );
      } else {
        setTriggerFlash(`Trigger failed (${res.status})`);
        setTriggerHistory(prev =>
          prev.map(r =>
            r.id === runId ? { ...r, status: 'failure' as const } : r,
          ),
        );
      }
    } catch {
      setTriggerFlash('Network error');
      setTriggerHistory(prev =>
        prev.map(r =>
          r.id === runId ? { ...r, status: 'failure' as const } : r,
        ),
      );
    } finally {
      setIsTriggeringNow(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

  // ── Webhook management ─────────────────────────────────────────────────

  const handleGenerateWebhook = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/webhook`,
        { method: 'POST' },
      );
      if (res.ok) {
        const d = await res.json();
        setWebhookUrl(d.url ?? null);
        setWebhookSecret(d.secret ?? null);
        setWebhookEnabled(true);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, authFetch]);

  const handleToggleWebhook = useCallback(async () => {
    if (!agentBaseUrl) return;
    try {
      await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/webhook`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !webhookEnabled }),
        },
      );
      setWebhookEnabled(prev => !prev);
    } catch {
      /* ok */
    }
  }, [agentBaseUrl, agentId, webhookEnabled, authFetch]);

  // ── Event subscription ─────────────────────────────────────────────────

  const handleSubscribeEvent = useCallback(async () => {
    if (!agentBaseUrl || !eventTopic.trim()) return;
    setIsUpdating(true);
    try {
      const res = await authFetch(
        `${agentBaseUrl}/api/v1/agents/${agentId}/trigger/event`,
        {
          method: 'POST',
          body: JSON.stringify({
            topic: eventTopic.trim(),
            filter: eventFilter.trim() || undefined,
          }),
        },
      );
      if (res.ok) {
        setEventSubscribed(true);
      }
    } catch {
      /* ok */
    } finally {
      setIsUpdating(false);
    }
  }, [agentBaseUrl, agentId, eventTopic, eventFilter, authFetch]);

  // ── Launch once trigger ──────────────────────────────────────────────────

  const handleLaunchOnce = useCallback(async () => {
    if (!agentBaseUrl) return;
    setIsLaunchingOnce(true);
    setOnceFlash(null);
    setStreamedOnceOutput(null);
    setStreamedOnceEndedAt(null);
    setSidebarMessages([]);
    setSidebarMessagesError(null);
    const runId = `once-${Date.now()}`;
    const startTime = new Date().toISOString();
    setLastOnceStartedAt(startTime);
    setHasTriggeredOnce(true);
    setTriggerHistory(prev => [
      {
        id: runId,
        timestamp: startTime,
        status: 'running' as const,
        source: 'once' as TriggerTab,
      },
      ...prev,
    ]);
    try {
      setOnceFlash('Once trigger launched — streaming live output.');
      const streamResult = await streamRunMessages(
        agentId,
        ONCE_TRIGGER_PROMPT,
        setSidebarMessages,
        setSidebarMessagesError,
      );
      setStreamedOnceOutput(streamResult.finalAssistantText);
      setStreamedOnceEndedAt(new Date().toISOString());
      setTriggerHistory(prev =>
        prev.map(r =>
          r.id === runId
            ? {
                ...r,
                status: 'success' as const,
                duration_ms: Date.now() - new Date(startTime).getTime(),
              }
            : r,
        ),
      );
    } catch {
      setOnceFlash('Network error');
      setTriggerHistory(prev =>
        prev.map(r =>
          r.id === runId ? { ...r, status: 'failure' as const } : r,
        ),
      );
    } finally {
      setIsLaunchingOnce(false);
    }
  }, [agentBaseUrl, agentId, streamRunMessages]);

  // ── Loading / Error ──────────────────────────────────────────────────────

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
            ? 'Launching runtime for trigger agent…'
            : 'Creating trigger demo agent…'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const triggerRunCurl = `curl -N -X POST '${agentBaseUrl}/api/v1/vercel-ai/${agentId}' -H 'Content-Type: application/json' -H 'Accept: text/event-stream'${token ? " -H 'Authorization: Bearer <TOKEN>'" : ''} --data '{"messages":[{"role":"user","parts":[{"type":"text","text":"${ONCE_TRIGGER_PROMPT.replace(/"/g, '\\"')}"}]}],"trigger":"submit-message","sdkVersion":6}'`;

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
        <ClockIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Triggers — {agentId}
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

      {/* Tool Approval Banner */}
      <ToolApprovalBanner
        pendingApprovals={pendingApprovals}
        onReview={approval => {
          const req = approvals.find(a => a.id === approval.id) || null;
          setActiveApproval(req);
        }}
        onApproveAll={async () => {
          for (const a of approvals) {
            await handleApprove(a.id);
          }
        }}
      />

      {/* Tool Approval Dialog */}
      <ToolApprovalDialog
        isOpen={!!activeApproval}
        toolName={activeApproval?.tool_name ?? ''}
        toolDescription={activeApproval?.note}
        args={activeApproval?.tool_args ?? {}}
        onApprove={async () => {
          if (activeApproval) {
            await handleApprove(activeApproval.id);
            setActiveApproval(null);
          }
        }}
        onDeny={async () => {
          if (activeApproval) {
            await handleReject(activeApproval.id, 'Rejected from dialog');
            setActiveApproval(null);
          }
        }}
        onClose={() => setActiveApproval(null)}
      />

      {approvalError && (
        <Box sx={{ px: 3, py: 1 }}>
          <Text sx={{ color: 'danger.fg', fontSize: 0 }}>{approvalError}</Text>
        </Box>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Trigger Agent"
            description={`View-only trigger output. Cron: ${cronExpr} | Webhook: ${webhookEnabled ? 'on' : 'off'} | Event: ${eventSubscribed ? eventTopic : 'none'}`}
            showHeader={true}
            autoFocus={false}
            height="100%"
            runtimeId={agentId}
            showInput={false}
            showModelSelector={false}
            showToolsMenu={false}
            showSkillsMenu={false}
          />
        </Box>

        {/* Right: Trigger panel */}
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
          {/* Trigger type tabs */}
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
                { key: 'once' as TriggerTab, icon: ZapIcon, label: 'Once' },
                { key: 'cron' as TriggerTab, icon: ClockIcon, label: 'Cron' },
                {
                  key: 'webhook' as TriggerTab,
                  icon: GlobeIcon,
                  label: 'Webhook',
                },
                { key: 'event' as TriggerTab, icon: ZapIcon, label: 'Event' },
                {
                  key: 'manual' as TriggerTab,
                  icon: PlayIcon,
                  label: 'Manual',
                },
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

          {/* ── Once tab ──────────────────────────────────────────────── */}
          {activeTab === 'once' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ZapIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Once Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Launch a single streaming run for the once-trigger prompt and
                watch tool calls, tool results, and assistant text update in
                real time.
              </Text>

              <Box
                sx={{
                  bg: 'canvas.subtle',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                  display: 'grid',
                  gap: 1,
                }}
              >
                <Text sx={{ fontSize: 0 }}>
                  <strong>Agent ID:</strong> {agentId}
                </Text>
                <Text sx={{ fontSize: 0 }}>
                  <strong>Base URL:</strong> {agentBaseUrl}
                </Text>
                {lastOnceStartedAt && (
                  <Text sx={{ fontSize: 0 }}>
                    <strong>Last once launch:</strong>{' '}
                    {new Date(lastOnceStartedAt).toLocaleString()}
                  </Text>
                )}
              </Box>

              <Button
                size="small"
                variant="primary"
                leadingVisual={ZapIcon}
                onClick={handleLaunchOnce}
                disabled={isLaunchingOnce}
                sx={{ width: '100%' }}
              >
                {isLaunchingOnce ? 'Launching…' : 'Launch Once'}
              </Button>

              <Button
                size="small"
                variant="danger"
                leadingVisual={ZapIcon}
                onClick={handleLaunchOnceApproval}
                disabled={isLaunchingApproval || !approvalAgentReady}
                sx={{ width: '100%', mt: 2 }}
              >
                {isLaunchingApproval ? 'Launching…' : 'Launch Once with Approval'}
              </Button>

              {onceFlash && (
                <Flash
                  variant={
                    onceFlash.includes('launched') ? 'success' : 'danger'
                  }
                  sx={{ mt: 2, fontSize: 0 }}
                >
                  {onceFlash}
                </Flash>
              )}

              {approvalFlash && (
                <Flash
                  variant={
                    approvalFlash.includes('launched') ? 'success' : 'danger'
                  }
                  sx={{ mt: 2, fontSize: 0 }}
                >
                  {approvalFlash}
                </Flash>
              )}

              {/* ── Generated Output ───────────────────────────────── */}
              {hasTriggeredOnce && (
              <>
              <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
                Generated Output
              </Heading>

              {(() => {
                const outputEvent = lastOnceStartedAt
                  ? [...agentEvents]
                      .filter(
                        e =>
                          e.kind === 'agent-output' &&
                          new Date(e.created_at).getTime() >=
                            new Date(lastOnceStartedAt).getTime() - 5000,
                      )
                      .sort(
                        (a, b) =>
                          new Date(b.created_at).getTime() -
                          new Date(a.created_at).getTime(),
                      )[0]
                  : undefined;

                const hasStreamFallback =
                  !outputEvent && !isLaunchingOnce && streamedOnceOutput !== null;

                if (!outputEvent && !hasStreamFallback) {
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Spinner size="small" />
                      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                        Waiting for agent output…
                      </Text>
                    </Box>
                  );
                }

                const p = outputEvent?.payload as Record<string, any> | undefined;
                const outputText = outputEvent
                  ? (p?.outputs ? String(p.outputs) : '')
                  : (streamedOnceOutput ?? '');
                const exitStatus = outputEvent ? p?.exit_status : 'completed';
                const durationMs = outputEvent
                  ? p?.duration_ms
                  : (lastOnceStartedAt && streamedOnceEndedAt
                    ? new Date(streamedOnceEndedAt).getTime() -
                      new Date(lastOnceStartedAt).getTime()
                    : undefined);
                const endedAt = outputEvent ? p?.ended_at : streamedOnceEndedAt;

                return (
                  <Box
                    sx={{
                      mb: 2,
                      border: '1px solid',
                      borderColor:
                        exitStatus === 'error'
                          ? 'danger.muted'
                          : 'success.muted',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header bar */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        bg:
                          exitStatus === 'error'
                            ? 'danger.subtle'
                            : 'success.subtle',
                        borderBottom: '1px solid',
                        borderColor:
                          exitStatus === 'error'
                            ? 'danger.muted'
                            : 'success.muted',
                      }}
                    >
                      <Label
                        variant={
                          exitStatus === 'error' ? 'danger' : 'success'
                        }
                        size="small"
                      >
                        {exitStatus ?? 'completed'}
                      </Label>
                      {durationMs != null && (
                        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                          {(Number(durationMs) / 1000).toFixed(1)}s
                        </Text>
                      )}
                      {endedAt && (
                        <Text
                          sx={{
                            fontSize: 0,
                            color: 'fg.muted',
                            ml: 'auto',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {new Date(endedAt).toLocaleString()}
                        </Text>
                      )}
                      <Button
                        size="small"
                        variant="invisible"
                        sx={{ p: 1 }}
                        onClick={() =>
                          navigator.clipboard.writeText(outputText)
                        }
                      >
                        <CopyIcon size={12} />
                      </Button>
                    </Box>
                    {/* Output body */}
                    <Box
                      sx={{
                        p: 2,
                        bg: 'canvas.default',
                        maxHeight: 300,
                        overflow: 'auto',
                      }}
                    >
                      <Text
                        sx={{
                          fontSize: 0,
                          color: 'fg.default',
                          display: 'block',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'mono',
                        }}
                      >
                        {outputText || '(empty output)'}
                      </Text>
                    </Box>
                  </Box>
                );
              })()}
              </>
              )}

              {/* ── Streaming Messages ─────────────────────────────────── */}
              {hasTriggeredOnce && (
              <>
              <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
                Streaming Messages
                {isLaunchingOnce && (
                  <Spinner
                    size="small"
                    sx={{
                      ml: 2,
                      verticalAlign: 'middle',
                      width: 14,
                      height: 14,
                      minWidth: 14,
                      minHeight: 14,
                    }}
                  />
                )}
              </Heading>

              {sidebarMessagesError ? (
                <Flash variant="danger" sx={{ fontSize: 0, mb: 2 }}>
                  {sidebarMessagesError}
                </Flash>
              ) : sidebarMessages.filter(msg => msg.role !== 'user').length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Spinner
                    size="small"
                    sx={{ width: 16, height: 16, minWidth: 16, minHeight: 16 }}
                  />
                  <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                    Waiting for streaming messages…
                  </Text>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  {sidebarMessages
                    .slice()
                    .filter(msg => msg.role !== 'user')
                    .sort((a, b) => {
                      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return tb - ta;
                    })
                    .slice(0, 10)
                    .map(msg => {
                      const content = typeof msg.content === 'string'
                        ? msg.content
                        : JSON.stringify(msg.content);
                      return (
                        <Box
                          key={`once-msg-${msg.id}`}
                          sx={{
                            p: 2,
                            bg: 'canvas.subtle',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'border.default',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 1,
                            }}
                          >
                            <Label
                              size="small"
                              variant={
                                msg.role === 'assistant'
                                  ? 'accent'
                                  : msg.role === 'tool'
                                    ? 'success'
                                    : 'secondary'
                              }
                            >
                              {msg.role}
                            </Label>
                            {msg.createdAt && (
                              <Text
                                sx={{
                                  fontSize: 0,
                                  color: 'fg.muted',
                                  marginLeft: 'auto',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {new Date(msg.createdAt).toLocaleTimeString()}
                              </Text>
                            )}
                          </Box>
                          <Text
                            sx={{
                              fontSize: 0,
                              color: 'fg.default',
                              display: 'block',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {content.length > 320
                              ? `${content.slice(0, 320)}…`
                              : content}
                          </Text>
                        </Box>
                      );
                    })}
                </Box>
              )}
              </>
              )}

              {/* ── Approval Pending Queue ──────────────────────────────── */}
              {hasTriggeredApproval && approvals.length > 0 && (
              <>
              <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
                Pending Tool Approvals
              </Heading>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                {approvals.map(a => (
                  <Box
                    key={a.id}
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'attention.muted',
                      borderRadius: 2,
                      bg: 'attention.subtle',
                    }}
                  >
                    <Text sx={{ fontWeight: 600, fontSize: 1, display: 'block', mb: 1 }}>
                      🛡️ {a.tool_name}
                    </Text>
                    {a.tool_args && (
                      <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block', mb: 2, fontFamily: 'mono' }}>
                        {JSON.stringify(a.tool_args)}
                      </Text>
                    )}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="primary"
                        onClick={() => void handleApprove(a.id)}
                        disabled={approvalLoading === a.id}
                      >
                        {approvalLoading === a.id ? 'Approving…' : 'Approve'}
                      </Button>
                      <Button
                        size="small"
                        variant="danger"
                        onClick={() => void handleReject(a.id, 'Rejected from trigger panel')}
                        disabled={approvalLoading === a.id}
                      >
                        Reject
                      </Button>
                    </Box>
                  </Box>
                ))}
              </Box>
              </>
              )}

              {/* ── Approval Streaming Messages ─────────────────────────── */}
              {hasTriggeredApproval && (
              <>
              <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
                Approval Agent Messages
                {isLaunchingApproval && (
                  <Spinner
                    size="small"
                    sx={{
                      ml: 2,
                      verticalAlign: 'middle',
                      width: 14,
                      height: 14,
                      minWidth: 14,
                      minHeight: 14,
                    }}
                  />
                )}
              </Heading>

              {/* ── Approval Generated Output ───────────────────────── */}
              {hasTriggeredApproval && (
              <>
              <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
                Generated Output
              </Heading>

              {(() => {
                const latestAssistantOutput = approvalSidebarMessages
                  .filter(msg => msg.role === 'assistant')
                  .sort((a, b) => {
                    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return tb - ta;
                  })[0];

                if (!latestAssistantOutput) {
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Spinner
                        size="small"
                        sx={{ width: 16, height: 16, minWidth: 16, minHeight: 16 }}
                      />
                      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                        Waiting for agent output…
                      </Text>
                    </Box>
                  );
                }

                const outputText =
                  typeof latestAssistantOutput.content === 'string'
                    ? latestAssistantOutput.content
                    : JSON.stringify(latestAssistantOutput.content);

                return (
                  <Box
                    sx={{
                      mb: 2,
                      border: '1px solid',
                      borderColor: 'success.muted',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        px: 2,
                        py: 1,
                        bg: 'success.subtle',
                        borderBottom: '1px solid',
                        borderColor: 'success.muted',
                      }}
                    >
                      <Label variant="success" size="small">
                        completed
                      </Label>
                      {latestAssistantOutput.createdAt && (
                        <Text
                          sx={{
                            fontSize: 0,
                            color: 'fg.muted',
                            ml: 'auto',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {new Date(latestAssistantOutput.createdAt).toLocaleString()}
                        </Text>
                      )}
                      <Button
                        size="small"
                        variant="invisible"
                        sx={{ p: 1 }}
                        onClick={() => navigator.clipboard.writeText(outputText)}
                      >
                        <CopyIcon size={12} />
                      </Button>
                    </Box>
                    <Box
                      sx={{
                        p: 2,
                        bg: 'canvas.default',
                        maxHeight: 300,
                        overflow: 'auto',
                      }}
                    >
                      <Text
                        sx={{
                          fontSize: 0,
                          color: 'fg.default',
                          display: 'block',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'mono',
                        }}
                      >
                        {outputText || '(empty output)'}
                      </Text>
                    </Box>
                  </Box>
                );
              })()}
              </>
              )}

              {approvalSidebarMessages.filter(msg => msg.role !== 'user').length === 0 ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Spinner
                    size="small"
                    sx={{ width: 16, height: 16, minWidth: 16, minHeight: 16 }}
                  />
                  <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                    Waiting for approval agent messages…
                  </Text>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  {approvalSidebarMessages
                    .slice()
                    .filter(msg => msg.role !== 'user')
                    .sort((a, b) => {
                      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return tb - ta;
                    })
                    .slice(0, 10)
                    .map(msg => {
                      const content = typeof msg.content === 'string'
                        ? msg.content
                        : JSON.stringify(msg.content);
                      return (
                        <Box
                          key={`approval-msg-${msg.id}`}
                          sx={{
                            p: 2,
                            bg: 'canvas.subtle',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'border.default',
                          }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 1,
                            }}
                          >
                            <Label
                              size="small"
                              variant={
                                msg.role === 'assistant'
                                  ? 'accent'
                                  : msg.role === 'tool'
                                    ? 'success'
                                    : 'secondary'
                              }
                            >
                              {msg.role}
                            </Label>
                            {msg.createdAt && (
                              <Text
                                sx={{
                                  fontSize: 0,
                                  color: 'fg.muted',
                                  marginLeft: 'auto',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {new Date(msg.createdAt).toLocaleTimeString()}
                              </Text>
                            )}
                          </Box>
                          <Text
                            sx={{
                              fontSize: 0,
                              color: 'fg.default',
                              display: 'block',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {content.length > 320
                              ? `${content.slice(0, 320)}…`
                              : content}
                          </Text>
                        </Box>
                      );
                    })}
                </Box>
              )}
              </>
              )}

              <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
                <Box>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    Stream once (local curl)
                  </Text>
                  <Box
                    sx={{
                      mt: 1,
                      bg: 'canvas.subtle',
                      borderRadius: 2,
                      p: 2,
                      fontFamily: 'mono',
                      fontSize: 0,
                      wordBreak: 'break-all',
                    }}
                  >
                    {triggerRunCurl}
                  </Box>
                </Box>
                <Button
                  size="small"
                  leadingVisual={CopyIcon}
                  onClick={() => navigator.clipboard.writeText(triggerRunCurl)}
                >
                  Copy streaming command
                </Button>
              </Box>
            </Box>
          )}

          {/* ── Cron tab ─────────────────────────────────────────────── */}
          {activeTab === 'cron' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ClockIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Cron Schedule
                </Heading>
              </Box>

              <Label variant="primary" sx={{ mb: 2, display: 'inline-block' }}>
                Current: {cronExpr}
              </Label>

              {nextRun && (
                <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                  Next run: {new Date(nextRun).toLocaleString()}
                </Text>
              )}

              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextInput
                  value={editCron}
                  onChange={e => setEditCron(e.target.value)}
                  placeholder="* * * * *"
                  sx={{ flex: 1 }}
                  size="small"
                />
                <Button
                  size="small"
                  variant="primary"
                  leadingVisual={SyncIcon}
                  onClick={handleUpdateCron}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Saving…' : 'Update'}
                </Button>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted' }}>
                Standard cron syntax: minute hour day month weekday
              </Text>
            </Box>
          )}

          {/* ── Webhook tab ──────────────────────────────────────────── */}
          {activeTab === 'webhook' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <GlobeIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Webhook Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Generate a unique URL that triggers this agent on incoming HTTP
                POST requests. Useful for CI/CD pipelines, external services, or
                custom integrations.
              </Text>

              {webhookUrl ? (
                <>
                  <Label
                    variant={webhookEnabled ? 'success' : 'secondary'}
                    sx={{ mb: 2, display: 'inline-block' }}
                  >
                    {webhookEnabled ? 'Active' : 'Disabled'}
                  </Label>

                  <Box
                    sx={{
                      bg: 'canvas.subtle',
                      p: 2,
                      borderRadius: 2,
                      mb: 2,
                      fontFamily: 'mono',
                      fontSize: 0,
                      wordBreak: 'break-all',
                    }}
                  >
                    {webhookUrl}
                  </Box>

                  {webhookSecret && (
                    <Box sx={{ mb: 2 }}>
                      <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                        Secret:
                      </Text>
                      <Box
                        sx={{
                          bg: 'canvas.subtle',
                          p: 2,
                          borderRadius: 2,
                          mt: 1,
                          fontFamily: 'mono',
                          fontSize: 0,
                        }}
                      >
                        {webhookSecret}
                      </Box>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      size="small"
                      leadingVisual={CopyIcon}
                      onClick={() => navigator.clipboard.writeText(webhookUrl)}
                    >
                      Copy URL
                    </Button>
                    <Button
                      size="small"
                      variant={webhookEnabled ? 'danger' : 'primary'}
                      onClick={handleToggleWebhook}
                    >
                      {webhookEnabled ? 'Disable' : 'Enable'}
                    </Button>
                  </Box>
                </>
              ) : (
                <Button
                  size="small"
                  variant="primary"
                  leadingVisual={GlobeIcon}
                  onClick={handleGenerateWebhook}
                  disabled={isUpdating}
                  sx={{ width: '100%' }}
                >
                  {isUpdating ? 'Generating…' : 'Generate Webhook URL'}
                </Button>
              )}
            </Box>
          )}

          {/* ── Event tab ────────────────────────────────────────────── */}
          {activeTab === 'event' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <ZapIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Event Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Subscribe to a Kafka topic or internal event stream. The agent
                triggers on matching messages.
              </Text>

              {eventSubscribed ? (
                <>
                  <Label
                    variant="success"
                    sx={{ mb: 2, display: 'inline-block' }}
                  >
                    Subscribed to: {eventTopic}
                  </Label>
                  {eventFilter && (
                    <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 2 }}>
                      Filter: {eventFilter}
                    </Text>
                  )}
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => setEventSubscribed(false)}
                    sx={{ width: '100%' }}
                  >
                    Unsubscribe
                  </Button>
                </>
              ) : (
                <>
                  <TextInput
                    value={eventTopic}
                    onChange={e => setEventTopic(e.target.value)}
                    placeholder="e.g. kpi.daily-report"
                    sx={{ width: '100%', mb: 2 }}
                    size="small"
                  />
                  <TextInput
                    value={eventFilter}
                    onChange={e => setEventFilter(e.target.value)}
                    placeholder="Optional JSONPath filter"
                    sx={{ width: '100%', mb: 2 }}
                    size="small"
                  />
                  <Button
                    size="small"
                    variant="primary"
                    leadingVisual={ZapIcon}
                    onClick={handleSubscribeEvent}
                    disabled={isUpdating || !eventTopic.trim()}
                    sx={{ width: '100%' }}
                  >
                    {isUpdating ? 'Subscribing…' : 'Subscribe'}
                  </Button>
                </>
              )}
            </Box>
          )}

          {/* ── Manual tab ───────────────────────────────────────────── */}
          {activeTab === 'manual' && (
            <Box
              sx={{
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}
              >
                <PlayIcon size={16} />
                <Heading as="h3" sx={{ fontSize: 2 }}>
                  Manual Trigger
                </Heading>
              </Box>

              <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
                Fire the agent immediately. This is equivalent to the cron job
                executing but bypasses the schedule.
              </Text>

              <Button
                size="small"
                leadingVisual={PlayIcon}
                onClick={handleTriggerNow}
                disabled={isTriggeringNow}
                sx={{ width: '100%' }}
              >
                {isTriggeringNow ? 'Triggering…' : 'Trigger Now'}
              </Button>

              {triggerFlash && (
                <Flash
                  variant={
                    triggerFlash.includes('success') ? 'success' : 'danger'
                  }
                  sx={{ mt: 2, fontSize: 0 }}
                >
                  {triggerFlash}
                </Flash>
              )}
            </Box>
          )}

          {/* Trigger history */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              Trigger History
            </Heading>

            {triggerHistory.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No trigger runs recorded yet.
              </Text>
            ) : (
              <Timeline>
                {triggerHistory.slice(0, 20).map(rec => (
                  <Timeline.Item key={rec.id}>
                    <Timeline.Badge>
                      {rec.status === 'success' ? (
                        <CheckCircleIcon />
                      ) : rec.status === 'failure' ? (
                        <XCircleIcon />
                      ) : (
                        <Spinner size="small" />
                      )}
                    </Timeline.Badge>
                    <Timeline.Body>
                      <Text sx={{ fontSize: 0 }}>
                        {new Date(rec.timestamp).toLocaleString()}
                        {' — '}
                        <Label
                          variant={
                            rec.status === 'success'
                              ? 'success'
                              : rec.status === 'failure'
                                ? 'danger'
                                : 'accent'
                          }
                          size="small"
                        >
                          {rec.status}
                        </Label>
                        {rec.duration_ms != null && (
                          <Text sx={{ ml: 1, color: 'fg.muted' }}>
                            ({(rec.duration_ms / 1000).toFixed(1)}s)
                          </Text>
                        )}
                      </Text>
                    </Timeline.Body>
                  </Timeline.Item>
                ))}
              </Timeline>
            )}

            {/* Agent Events */}
            <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 2 }}>
              Agent Events
            </Heading>

            {agentEvents.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No agent events yet.
              </Text>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[...agentEvents]
                  .sort(
                    (a, b) =>
                      new Date(b.created_at).getTime() -
                      new Date(a.created_at).getTime(),
                  )
                  .map((evt: AgentEvent) => (
                    <Box
                      key={evt.id}
                      sx={{
                        p: 2,
                        bg: evt.read ? 'canvas.subtle' : 'accent.subtle',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: evt.read
                          ? 'border.default'
                          : 'accent.muted',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          mb: 1,
                        }}
                      >
                        <Label
                          variant={
                            evt.kind === 'agent-started'
                              ? 'accent'
                              : evt.kind === 'agent-output'
                                ? 'success'
                                : evt.kind?.includes('alert')
                                  ? 'danger'
                                  : 'attention'
                          }
                          size="small"
                        >
                          {evt.kind}
                        </Label>
                        <Text sx={{ flex: 1, fontSize: 0, fontWeight: 'bold' }}>
                          {evt.title}
                        </Text>
                        <Text
                          sx={{
                            fontSize: 0,
                            color: 'fg.muted',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {new Date(evt.created_at).toLocaleString()}
                        </Text>
                        <Button
                          size="small"
                          variant="invisible"
                          onClick={() => {
                            const payload = {
                              eventId: String(evt.id),
                              eventAgentId: String(
                                evt.agent_id || agentId || '',
                              ),
                            };
                            if (evt.read) {
                              markUnreadMutation.mutate(payload);
                            } else {
                              markReadMutation.mutate(payload);
                            }
                          }}
                          sx={{ p: 1 }}
                        >
                          {evt.read ? (
                            <EyeClosedIcon size={12} />
                          ) : (
                            <EyeIcon size={12} />
                          )}
                        </Button>
                        <Button
                          size="small"
                          variant="invisible"
                          onClick={() => deleteEventMutation.mutate(evt.id)}
                          sx={{ p: 1, color: 'danger.fg' }}
                        >
                          <TrashIcon size={12} />
                        </Button>
                      </Box>
                      {/* Event-type-specific fields */}
                      {evt.payload &&
                        (() => {
                          const p = evt.payload as Record<string, any>;
                          return (
                            <Box sx={{ fontSize: 0, color: 'fg.muted' }}>
                              {evt.kind === 'agent-output' && p.outputs && (
                                <Tooltip text={String(p.outputs)} direction="n">
                                  <button
                                    type="button"
                                    aria-label={String(p.outputs)}
                                    style={{
                                      all: 'unset',
                                      display: 'block',
                                      width: '100%',
                                      cursor: 'default',
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        mb: 1,
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        gap: 1,
                                        minWidth: 0,
                                      }}
                                    >
                                      <Text
                                        as="span"
                                        sx={{
                                          fontWeight: 'bold',
                                          color: 'fg.default',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        Output:
                                      </Text>
                                      <Truncate
                                        title={String(p.outputs)}
                                        maxWidth="100%"
                                        sx={{ minWidth: 0, flex: 1 }}
                                      >
                                        {String(p.outputs)}
                                      </Truncate>
                                    </Box>
                                  </button>
                                </Tooltip>
                              )}
                              {evt.kind === 'agent-output' &&
                                p.duration_ms != null && (
                                  <Text as="p">
                                    Duration:{' '}
                                    {(Number(p.duration_ms) / 1000).toFixed(1)}s
                                  </Text>
                                )}
                              {evt.kind?.includes('guardrail') && p.message && (
                                <Text as="p">{String(p.message)}</Text>
                              )}
                            </Box>
                          );
                        })()}
                    </Box>
                  ))}
              </Box>
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

const AgentTriggersExample: React.FC = () => {
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
          title="Agent Triggers"
          description="Sign in to configure cron, webhook, event, and manual triggers."
          leadingIcon={<ClockIcon size={24} />}
        />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentTriggerInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentTriggersExample;


