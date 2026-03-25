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
import * as aiAgentsApi from '../api';
import type { ToolApprovalFilters } from '../api/types';

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
    queryFn: () =>
      aiAgentsApi.toolApprovals.getToolApprovals(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function usePendingApprovalCount() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['tool-approvals', 'pending-count'],
    queryFn: () =>
      aiAgentsApi.toolApprovals.getPendingApprovalCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useApproveToolRequest() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      aiAgentsApi.toolApprovals.approveToolRequest(token, id, note, baseUrl),
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
      aiAgentsApi.toolApprovals.rejectToolRequest(token, id, note, baseUrl),
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

  return useMemo(
    () => ({
      approvalsQuery,
      pendingCountQuery: pendingQuery,
      approve,
      reject,
    }),
    [approvalsQuery, pendingQuery, approve, reject],
  );
}
