/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent tool approval hooks (WebSocket-only).
 *
 * All tool-approval interactions flow over the AI Agents websocket stream.
 * There are no REST endpoints — the server publishes approval snapshots and
 * `tool_approval_*` events, and the client sends `tool_approval_decision`
 * messages to approve/reject pending requests.
 *
 * Consumers use the familiar React Query-style API below. Internally the
 * hooks:
 *   - subscribe to the shared AI Agents WS once per component tree
 *   - seed/update the `['tool-approvals', filters]` query cache from events
 *   - send decision messages over the same socket for mutations
 *
 * @module hooks/useToolApprovals
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { ToolApprovalFilters } from '../types/tool-approvals';
import { useAIAgentsWebSocket } from './useAIAgentsWebSocket';

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Normalised approval record. Both snake_case (server-native) and
 * camelCase (TypeScript-idiomatic) keys are present so existing UI
 * consumers keep working regardless of which naming they read.
 */
export type ApprovalRecord = {
  id: string;
  agent_id: string;
  agentId: string;
  pod_name: string;
  podName: string;
  tool_name: string;
  toolName: string;
  tool_call_id?: string;
  toolCallId?: string;
  tool_args: Record<string, unknown>;
  toolArgs: Record<string, unknown>;
  status: string;
  note?: string | null;
  created_at: string;
  createdAt: string;
  updated_at?: string;
  updatedAt?: string;
  read?: boolean;
};

interface ApprovalsQueryData {
  approvals: ApprovalRecord[];
  total: number;
}

interface MutationResult {
  isPending: boolean;
  mutate: (vars: { id: string; note?: string }) => void;
  mutateAsync: (vars: { id: string; note?: string }) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const APPROVALS_ROOT_KEY = ['tool-approvals'] as const;

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeApproval(raw: unknown): ApprovalRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id : undefined;
  if (!id) return null;

  const agent = str(rec.agent_id ?? rec.agentId);
  const pod = str(rec.pod_name ?? rec.podName);
  const tool = str(rec.tool_name ?? rec.toolName ?? 'unknown');
  const toolCall = rec.tool_call_id ?? rec.toolCallId;
  const args =
    (rec.tool_args as Record<string, unknown> | undefined) ??
    (rec.toolArgs as Record<string, unknown> | undefined) ??
    {};
  const created = str(rec.created_at ?? rec.createdAt);
  const updated = str(rec.updated_at ?? rec.updatedAt);

  return {
    id,
    agent_id: agent,
    agentId: agent,
    pod_name: pod,
    podName: pod,
    tool_name: tool,
    toolName: tool,
    tool_call_id: typeof toolCall === 'string' ? toolCall : undefined,
    toolCallId: typeof toolCall === 'string' ? toolCall : undefined,
    tool_args: args,
    toolArgs: args,
    status: str(rec.status ?? 'pending'),
    note:
      typeof rec.note === 'string'
        ? rec.note
        : rec.note === null
          ? null
          : undefined,
    created_at: created,
    createdAt: created,
    updated_at: updated || undefined,
    updatedAt: updated || undefined,
    read: typeof rec.read === 'boolean' ? rec.read : undefined,
  };
}

function matchesFilter(
  a: ApprovalRecord,
  filters?: ToolApprovalFilters,
): boolean {
  if (!filters) return true;
  if (filters.agentId && a.agent_id !== filters.agentId) return false;
  if (filters.status && a.status !== filters.status) return false;
  if (filters.toolName && a.tool_name !== filters.toolName) return false;
  return true;
}

function upsertApproval(
  list: ApprovalRecord[],
  approval: ApprovalRecord,
): ApprovalRecord[] {
  const idx = list.findIndex(item => item.id === approval.id);
  if (idx === -1) return [approval, ...list];
  const copy = list.slice();
  copy[idx] = { ...copy[idx], ...approval };
  return copy;
}

function removeApproval(list: ApprovalRecord[], id: string): ApprovalRecord[] {
  return list.filter(item => item.id !== id);
}

function writeSnapshot(
  queryClient: QueryClient,
  approvals: ApprovalRecord[],
): void {
  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: APPROVALS_ROOT_KEY });
  for (const q of queries) {
    const [, second] = q.queryKey as readonly unknown[];
    if (second === 'pending-count') {
      queryClient.setQueryData<{ count: number }>(q.queryKey, {
        count: approvals.filter(a => a.status === 'pending').length,
      });
      continue;
    }
    const filters = (second ?? undefined) as ToolApprovalFilters | undefined;
    const filtered = approvals.filter(a => matchesFilter(a, filters));
    queryClient.setQueryData<ApprovalsQueryData>(q.queryKey, {
      approvals: filtered,
      total: filtered.length,
    });
  }
  // Ensure there's always a root cache entry so downstream consumers can
  // compute derived values (like pending-count refetches) even when no
  // filter query has been mounted yet.
  queryClient.setQueryData<ApprovalsQueryData>(APPROVALS_ROOT_KEY, {
    approvals,
    total: approvals.length,
  });
}

