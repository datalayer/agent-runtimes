/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Status of an example agent (for UI demos).
 */
export type ExampleAgentStatus =
  'starting' | 'running' | 'paused' | 'terminated' | 'archived';

export interface ConversationEntry {
  id: string;
  firstMessage?: string;
  timestamp: number;
}
