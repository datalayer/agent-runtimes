/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ChatMessage } from './messages';

/**
 * A protocol extension an agent card advertises supporting
 * (https://a2a-protocol.org/latest/topics/extensions/): a URI, not the
 * bare string this codebase's `capabilities.extensions` used to be typed
 * as. A real card's entries are objects — `{ uri, description?, required?
 * }` — and a `string[]` type made `.includes(uri)` silently false against
 * one, even though nothing read the field yet to notice.
 */
export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
  params?: Record<string, unknown>;
}

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
    extensions?: AgentExtension[];
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
