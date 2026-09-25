/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

export type CheckpointMode = 'criu' | 'light';

/**
 * A persisted checkpoint record returned from the runtimes API.
 */
export interface CheckpointRecord {
  id: string;
  name: string;
  description: string;
  runtime_uid: string;
  agent_spec_id: string;
  agentspec: Record<string, unknown>;
  metadata: Record<string, unknown>;
  checkpoint_mode?: CheckpointMode;
  messages?: string[];
  status: string;
  status_message?: string;
  updated_at: string;
}

// ---- Conversation Checkpoints ----

export interface ConversationCheckpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Human-readable label */
  label: string;
  /** Turn number when checkpointed */
  turn: number;
  /** Number of messages at checkpoint time */
  messageCount: number;
  /** When the checkpoint was created */
  createdAt: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

// ---- Conversation checkpoints on the local server ----

/** When an agent takes a conversation checkpoint on its own. */
export type ConversationCheckpointFrequency =
  'every_turn' | 'every_tool' | 'manual_only';

/**
 * An agent's conversation checkpoints as the local server reports them:
 * whether it checkpoints at all, how, where the conversation stands, and
 * the checkpoints it has, newest first.
 */
export interface ConversationCheckpointsState {
  agentId: string;
  /** False for an agent whose spec asked for no checkpoints. */
  enabled: boolean;
  frequency?: ConversationCheckpointFrequency;
  /** Rolling window: the oldest checkpoint goes when this is exceeded. */
  maxCheckpoints?: number;
  /** `in_memory` or `file`. */
  store?: string;
  /** Turns the agent has run so far. */
  turn: number;
  checkpoints: ConversationCheckpoint[];
}
