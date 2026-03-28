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

/**
 * List events across all agents for the authenticated user.
 */
export function useAllAgentEvents(
  params?: Omit<ListAgentEventsParams, 'agent_id'>,
) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-events', params],
    queryFn: () => events.listAllEvents(token, params ?? {}, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
  });
}

export function useAgentEvents(
  agentId: string,
  params?: Omit<ListAgentEventsParams, 'agent_id'>,
) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-events', agentId, params],
    queryFn: () => events.listEvents(token, agentId, params ?? {}, baseUrl),
    enabled: !!token && !!agentId,
    staleTime: 10_000,
  });
}

export function useAgentEvent(agentId: string, eventId?: string) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();

  return useQuery({
    queryKey: ['agent-events', agentId, eventId],
    queryFn: () => events.getEvent(token, agentId, eventId as string, baseUrl),
    enabled: !!token && !!agentId && !!eventId,
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

export function useUpdateAgentEvent(agentId: string) {
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
    }) => events.updateEvent(token, agentId, eventId, payload, baseUrl),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
      queryClient.invalidateQueries({
        queryKey: ['agent-events', agentId, variables.eventId],
      });
    },
  });
}

export function useDeleteAgentEvent(agentId: string) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.deleteEvent(token, agentId, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useMarkEventRead(agentId: string) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.markEventRead(token, agentId, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useMarkEventUnread(agentId: string) {
  const token = useAuthToken();
  const baseUrl = useBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      events.markEventUnread(token, agentId, eventId, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

// ─── Composite hook ──────────────────────────────────────────────────

export function useNotifications(
  agentId: string,
  filters?: NotificationFilters,
  eventParams?: Omit<ListAgentEventsParams, 'agent_id'>,
  eventId?: string,
) {
  const notificationsQuery = useFilteredNotifications(filters);
  const unreadCountQuery = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const eventsQuery = useAgentEvents(agentId, eventParams);
  const eventQuery = useAgentEvent(agentId, eventId);
  const createEvent = useCreateAgentEvent();
  const updateEvent = useUpdateAgentEvent(agentId);
  const deleteEvent = useDeleteAgentEvent(agentId);
  const markEventRead = useMarkEventRead(agentId);
  const markEventUnread = useMarkEventUnread(agentId);

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
