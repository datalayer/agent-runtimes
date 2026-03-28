/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent events API functions.
 *
 * Provides CRUD operations for agent event records.
 *
 * @module api/events
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  validateToken,
  validateRequiredString,
} from '@datalayer/core/lib/api/utils/validation';
import type {
  AgentEvent,
  CreateAgentEventRequest,
  GetAgentEventResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  UpdateAgentEventRequest,
} from '../types';

const toQueryString = (params: ListAgentEventsParams): string => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      searchParams.append(k, String(v));
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
};

export const createEvent = async (
  token: string,
  data: CreateAgentEventRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<{ success: boolean; event: AgentEvent }> => {
  validateToken(token);
  validateRequiredString(data.agent_id, 'agent_id');
  validateRequiredString(data.title, 'title');

  return requestDatalayerAPI<{ success: boolean; event: AgentEvent }>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/events`,
    method: 'POST',
    token,
    body: data,
  });
};

export const listEvents = async (
  token: string,
  params: ListAgentEventsParams = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<ListAgentEventsResponse> => {
  validateToken(token);

  return requestDatalayerAPI<ListAgentEventsResponse>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/events${toQueryString(params)}`,
    method: 'GET',
    token,
  });
};

export const getEvent = async (
  token: string,
  eventId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<GetAgentEventResponse> => {
  validateToken(token);
  validateRequiredString(eventId, 'eventId');

  return requestDatalayerAPI<GetAgentEventResponse>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/events/${encodeURIComponent(eventId)}`,
    method: 'GET',
    token,
  });
};

export const updateEvent = async (
  token: string,
  eventId: string,
  data: UpdateAgentEventRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<GetAgentEventResponse> => {
  validateToken(token);
  validateRequiredString(eventId, 'eventId');

  return requestDatalayerAPI<GetAgentEventResponse>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/events/${encodeURIComponent(eventId)}`,
    method: 'PATCH',
    token,
    body: data,
  });
};

export const deleteEvent = async (
  token: string,
  eventId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<{ success: boolean }> => {
  validateToken(token);
  validateRequiredString(eventId, 'eventId');

  return requestDatalayerAPI<{ success: boolean }>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/events/${encodeURIComponent(eventId)}`,
    method: 'DELETE',
    token,
  });
};

export const markEventRead = async (
  token: string,
  eventId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<GetAgentEventResponse> => {
  return updateEvent(token, eventId, { read: true }, baseUrl);
};

export const markEventUnread = async (
  token: string,
  eventId: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<GetAgentEventResponse> => {
  return updateEvent(token, eventId, { read: false }, baseUrl);
};
