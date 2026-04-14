/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ContextSnapshotData } from './context';
import type { McpToolsetsStatusResponse } from './mcp';

export type AgentStreamEventType =
  | 'agent.snapshot'
  | 'tool_approval_created'
  | 'tool_approval_approved'
  | 'tool_approval_rejected';

export interface AgentStreamMessage<TPayload = Record<string, unknown>> {
  version: string;
  type: AgentStreamEventType | string;
  agentId?: string;
  timestamp: string;
  payload: TPayload;
  // Backward compatibility with existing consumers.
  event?: string;
  data?: unknown;
}

export interface AgentStreamToolApprovalPayload {
  id: string;
  agent_id?: string;
  pod_name?: string;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  status?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AgentStreamSnapshotPayload {
  agentId?: string;
  approvals: AgentStreamToolApprovalPayload[];
  pendingApprovalCount: number;
  contextSnapshot?: ContextSnapshotData | null;
  costUsage?: ContextSnapshotData['costUsage'];
  mcpStatus?: McpToolsetsStatusResponse | null;
  codemodeStatus?: CodemodeStatusData | null;
  fullContext?: Record<string, unknown> | null;
}

/** Codemode status as pushed via the monitoring WebSocket. */
export interface CodemodeStatusData {
  enabled: boolean;
  skills: Array<{ name: string; description?: string; tags?: string[] }>;
  available_skills: Array<{
    name: string;
    description?: string;
    tags?: string[];
  }>;
  sandbox?: Record<string, unknown> | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

export function parseAgentStreamMessage(
  raw: unknown,
): AgentStreamMessage | null {
  if (!isObject(raw)) {
    return null;
  }

  // New envelope format.
  if (typeof raw.type === 'string' && isObject(raw.payload)) {
    return {
      version: typeof raw.version === 'string' ? raw.version : '1.0',
      type: raw.type,
      agentId: typeof raw.agentId === 'string' ? raw.agentId : undefined,
      timestamp:
        typeof raw.timestamp === 'string'
          ? raw.timestamp
          : new Date().toISOString(),
      payload: raw.payload,
      event: typeof raw.event === 'string' ? raw.event : undefined,
      data: raw.data,
    };
  }

  // Legacy event/data format.
  if (typeof raw.event === 'string' && isObject(raw.data)) {
    return {
      version: '1.0',
      type: raw.event,
      timestamp: new Date().toISOString(),
      payload: raw.data,
      event: raw.event,
      data: raw.data,
    };
  }

  return null;
}
