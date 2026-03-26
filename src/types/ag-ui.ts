/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ChatMessage } from './messges';
import { ToolDefinition } from './tools';

/**
 * AG-UI specific types
 */
export namespace AGUI {
  export interface RunAgentInput {
    threadId: string;
    runId: string;
    messages: ChatMessage[];
    state: Record<string, unknown> | null;
    tools: ToolDefinition[];
    context: Array<{ type: string; content: string }>;
    forwardedProps: Record<string, unknown> | null;
    /** Optional model override for per-request model selection */
    model?: string;
  }

  export interface Event {
    type: string;
    data?: unknown;
  }
}
