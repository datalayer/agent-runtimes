/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent notifications API functions.
 *
 * The caller's inbox on the AI Agents service: agents emit notifications for
 * guardrail events, budget warnings and task completions, and benchmark runs,
 * approvals and investigations leave theirs too. Every route answers for the
 * caller's own notifications only.
 *
 * The service answers snake case records inside an envelope; these functions
 * return `AgentNotification`s, so a caller never reads the wire shape.
 *
 * @module api/notifications
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import type {
  AgentNotification,
  NotificationFilters,
  NotificationLevel,
} from '../types';

/** One notification as the service answers it. */
interface NotificationRecord {
  id: string;
  agent_id?: string;
  level?: string;
  category?: string;
  title?: string;
  message?: string;
  read?: boolean;
  created_at?: string | null;
  metadata?: Record<string, unknown>;
}

/** A record of the service as the notification this client returns. */
export const toAgentNotification = (
  record: NotificationRecord,
): AgentNotification => ({
  id: record.id,
  agentId: record.agent_id ?? '',
  runtimeName: '',
  level: (record.level ?? 'info') as NotificationLevel,
  title: record.title ?? '',
  body: record.message ?? '',
  read: Boolean(record.read),
  createdAt: record.created_at ?? '',
  category: record.category ?? 'general',
  metadata: record.metadata ?? {},
});

/**
 * List the caller's notifications with optional filters.
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

  const answer = await requestDatalayerAPI<{
    notifications?: NotificationRecord[];
  }>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications${query}`,
    method: 'GET',
    token,
  });
  return (answer?.notifications ?? []).map(toAgentNotification);
};

/**
 * Get one of the caller's notifications by ID.
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
  const record = await requestDatalayerAPI<NotificationRecord>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/${encodeURIComponent(id)}`,
    method: 'GET',
    token,
  });
  return toAgentNotification(record);
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
 * Mark the caller's notifications as read: the ones named, or all of them.
 * @param token - Authentication token
 * @param notificationIds - Optional: only these notifications
 * @param baseUrl - Base URL
 */
export const markAllRead = async (
  token: string,
  notificationIds?: string[],
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/notifications/mark-all-read`,
    method: 'POST',
    body: notificationIds?.length ? { notification_ids: notificationIds } : {},
    token,
  });
};

/**
 * Get the count of the caller's unread notifications.
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
