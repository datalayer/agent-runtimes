/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent monitoring/event hooks.
 *
 * @module hooks/useMonitoring
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCoreStore, useIAMStore } from '@datalayer/core/lib/state';
import { DEFAULT_SERVICE_URLS } from '@datalayer/core/lib/api/constants';
import { events } from '../api';
import type {
  ListAgentEventsParams,
  CreateAgentEventRequest,
  UpdateAgentEventRequest,
} from '../types';

// ─── Auth helpers ────────────────────────────────────────────────────

function useAuthToken(): string {
  const token = useIAMStore((s: any) => s.token);
  return token ?? '';
}

function useBaseUrl(): string {
  const config = useCoreStore((s: any) => s.configuration);
  return config?.aiagentsRunUrl ?? DEFAULT_SERVICE_URLS.AI_AGENTS;
}

// ─── Base hooks ──────────────────────────────────────────────────────

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
