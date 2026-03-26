/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Protocol } from './protocol';

/**
 * Status of an example agent (for UI demos).
 */
export type ExampleAgentStatus =
  | 'starting'
  | 'running'
  | 'paused'
  | 'terminated'
  | 'archived';

export interface ExampleAgent {
  id: string;
  name: string;
  description: string;
  author: string;
  lastEdited: string;
  screenshot: string;
  status?: ExampleAgentStatus;
  protocol: Protocol;
  avatarUrl: string;
  notebookFile: string;
  lexicalFile: string;
  stars: number;
  notifications: number;
}

export type ExampleAgentsState = {
  agents: readonly ExampleAgent[];
  getAgentById: (id: string) => ExampleAgent | undefined;
  updateAgentStatus: (id: string, status: ExampleAgentStatus) => void;
  toggleAgentStatus: (id: string) => void;
};

export interface ConversationEntry {
  id: string;
  firstMessage?: string;
  timestamp: number;
}
