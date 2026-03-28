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