function patchApproval(
  queryClient: QueryClient,
  approval: ApprovalRecord,
  mode: 'upsert' | 'remove',
): void {
  const queries = queryClient
    .getQueryCache()
    .findAll({ queryKey: APPROVALS_ROOT_KEY });
  for (const q of queries) {
    const [, second] = q.queryKey as readonly unknown[];
    if (second === 'pending-count') {
      // Recompute from the root cache after we finish patching below.
      continue;
    }
    const filters = (second ?? undefined) as ToolApprovalFilters | undefined;
    const current =
      queryClient.getQueryData<ApprovalsQueryData>(q.queryKey)?.approvals ?? [];
    let next: ApprovalRecord[];
    if (mode === 'remove') {
      next = removeApproval(current, approval.id);
    } else {
      next = matchesFilter(approval, filters)
        ? upsertApproval(current, approval)
        : removeApproval(current, approval.id);
    }
    queryClient.setQueryData<ApprovalsQueryData>(q.queryKey, {
      approvals: next,
      total: next.length,
    });
  }

  // Recompute pending-count from the unfiltered root cache.
  const root =
    queryClient.getQueryData<ApprovalsQueryData>(APPROVALS_ROOT_KEY)?.approvals;
  if (root) {
    queryClient.setQueryData<{ count: number }>(
      ['tool-approvals', 'pending-count'],
      { count: root.filter(a => a.status === 'pending').length },
    );
  }
}

// ─── Shared WS bridge ─────────────────────────────────────────────────

/**
 * Opens a WS connection and streams snapshots + events into the React
 * Query cache. Returns a `send` function so sibling hooks can dispatch
 * decisions over the same socket.
 */
function useApprovalsSocket(): {
  send: (payload: unknown) => boolean;
  connectionState: 'connecting' | 'connected' | 'closed';
} {
  const queryClient = useQueryClient();

  const { connectionState, send } = useAIAgentsWebSocket({
    onMessage: msg => {
      const type = (msg.type ?? msg.event) as string | undefined;
      if (!type) return;

      // Response to our { type: 'tool-approvals-history' } request.
      // Shape: { type: "tool-approvals-history", data: { approvals: [...] } }
      if (type === 'tool-approvals-history') {
        const data = msg.data as Record<string, unknown> | undefined;
        const rawList = Array.isArray(data?.approvals) ? data!.approvals : [];
        const list = rawList
          .map(normalizeApproval)
          .filter((a): a is ApprovalRecord => a !== null)
          .filter(a => a.status !== 'deleted');
        writeSnapshot(queryClient, list);
        return;
      }

      // Incremental broadcast events from datalayer-ai-agents.
      // Shape: { channel: "user:<uid>", event: "tool_approval_*", data: record }
      if (type.startsWith('tool_approval_')) {
        const rawPayload =
          (msg.payload as Record<string, unknown> | undefined) ??
          (msg.data as Record<string, unknown> | undefined) ??
          undefined;
        const approval = normalizeApproval(rawPayload);
        if (!approval) return;
        patchApproval(
          queryClient,
          approval,
          type === 'tool_approval_deleted' ? 'remove' : 'upsert',
        );
      }
    },
  });

  // Request the full approval history once connected so the sidebar badge
  // and any pending-count consumers always show the correct count.
  const historyAskedRef = useRef(false);
  useEffect(() => {
    if (connectionState !== 'connected') {
      historyAskedRef.current = false;
      return;
    }
    if (historyAskedRef.current) return;
    historyAskedRef.current = send({ type: 'tool-approvals-history' });
  }, [connectionState, send]);

  return { send, connectionState };
}

// ─── Base hooks ──────────────────────────────────────────────────────

