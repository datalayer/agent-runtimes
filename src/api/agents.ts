/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Running agents API functions.
 *
 * Provides functions for listing, inspecting, pausing, and resuming
 * durable agents across runtimes.
 *
 * @module api/agents
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import { validateToken } from '@datalayer/core/lib/api/utils/validation';
import type {
  RunningAgent,
  AgentUsageSummary,
  ConversationCheckpoint,
} from './types';

/**
 * List all running agents across runtimes.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the AI Agents API
 * @returns Promise resolving to list of running agents
 */
export const getRunningAgents = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<RunningAgent[]> => {
  validateToken(token);
  return requestDatalayerAPI<RunningAgent[]>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents`,
    method: 'GET',
    token,
  });
};

/**
 * Get detailed status for a specific agent.
 * @param token - Authentication token
 * @param podName - Pod name hosting the agent
 * @param agentId - Agent ID within the pod (optional, defaults to primary)
 * @param baseUrl - Base URL
 * @returns Promise resolving to agent status
 */
export const getAgentStatus = async (
  token: string,
  podName: string,
  agentId?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<RunningAgent> => {
  validateToken(token);
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  return requestDatalayerAPI<RunningAgent>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(podName)}${query}`,
    method: 'GET',
    token,
  });
};

/**
 * Pause a running agent (CRIU checkpoint or application-level pause).
 * @param token - Authentication token
 * @param podName - Pod name
 * @param baseUrl - Base URL
 */
export const pauseAgent = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(podName)}/pause`,
    method: 'POST',
    token,
  });
};

/**
 * Resume a paused/checkpointed agent.
 * @param token - Authentication token
 * @param podName - Pod name
 * @param baseUrl - Base URL
 */
export const resumeAgent = async (
  token: string,
  podName: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<void> => {
  validateToken(token);
  await requestDatalayerAPI<void>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(podName)}/resume`,
    method: 'POST',
    token,
  });
};

/**
 * Get conversation checkpoints for an agent.
 * @param token - Authentication token
 * @param podName - Pod name
 * @param agentId - Agent ID
 * @param baseUrl - Base URL
 */
export const getAgentCheckpoints = async (
  token: string,
  podName: string,
  agentId?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<ConversationCheckpoint[]> => {
  validateToken(token);
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  return requestDatalayerAPI<ConversationCheckpoint[]>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(podName)}/checkpoints${query}`,
    method: 'GET',
    token,
  });
};

/**
 * Get usage summary for an agent.
 * @param token - Authentication token
 * @param podName - Pod name
 * @param agentId - Agent ID
 * @param baseUrl - Base URL
 */
export const getAgentUsage = async (
  token: string,
  podName: string,
  agentId?: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.AI_AGENTS,
): Promise<AgentUsageSummary> => {
  validateToken(token);
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  return requestDatalayerAPI<AgentUsageSummary>({
    url: `${baseUrl}${API_BASE_PATHS.AI_AGENTS}/agents/${encodeURIComponent(podName)}/usage${query}`,
    method: 'GET',
    token,
  });
};
