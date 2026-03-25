/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent notification hooks.
 *
 * @module hooks/useAgentsNotifications
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIAMStore } from '@datalayer/core/lib/state';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import * as aiAgentsApi from '../api';
import type { NotificationFilters } from '../api/types';

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

export function useNotifications(filters?: NotificationFilters) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', filters],
    queryFn: () =>
      aiAgentsApi.notifications.getNotifications(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useUnreadNotificationCount() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', 'unread-count'],
    queryFn: () => aiAgentsApi.notifications.getUnreadCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useMarkNotificationRead() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      aiAgentsApi.notifications.markNotificationRead(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => aiAgentsApi.notifications.markAllRead(token, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

// ─── Composite hook ──────────────────────────────────────────────────

export function useAgentsNotifications(filters?: NotificationFilters) {
  const notificationsQuery = useNotifications(filters);
  const unreadCountQuery = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  return useMemo(
    () => ({
      notificationsQuery,
      unreadCountQuery,
      markRead,
      markAllRead,
    }),
    [notificationsQuery, unreadCountQuery, markRead, markAllRead],
  );
}