export function useToolApprovalsQuery(filters?: ToolApprovalFilters) {
  useApprovalsSocket();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['tool-approvals', filters] as const,
    [filters],
  );
  return useQuery<ApprovalsQueryData>({
    queryKey,
    // Data is populated via the WS bridge. On invalidation, return the
    // cached value so the fresh WS snapshot is preserved.
    queryFn: async () =>
      queryClient.getQueryData<ApprovalsQueryData>(queryKey) ?? {
        approvals: [],
        total: 0,
      },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function usePendingApprovalCount() {
  useApprovalsSocket();
  const queryClient = useQueryClient();
  return useQuery<{ count: number }>({
    queryKey: ['tool-approvals', 'pending-count'],
    queryFn: async () => {
      const cached = queryClient.getQueryData<{ count: number }>([
        'tool-approvals',
        'pending-count',
      ]);
      if (cached && typeof cached.count === 'number') return cached;
      const root =
        queryClient.getQueryData<ApprovalsQueryData>(APPROVALS_ROOT_KEY);
      const pending = (root?.approvals ?? []).filter(
        a => a.status === 'pending',
      ).length;
      return { count: pending };
    },
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Build a mutation-style object that sends a WS decision. */
function useDecisionMutation(approved: boolean): MutationResult {
  const { send } = useApprovalsSocket();
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(
    async ({ id, note }: { id: string; note?: string }) => {
      setIsPending(true);
      try {
        const ok = send({
          type: 'tool_approval_decision',
          approvalId: id,
          approved,
          ...(note ? { note } : {}),
        });
        if (!ok) {
          throw new Error(
            'Approvals WebSocket is not connected; decision was not sent',
          );
        }
      } finally {
        setIsPending(false);
      }
    },
    [approved, send],
  );

  const mutate = useCallback(
    (vars: { id: string; note?: string }) => {
      void mutateAsync(vars);
    },
    [mutateAsync],
  );

  return { isPending, mutate, mutateAsync };
}

export function useApproveToolRequest(): MutationResult {
  return useDecisionMutation(true);
}

export function useRejectToolRequest(): MutationResult {
  return useDecisionMutation(false);
}

/**
 * Mark a tool approval as read/unread in the local cache.
 *
 * Read-state isn't part of the websocket contract, so this hook patches
 * only the React Query cache. The patch survives until the next snapshot.
 */
function useLocalReadMutation(target: boolean): MutationResult {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(
    async ({ id }: { id: string; note?: string }) => {
      setIsPending(true);
      try {
        const queries = queryClient
          .getQueryCache()
          .findAll({ queryKey: APPROVALS_ROOT_KEY });
        for (const q of queries) {
          const [, second] = q.queryKey as readonly unknown[];
          if (second === 'pending-count') continue;
          const current = queryClient.getQueryData<ApprovalsQueryData>(
            q.queryKey,
          );
          if (!current?.approvals) continue;
          queryClient.setQueryData<ApprovalsQueryData>(q.queryKey, {
            ...current,
            approvals: current.approvals.map(a =>
              a.id === id ? { ...a, read: target } : a,
            ),
          });
        }
      } finally {
        setIsPending(false);
      }
    },
    [queryClient, target],
  );

  const mutate = useCallback(
    (vars: { id: string; note?: string }) => {
      void mutateAsync(vars);
    },
    [mutateAsync],
  );

  return { isPending, mutate, mutateAsync };
}

export function useMarkToolApprovalRead(): MutationResult {
  return useLocalReadMutation(true);
}

export function useMarkToolApprovalUnread(): MutationResult {
  return useLocalReadMutation(false);
}

/**
 * Delete a tool approval.
 *
 * Sends a ``tool_approval_delete`` message over the shared websocket.
 * The local cache is updated only after the server emits
 * ``tool_approval_deleted``.
 */
export function useDeleteToolApproval(): MutationResult {
  const { send } = useApprovalsSocket();
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(
    async ({ id }: { id: string; note?: string }) => {
      setIsPending(true);
      try {
        const ok = send({
          type: 'tool_approval_delete',
          approvalId: id,
        });
        if (!ok) {
          throw new Error(
            'Approvals WebSocket is not connected; delete was not sent',
          );
        }
      } finally {
        setIsPending(false);
      }
    },
    [send],
  );

  const mutate = useCallback(
    (vars: { id: string; note?: string }) => {
      void mutateAsync(vars);
    },
    [mutateAsync],
  );

  return { isPending, mutate, mutateAsync };
}

// ─── Composite hook ──────────────────────────────────────────────────

export function useToolApprovals(filters?: ToolApprovalFilters) {
  const approvalsQuery = useToolApprovalsQuery(filters);
  const pendingQuery = usePendingApprovalCount();
  const approve = useApproveToolRequest();
  const reject = useRejectToolRequest();
  const markRead = useMarkToolApprovalRead();
  const markUnread = useMarkToolApprovalUnread();
  const remove = useDeleteToolApproval();

  return useMemo(
    () => ({
      approvalsQuery,
      pendingCountQuery: pendingQuery,
      approve,
      reject,
      markRead,
      markUnread,
      remove,
    }),
    [
      approvalsQuery,
      pendingQuery,
      approve,
      reject,
      markRead,
      markUnread,
      remove,
    ],
  );
}
