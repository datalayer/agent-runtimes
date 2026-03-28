/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Agent event and notification timeline types.
 *
 * @module types/events
 */

export interface AgentEvent {
  id: string;
  agent_id: string;
  title: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentEventRequest {
  agent_id: string;
  title: string;
  kind?: string;
  status?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentEventRequest {
  title?: string;
  kind?: string;
  status?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ListAgentEventsParams {
  agent_id?: string;
  kind?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface GetAgentEventResponse {
  success: boolean;
  event: AgentEvent;
}

export interface ListAgentEventsResponse {
  success: boolean;
  total: number;
  events: AgentEvent[];
}
