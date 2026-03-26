/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ChatMessage } from './messges';

/**
 * Agent card for A2A protocol
 */
export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  version?: string;
  capabilities?: {
    streaming?: boolean;
    extensions?: string[];
  };
  skills?: Array<{
    id: string;
    name: string;
    description?: string;
    examples?: string[];
  }>;
}

/**
 * A2A specific types
 */
export namespace A2A {
  export interface Task {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    messages: ChatMessage[];
    result?: unknown;
  }

  export interface Message {
    role: string;
    parts: Array<{
      type: string;
      text?: string;
      data?: unknown;
    }>;
  }
}
