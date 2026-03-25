/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent monitoring/event hooks.
 *
 * @module hooks/useAgentsMonitoring
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIAMStore } from '@datalayer/core/lib/state';
import { useCoreStore } from '@datalayer/core';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import * as aiAgentsApi from '../api';
import type {
  ListAgentEventsParams,
  CreateAgentEventRequest,
  UpdateAgentEventRequest,
} from '../api/types';

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

export function useAgentEvents(params?: ListAgentEventsParams) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-events', params],
    queryFn: () => aiAgentsApi.events.listEvents(token, params ?? {}, baseUrl),
    enabled: !!token,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAgentEvent(eventId?: string) {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();

  return useQuery({
    queryKey: ['agent-events', eventId],
    queryFn: () =>
      aiAgentsApi.events.getEvent(token, eventId as string, baseUrl),
    enabled: !!token && !!eventId,
    staleTime: 10_000,
  });
}

export function useCreateAgentEvent() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAgentEventRequest) =>
      aiAgentsApi.events.createEvent(token, payload, baseUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
    },
  });
}

export function useUpdateAgentEvent() {
  const token = useDashboardAuthToken();
  const baseUrl = useDashboardBaseUrl();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      payload,
    }: {
      eventId: string;
      payload: UpdateAgentEventRequest;
    }) => aiAgentsApi.events.updateEvent(token, eventId, payload, baseUrl),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-events'] });
      queryClient.invalidateQueries({
        queryKey: ['agent-events', variables.eventId],
      });
    },
  });
}

// ─── Composite hook ──────────────────────────────────────────────────

export function useMonitoring(
  params?: ListAgentEventsParams,
  eventId?: string,
) {
  const eventsQuery = useAgentEvents(params);
  const eventQuery = useAgentEvent(eventId);
  const createEvent = useCreateAgentEvent();
  const updateEvent = useUpdateAgentEvent();

  return useMemo(
    () => ({
      eventsQuery,
      eventQuery,
      createEvent,
      updateEvent,
    }),
    [eventsQuery, eventQuery, createEvent, updateEvent],
  );
}
