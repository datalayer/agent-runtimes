/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Conversation checkpoints of an agent on a local agent-runtimes server.
 *
 * The agent takes its own checkpoints as it runs; these calls let a page see
 * them, take one between turns, rewind to one and drop one. They speak to
 * `/api/v1/agents/{id}/checkpoints` on the server the workspace is backed by,
 * as the Loop's other local calls do — no token, the local server checks
 * none.
 *
 * @module api/checkpoints
 */

import type {
  ConversationCheckpoint,
  ConversationCheckpointsState,
} from '../types/checkpoints';

type CheckpointWire = {
  id: string;
  label: string;
  turn: number;
  message_count: number;
  created_at: string;
  auto?: boolean;
  metadata?: Record<string, unknown>;
};

type StateWire = {
  agent_id: string;
  enabled: boolean;
  frequency?: ConversationCheckpointsState['frequency'];
  max_checkpoints?: number;
  store?: string;
  turn?: number;
  checkpoints?: CheckpointWire[];
};

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

const base = (serverUrl: string, agentId: string): string =>
  `${trimSlash(serverUrl)}/api/v1/agents/${encodeURIComponent(agentId)}/checkpoints`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = typeof body.detail === 'string' ? body.detail : '';
    } catch {
      // The status line is the message then.
    }
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** The server's record, in the shape the rest of the library already uses. */
export function toConversationCheckpoint(
  wire: CheckpointWire,
): ConversationCheckpoint {
  return {
    id: wire.id,
    label: wire.label,
    turn: wire.turn,
    messageCount: wire.message_count,
    createdAt: wire.created_at,
    metadata: { ...(wire.metadata ?? {}), auto: wire.auto === true },
  };
}

/** Whether the checkpoint was taken by the agent on its own. */
export const isAutoCheckpoint = (checkpoint: ConversationCheckpoint): boolean =>
  checkpoint.metadata?.auto === true;

/** The agent's checkpoint configuration and its checkpoints, newest first. */
export async function listConversationCheckpoints(
  serverUrl: string,
  agentId: string,
): Promise<ConversationCheckpointsState> {
  const wire = await call<StateWire>(base(serverUrl, agentId));
  return {
    agentId: wire.agent_id,
    enabled: wire.enabled,
    frequency: wire.frequency,
    maxCheckpoints: wire.max_checkpoints,
    store: wire.store,
    turn: wire.turn ?? 0,
    checkpoints: (wire.checkpoints ?? []).map(toConversationCheckpoint),
  };
}

/** Take a checkpoint of the conversation as the last turn left it. */
export async function saveConversationCheckpoint(
  serverUrl: string,
  agentId: string,
  label: string,
): Promise<ConversationCheckpoint> {
  const wire = await call<CheckpointWire>(base(serverUrl, agentId), {
    method: 'POST',
    body: JSON.stringify({ label }),
  });
  return toConversationCheckpoint(wire);
}

/**
 * Set the conversation back to a checkpoint. The server pushes a fresh
 * snapshot; the chat reloads its transcript from it.
 */
export async function rewindConversation(
  serverUrl: string,
  agentId: string,
  checkpointId: string,
): Promise<{ checkpoint: ConversationCheckpoint; messageCount: number }> {
  const wire = await call<{
    checkpoint: CheckpointWire;
    message_count: number;
  }>(`${base(serverUrl, agentId)}/${encodeURIComponent(checkpointId)}/rewind`, {
    method: 'POST',
  });
  return {
    checkpoint: toConversationCheckpoint(wire.checkpoint),
    messageCount: wire.message_count,
  };
}

/** Drop a checkpoint. */
export async function deleteConversationCheckpoint(
  serverUrl: string,
  agentId: string,
  checkpointId: string,
): Promise<void> {
  await call<{ deleted: string }>(
    `${base(serverUrl, agentId)}/${encodeURIComponent(checkpointId)}`,
    { method: 'DELETE' },
  );
}
