/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Message types for chat component.
 * Based on AG-UI protocol message format for interoperability.
 *
 * @module components/chat/types/message
 */

/**
 * Message role enumeration
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call status for tracking execution state
 */
export type ToolCallStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'awaiting-approval';

/**
 * Content part types for multi-modal messages
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image';
  url: string;
  alt?: string;
}

export interface ToolCallContentPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
}

export interface ToolResultContentPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface ActivityContentPart {
  type: 'activity';
  activityType: string;
  data: unknown;
}

export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | ToolCallContentPart
  | ToolResultContentPart
  | ActivityContentPart;

/**
 * Core message interface
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;

  /** Message role */
  role: MessageRole;

  /** Message content - can be string or structured parts */
  content: string | ContentPart[];

  /** Timestamp when message was created */
  createdAt: Date;

  /** Optional agent name for multi-agent scenarios */
  agentName?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;

  /** Tool calls for assistant messages */
  toolCalls?: ToolCallContentPart[];

  /** For activity messages (A2A, A2UI, etc.) */
  activityType?: string;
  activityData?: unknown;
}

/**
 * Message input for sending new messages
 */
export interface ChatMessageInput {
  role: MessageRole;
  content: string | ContentPart[];
  metadata?: Record<string, unknown>;
}

/**
 * Streaming message delta for incremental updates
 */
export interface ChatMessageDelta {
  messageId: string;
  delta: {
    content?: string;
    toolCalls?: Partial<ToolCallContentPart>[];
  };
}

/**
 * Conversation thread metadata
 */
export interface ChatThread {
  id: string;
  title?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new user message
 */
export function createUserMessage(
  content: string,
  metadata?: Record<string, unknown>,
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    createdAt: new Date(),
    metadata,
  };
}

/**
 * Create a new assistant message
 */
export function createAssistantMessage(
  content: string,
  options?: {
    agentName?: string;
    toolCalls?: ToolCallContentPart[];
    metadata?: Record<string, unknown>;
  },
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    createdAt: new Date(),
    agentName: options?.agentName,
    toolCalls: options?.toolCalls,
    metadata: options?.metadata,
  };
}

/**
 * Create an activity message (for A2A, A2UI protocols)
 */
export function createActivityMessage(
  activityType: string,
  activityData: unknown,
  metadata?: Record<string, unknown>,
): ChatMessage {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content: [{ type: 'activity', activityType, data: activityData }],
    createdAt: new Date(),
    activityType,
    activityData,
    metadata,
  };
}
