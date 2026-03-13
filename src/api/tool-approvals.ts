/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool approvals API functions.
 *
 * Provides CRUD operations for agent tool approval requests.
 * When an agent encounters a tool that requires human approval,
 * a ToolApproval record is created that the user can approve or reject.
 *
 * @module api/tool-approvals
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import type { ToolApproval, ToolApprovalFilters } from './types';

/**
 * List tool approvals with optional filters.
 * @param token - Authentication token
 * @param filters - Optional filters (agentId, status, toolName, limit, offset)
 * @param baseUrl - Base URL
 * @returns Promise resolving to list of tool approvals
 */
export const getToolApprovals = async (
  token: string,
  filters?: ToolApprovalFilters,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<ToolApproval[]> => {
  validateToken(token);

  const params = new URLSearchParams();
  if (filters?.agentId) params.set('agent_id', filters.agentId);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.toolName) params.set('tool_name', filters.toolName);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));

  const query = params.toString() ? `?${params.toString()}` : '';

  return requestDatalayerAPI<ToolApproval[]>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/tool-approvals${query}`,
    method: 'GET',
    token,
  });
};

/**
 * Get a specific tool approval by ID.
 * @param token - Authentication token
 * @param id - Tool approval ID
 * @param baseUrl - Base URL
 */
export const getToolApproval = async (
  token: string,
  id: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<ToolApproval> => {
  validateToken(token);
  return requestDatalayerAPI<ToolApproval>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/tool-approvals/${encodeURIComponent(id)}`,
    method: 'GET',
    token,
  });
};

/**
 * Approve a pending tool request.
 * @param token - Authentication token
 * @param id - Tool approval ID
 * @param note - Optional note explaining the approval
 * @param baseUrl - Base URL
 */
export const approveToolRequest = async (
  token: string,
  id: string,
  note?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/tool-approvals/${encodeURIComponent(id)}/approve`,
    method: 'POST',
    body: { note },
    token,
  });
};

/**
 * Reject a pending tool request.
 * @param token - Authentication token
 * @param id - Tool approval ID
 * @param note - Optional note explaining the rejection
 * @param baseUrl - Base URL
 */
export const rejectToolRequest = async (
  token: string,
  id: string,
  note?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/tool-approvals/${encodeURIComponent(id)}/reject`,
    method: 'POST',
    body: { note },
    token,
  });
};

/**
 * Get count of pending tool approvals.
 * @param token - Authentication token
 * @param baseUrl - Base URL
 * @returns Promise resolving to pending count
 */
export const getPendingApprovalCount = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<{ count: number }> => {
  validateToken(token);
  return requestDatalayerAPI<{ count: number }>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/tool-approvals/pending/count`,
    method: 'GET',
    token,
  });
};
