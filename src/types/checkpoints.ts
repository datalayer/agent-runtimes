/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

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
