/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent notifications API functions.
 *
 * Provides CRUD operations for agent-generated notifications.
 * Agents emit notifications for guardrail events, budget warnings,
 * task completions, and other notable events.
 *
 * @module api/notifications
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import type { AgentNotification, NotificationFilters } from '../types';

/**
 * List agent notifications with optional filters.
 * @param token - Authentication token
 * @param filters - Optional filters (agentId, level, unreadOnly, category, limit, offset)
 * @param baseUrl - Base URL
 * @returns Promise resolving to list of notifications
 */
export const getNotifications = async (
  token: string,
  filters?: NotificationFilters,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<AgentNotification[]> => {
  validateToken(token);

  const params = new URLSearchParams();
  if (filters?.agentId) params.set('agent_id', filters.agentId);
  if (filters?.level) params.set('level', filters.level);
  if (filters?.unreadOnly) params.set('unread_only', 'true');
  if (filters?.category) params.set('category', filters.category);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString() ? `?${params.toString()}` : '';

  return requestDatalayerAPI<AgentNotification[]>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications${query}`,
    method: 'GET',
    token,
  });
};

/**
 * Get a specific notification by ID.
 * @param token - Authentication token
 * @param id - Notification ID
 * @param baseUrl - Base URL
 */
export const getNotification = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<AgentNotification> => {
  validateToken(token);
  return requestDatalayerAPI<AgentNotification>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/${encodeURIComponent(id)}`,
    method: 'GET',
    token,
  });
};

/**
 * Mark a notification as read.
 * @param token - Authentication token
 * @param id - Notification ID
 * @param baseUrl - Base URL
 */
export const markNotificationRead = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/${encodeURIComponent(id)}/read`,
    method: 'POST',
    token,
  });
};

/**
 * Mark all notifications as read.
 * @param token - Authentication token
 * @param agentId - Optional: only for a specific agent
 * @param baseUrl - Base URL
 */
export const markAllRead = async (
  token: string,
  agentId?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  const body = agentId ? { agent_id: agentId } : {};
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/read-all`,
    method: 'POST',
    body,
    token,
  });
};

/**
 * Get count of unread notifications.
 * @param token - Authentication token
 * @param baseUrl - Base URL
 * @returns Promise resolving to unread count
 */
export const getUnreadCount = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<{ count: number }> => {
  validateToken(token);
  return requestDatalayerAPI<{ count: number }>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/unread/count`,
    method: 'GET',
    token,
  });
};
