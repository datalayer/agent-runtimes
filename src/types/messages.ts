/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Message types for chat component.
 * Based on AG-UI protocol message format for interoperability.
 *
 * @module types/messages
 */

/**
 * Message role enumeration
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call status for tracking execution state
 */
export type ToolCallStatus =
  'pending' | 'executing' | 'completed' | 'failed' | 'awaiting-approval';

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
 * Who said a message, when a chat holds more than one non-user voice — a
 * team's supervisor and its members, not just "the assistant".
 *
 * Attaching one to a message is what tells `ChatMessageList` to draw a named,
 * coloured header instead of the single generic assistant look; a message
 * with no `speaker` renders exactly as it always has.
 */
export interface MessageSpeaker {
  /** Stable id, e.g. an agent id — not shown, but keeps two same-named speakers apart. */
  id: string;
  name: string;
  /** A short label under the name, e.g. "supervisor" or a capability. */
  role?: string;
  /**
   * The Primer colour family this speaker is drawn in — `'accent'`,
   * `'success'`, `'attention'`, `'severe'`, `'sponsors'`, `'neutral'`, or any
   * other family `sx` resolves as `<tone>.emphasis` / `.subtle` / `.muted` /
   * `.fg`. Omitted or `'neutral'` falls back to the chat's neutral tones.
   */
  tone?: string;
  /** Up to two letters shown in the avatar in place of the default icon. */
  initials?: string;
}

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

  /**
   * Who said this message, when the chat has more than one voice. See
   * {@link MessageSpeaker}.
   */
  speaker?: MessageSpeaker;

  /**
   * Who this message is addressed to — one agent hanging another its brief,
   * or a person steering an agent already at work. Shown in the header as
   * "<speaker> asks/steers <directedTo>"; ignored without `speaker`.
   */
  directedTo?: MessageSpeaker;

  /**
   * `true` for a person's instruction to an agent already working, `false`
   * (or omitted) for a delegation. Only meaningful with `directedTo`, where
   * it chooses "steers" over "asks".
   */
  steer?: boolean;

  /**
   * Short labels for tools this message's turn called, shown as small chips
   * above the text — lighter than a full tool-call card, for a turn already
   * known to have finished rather than one awaiting approval.
   */
  toolChips?: string[];

  /**
   * Still being written: the speaker is working and this message is not its
   * settled content yet. With no text yet, `ChatMessageList` shows a typing
   * indicator in its place.
   */
  live?: boolean;

  /**
   * Renders this message as a distinct aside — centred, pill-shaped, no
   * avatar or side — rather than as a speech bubble. For a wait, a failure or
   * a stop: something that happened to a part of the conversation, not
   * something a speaker said.
   */
  note?: 'waiting' | 'failed' | 'stopped';

  /** Optional metadata */
  metadata?: Record<string, unknown>;

  /** Tool calls for assistant messages */
  toolCalls?: ToolCallContentPart[];

  /** For activity messages (A2A, A2UI, etc.) */
  activityType?: string;
  activityData?: unknown;
}

/**
 * Streaming options for custom message handlers.
 * Enables streaming response support with chunk callbacks.
 */
export interface StreamingMessageOptions {
  /** Callback for each chunk of streamed content */
  onChunk?: (chunk: string) => void;
  /** Callback when streaming is complete */
  onComplete?: (fullResponse: string) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Custom message handler type for props-based mode.
 * Supports both simple and streaming response patterns.
 */
export type MessageHandler = (
  message: string,
  messages: ChatMessage[],
  options?: StreamingMessageOptions,
) => Promise<string | void>;

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
