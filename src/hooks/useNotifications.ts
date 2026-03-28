/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent notification hooks.
 *
 * @module hooks/useNotifications
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCoreStore, useIAMStore } from '@datalayer/core/lib/state';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { events, notifications } from '../api';
import type {
  NotificationFilters,
  ListAgentEventsParams,
  CreateAgentEventRequest,
  UpdateAgentEventRequest,
} from '../types';

// ─── Auth helpers ────────────────────────────────────────────────────

function useAuthToken(): string {
  const token = useIAMStore((s: { token?: string | null }) => s.token);
  return token ?? '';
}

function useBaseUrl(): string {
  const config = useCoreStore(
    (s: { configuration?: { aiagentsRunUrl?: string } }) => s.configuration,
  );
  return config?.aiagentsRunUrl ?? DEFAULT_SERVICE_URLS.AI_AGENTS;
}

// ─── Base hooks ──────────────────────────────────────────────────────

export function useFilteredNotifications(filters?: NotificationFilters) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', filters],
    queryFn: () => notifications.getNotifications(token, filters, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useUnreadNotificationCount() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-notifications', 'unread-count'],
    queryFn: () => notifications.getUnreadCount(token, baseUrl),
    enabled: !!token,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useMarkNotificationRead() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      notifications.markNotificationRead(token, id, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notifications.markAllRead(token, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-notifications'] });
    },
  });
}

// ─── Event hooks ─────────────────────────────────────────────────────

export function useAgentEvents(params?: ListAgentEventsParams) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-events', params],
    queryFn: () => events.listEvents(token, params ?? {}, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAgentEvent(eventId?: string) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-events', eventId],
    queryFn: () => events.getEvent(token, eventId as string, baseUrl),
    enabled: !!token && !!eventId,
    staleTime: 10_000,
  });
}

export function useCreateAgentEvent() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAgentEventRequest) =>
      events.createEvent(token, payload, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useUpdateAgentEvent() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      payload,
    }: {
      eventId: string;
      payload: UpdateAgentEventRequest;
    }) => events.updateEvent(token, eventId, payload, baseUrl),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
      queryClient.invalidateQueries({
        queryKey: ['agent-events', variables.eventId],
      });
    },
  });
}

export function useDeleteAgentEvent() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.deleteEvent(token, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useMarkEventRead() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.markEventRead(token, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useMarkEventUnread() {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.markEventUnread(token, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

// ─── Composite hook ──────────────────────────────────────────────────

export function useNotifications(
  filters?: NotificationFilters,
  eventParams?: ListAgentEventsParams,
  eventId?: string,
) {
  const notificationsQuery = useFilteredNotifications(filters);
  const unreadCountQuery = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const eventsQuery = useAgentEvents(eventParams);
  const eventQuery = useAgentEvent(eventId);
  const createEvent = useCreateAgentEvent();
  const updateEvent = useUpdateAgentEvent();
  const deleteEvent = useDeleteAgentEvent();
  const markEventRead = useMarkEventRead();
  const markEventUnread = useMarkEventUnread();

  return useMemo(
    () => ({
      notificationsQuery,
      unreadCountQuery,
      markRead,
      markAllRead,
      eventsQuery,
      eventQuery,
      createEvent,
      updateEvent,
      deleteEvent,
      markEventRead,
      markEventUnread,
    }),
    [
      notificationsQuery,
      unreadCountQuery,
      markRead,
      markAllRead,
      eventsQuery,
      eventQuery,
      createEvent,
      updateEvent,
      deleteEvent,
      markEventRead,
      markEventUnread,
    ],
  );
}
