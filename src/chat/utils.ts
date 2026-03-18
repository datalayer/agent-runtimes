/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Utility functions and constants for ChatBase.
 *
 * @module components/chat/utils
 */

import { QueryClient } from '@tanstack/react-query';

import type { ChatMessage, ContentPart } from '../types/message';
import type { ProtocolAdapterConfig } from '../types/protocol';
import {
  AGUIAdapter,
  A2AAdapter,
  VercelAIAdapter,
  ACPAdapter,
  type BaseProtocolAdapter,
} from '../protocols';

import type {
  ToolCallMessage,
  DisplayItem,
  ToolCallStatus,
  ProtocolConfig,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Singleton QueryClient for ChatBase instances without external QueryClientProvider */
export const internalQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

/** Primer's default portal root ID */
export const PRIMER_PORTAL_ROOT_ID = '__primerPortalRoot__';

// ---------------------------------------------------------------------------
// Type guards & helpers
// ---------------------------------------------------------------------------

/**
 * Check if an item is a tool call message
 */
export function isToolCallMessage(item: DisplayItem): item is ToolCallMessage {
  return 'type' in item && item.type === 'tool-call';
}

/**
 * Extract text content from a ChatMessage
 */
export function getMessageText(message: ChatMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  // Array of ContentPart - extract text parts
  return (message.content as ContentPart[])
    .filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text',
    )
    .map(part => part.text)
    .join('');
}

// ---------------------------------------------------------------------------
// History conversion
// ---------------------------------------------------------------------------

/**
 * Convert history messages to display items.
 *
 * History returns:
 * - Assistant messages with `toolCalls` array (tool invocations)
 * - Tool messages (role='tool') with content (tool results)
 *
 * For display, we need to:
 * 1. Keep user/assistant text messages as ChatMessage
 * 2. Convert each toolCall from assistant messages into a ToolCallMessage
 * 3. Match tool result messages (role='tool') to their ToolCallMessage and update result
 * 4. Filter out raw tool messages (role='tool') from display — they're merged into ToolCallMessage
 */
export function convertHistoryToDisplayItems(
  messages: ChatMessage[],
): DisplayItem[] {
  const displayItems: DisplayItem[] = [];
  const toolCallMap = new Map<string, ToolCallMessage>();

  // First pass: collect all tool calls and build the initial display list
  for (const msg of messages) {
    if (msg.role === 'tool') {
      // Tool result messages — will be merged later
      const toolCallId = msg.metadata?.toolCallId as string | undefined;
      if (toolCallId && toolCallMap.has(toolCallId)) {
        // Update the existing tool call with the result
        const toolCall = toolCallMap.get(toolCallId)!;
        toolCall.result = msg.content;
        toolCall.status = 'complete';
      }
      // Don't add tool messages to display — they're represented by ToolCallMessage
      continue;
    }

    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant message with tool calls
      // First add any text content as a regular message
      const textContent =
        typeof msg.content === 'string' ? msg.content.trim() : '';
      if (textContent) {
        displayItems.push({
          ...msg,
          toolCalls: undefined, // Remove toolCalls from the text message
        });
      }

      // Then add each tool call as a ToolCallMessage
      // Map from message.ts ToolCallStatus to ChatBase ToolCallStatus
      for (const tc of msg.toolCalls) {
        let status: ToolCallStatus = 'complete';
        if (tc.status === 'pending' || tc.status === 'awaiting-approval') {
          status = 'inProgress';
        } else if (tc.status === 'executing') {
          status = 'executing';
        } else if (tc.status === 'failed') {
          status = 'error';
        }
        const toolCallMsg: ToolCallMessage = {
          id: `tc-${tc.toolCallId}`,
          type: 'tool-call',
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args || {},
          status,
          result: tc.result,
        };
        toolCallMap.set(tc.toolCallId, toolCallMsg);
        displayItems.push(toolCallMsg);
      }
    } else {
      // Regular user/assistant/system message
      displayItems.push(msg);
    }
  }

  return displayItems;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format token count for compact display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

/**
 * Derive the API base URL from a configEndpoint.
 * configEndpoint may look like:
 *   "http://host:port/api/v1/config"     (from agentRuntimeConfig)
 *   "http://host:port/api/v1/configure"   (from Chat component)
 * We strip the trailing path segment to get "http://host:port/api/v1".
 */
export function getApiBaseFromConfig(configEndpoint: string): string {
  return configEndpoint.replace(/\/(config|configure)\/?$/, '');
}

// ---------------------------------------------------------------------------
// Protocol adapter factory
// ---------------------------------------------------------------------------

/**
 * Create protocol adapter based on configuration
 */
export function createProtocolAdapter(
  config: ProtocolConfig,
): BaseProtocolAdapter | null {
  const adapterConfig: ProtocolAdapterConfig = {
    type: config.type,
    baseUrl: config.endpoint,
    authToken: config.authToken,
    agentId: config.agentId,
    ...config.options,
  };

  switch (config.type) {
    case 'ag-ui':
      return new AGUIAdapter(adapterConfig);
    case 'a2a':
      return new A2AAdapter(adapterConfig);
    case 'vercel-ai':
      return new VercelAIAdapter(adapterConfig);
    case 'acp':
      return new ACPAdapter(adapterConfig);
    default:
      console.warn(`[ChatBase] Unknown protocol type: ${config.type}`);
      return null;
  }
}
