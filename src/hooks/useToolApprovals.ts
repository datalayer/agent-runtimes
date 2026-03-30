/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent tool approval hooks.
 *
 * @module hooks/useToolApprovals
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCoreStore, useIAMStore } from '@datalayer/core/lib/state';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { toolApprovals } from '../api';
import type { ToolApprovalFilters } from '../types/tool-approvals';

// ─── Auth helpers ────────────────────────────────────────────────────

function useDashboardAuthToken(): string {
  const token = useIAMStore((s: any) => s.token);
  return token ?? '';
}

function useDashboardBaseUrl(): string {
  const config = useCoreStore((s: any) => s.configuration);
  return config?.aiagentsRunUrl ?? DEFAULT_SERVICE_URLS.AI_AGENTS;
}

// ─── Base hooks ──────────────────────────────────────────────────────

export function useToolApprovalsQuery(filters?: ToolApprovalFilters) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['tool-approvals', filters],
    queryFn: () => toolApprovals.getToolApprovals(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
  });
}

export function usePendingApprovalCount() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['tool-approvals', 'pending-count'],
    queryFn: () => toolApprovals.getPendingApprovalCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
  });
}

export function useApproveToolRequest() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      toolApprovals.approveToolRequest(token, id, note, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useRejectToolRequest() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      toolApprovals.rejectToolRequest(token, id, note, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useMarkToolApprovalRead() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      toolApprovals.markToolApprovalRead(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useMarkToolApprovalUnread() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      toolApprovals.markToolApprovalUnread(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
}

export function useDeleteToolApproval() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      toolApprovals.deleteToolApproval(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tool-approvals'] });
    },
  });
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
