/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What every protocol adapter says, as the conversation reducer reads it
 * (MOBILE M-030): the web chat's message state is `reduceConversation`'s,
 * whatever protocol its agent speaks.
 *
 * ## What the adapters say (the inventory)
 *
 * Every adapter under `src/protocols` turns its wire into the same
 * `ProtocolEvent`s, and `ChatBase` read only those:
 *
 * | Adapter | Messages | Tool calls | Results | Ends |
 * |---|---|---|---|---|
 * | AG-UI (`AGUIAdapter`) | `message`, its words so far, at each `TEXT_MESSAGE_CONTENT` and at `TEXT_MESSAGE_END`; a fresh id per `TEXT_MESSAGE_START` | `tool-call` at `TOOL_CALL_START` (`{}`, `argsComplete: false`), again at `TOOL_CALL_END` with the parsed arguments | `tool-result` from `TOOL_CALL_RESULT` through `toolResultOf` | `done` at `RUN_FINISHED` with no frontend call pending; `error` at `RUN_ERROR`; `CUSTOM` as `activity`, `STATE_*` as `state-update` |
 * | Vercel AI (`VercelAIAdapter`) | `message`, its words so far, per `text-delta`, again at `finish-step`/`finish`/`[DONE]` | `tool-call` at `tool-input-available` (whole, `argsComplete: true`) or `tool-call` | `tool-result` at `tool-output-available`/`tool-output-error`; a `pending_approval` result for a server call left waiting at `finish` | `done` at `finish`/`[DONE]`; `error` |
 * | A2A (`A2AAdapter`) | `message`, a whole part's text, a fresh id each | — | — | `state-update` with the task's final state; `activity` for data parts (A2UI) |
 * | ACP (`ACPAdapter`) | `message`, its words so far | `tool-call` | `tool-result` | `activity`; `error` |
 * | In-page agent (`BrowserAgentAdapter`) | `message`, its words so far | `tool-call` | `tool-result` | `done`; `error` |
 *
 * Every adapter that runs a frontend tool emits its result too when the page
 * sends it (`sendToolResult`). ChatBase kept, per adapter alike: the messages
 * by id, written over with each message's words so far (sanitised of a
 * model's leaked call markup); the tool calls by id, their arguments merged,
 * their status from the result (failed for an error, a sandbox's execution
 * error, a code error, a non-zero exit code or `execution_ok: false`; still
 * running while `pending_approval` or while the person confirms its steps); a
 * `state-update` completing the newest running call with the state as its
 * result; stop marking running calls interrupted; history restored from the
 * runtime's messages (tool calls and their results merged into cards).
 *
 * ## The normalisation
 *
 * `conversationEventsOf` says each `ProtocolEvent` as the reducer's input: a
 * message as `MESSAGE_SAID`, a call as `TOOL_CALL_SAID`, a result as
 * `TOOL_CALL_DONE`, `done` as `RUN_FINISHED`, `error` as `RUN_ERROR`, an
 * activity as `CUSTOM` (so `loop.session` is the session's here too).
 * `snapshotOfMessages` says a conversation read again as one AG-UI
 * `MESSAGES_SNAPSHOT`, its tool calls and their results with it. Both refuse
 * what is malformed, in a sentence.
 *
 * @module portable/adapterEvents
 */

import type { AgUiEvent } from './agui';
import type { ConversationState } from './conversation';

/** One event of a protocol adapter (`ProtocolEvent`), as far as the conversation reads it. */
export type AdapterEvent = {
  type: string;
  data?: unknown;
  message?: { id?: unknown; role?: unknown; content?: unknown };
  toolCall?: {
    toolCallId?: unknown;
    toolName?: unknown;
    args?: unknown;
    argsComplete?: boolean;
  };
  toolResult?: {
    toolCallId?: unknown;
    success?: unknown;
    result?: unknown;
    error?: unknown;
  };
  activity?: { type: string; data: unknown };
  error?: { message?: string };
};

/** One message of a conversation read again (`ChatMessage`), as far as the conversation reads it. */
export type SaidMessage = {
  id: string;
  role: string;
  content: unknown;
  toolCalls?: {
    toolCallId: string;
    toolName: string;
    args?: Record<string, unknown>;
    status?: string;
    result?: unknown;
  }[];
  metadata?: Record<string, unknown>;
};

/**
 * An answer without the call markup a model sometimes writes into its words
 * (`<calls>`, `<invoke>`, `<parameter>` and their fragments).
 */
export function sanitizeAssistantContent(content: string): string {
  if (!content || !content.includes('<')) {
    return content;
  }

  let sanitized = content;

  // Remove complete blocks first.
  sanitized = sanitized
    .replace(/<\s*calls\b[\s\S]*?<\s*\/\s*calls\s*>/gi, '')
    .replace(
      /<\s*(?:an:)?tml:invoke\b[\s\S]*?<\s*\/\s*(?:an:)?tml:invoke\s*>/gi,
      '',
    )
    .replace(
      /<\s*(?:an:)?tml:parameter\b[\s\S]*?<\s*\/\s*(?:an:)?tml:parameter\s*>/gi,
      '',
    );

  // Remove standalone/open/close tags and malformed tag fragments.
  sanitized = sanitized
    .replace(/<\s*\/?\s*(?:an:[a-z_]+|tml:[a-z_]+|calls)\b[^>]*>?/gi, '')
    .replace(/<\s*\/\s*>/g, '')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitized;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * The call a `state-update` answers: the newest still running that waits on
 * neither an approval nor the person's steps — a tool that answers by setting
 * the shared state (AG-UI `STATE_SNAPSHOT`).
 */
function stateAnswers(state: ConversationState): string | null {
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (
      item.kind === 'tool' &&
      item.status === 'running' &&
      item.awaiting !== 'approval'
    ) {
      // A call the person confirms (its steps) waits on them.
      return item.input && Array.isArray(item.input.steps) ? null : item.id;
    }
  }
  return null;
}

/**
 * One adapter event as the reducer's input, given the conversation it comes
 * to (a `state-update` answers its newest running call). Nothing for what is
 * not the conversation's: a connection's coming and going, a usage count.
 * Throws, in a sentence, for an event that does not say what its type needs.
 */
export function conversationEventsOf(
  event: AdapterEvent,
  state: ConversationState,
): AgUiEvent[] {
  switch (event.type) {
    case 'connected':
    case 'disconnected':
      return [];

    case 'message': {
      const message = event.message;
      if (message === undefined) {
        // Only its usage: the turn's count, not its words.
        return [];
      }
      if (typeof message.id !== 'string' || !message.id) {
        throw new Error('A message came without its id.');
      }
      if (message.role !== 'user' && message.role !== 'assistant') {
        throw new Error(
          `Message ${message.id} is said by ${String(message.role)}: only the person or the assistant speaks here.`,
        );
      }
      if (typeof message.content !== 'string') {
        throw new Error(`Message ${message.id} says no words.`);
      }
      return [
        {
          type: 'MESSAGE_SAID',
          messageId: message.id,
          role: message.role,
          text:
            message.role === 'assistant'
              ? sanitizeAssistantContent(message.content)
              : message.content,
        },
      ];
    }

    case 'tool-call': {
      const call = event.toolCall;
      if (
        !call ||
        typeof call.toolCallId !== 'string' ||
        !call.toolCallId ||
        typeof call.toolName !== 'string' ||
        !call.toolName
      ) {
        throw new Error('A tool call came without its id and its name.');
      }
      if (!isRecord(call.args)) {
        throw new Error(
          `Tool call ${call.toolCallId}'s arguments are not an object.`,
        );
      }
      return [
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: call.toolCallId,
          toolCallName: call.toolName,
          args: call.args,
        },
      ];
    }

    case 'tool-result': {
      const result = event.toolResult;
      if (
        !result ||
        typeof result.toolCallId !== 'string' ||
        !result.toolCallId
      ) {
        throw new Error('A tool result came without the id of its call.');
      }
      if (typeof result.success !== 'boolean') {
        throw new Error(
          `Tool result of ${result.toolCallId} does not say whether it succeeded.`,
        );
      }
      if (result.error !== undefined && typeof result.error !== 'string') {
        throw new Error(
          `Tool result of ${result.toolCallId} says its error in no words.`,
        );
      }
      return [
        {
          type: 'TOOL_CALL_DONE',
          toolCallId: result.toolCallId,
          success: result.success,
          result: result.result,
          ...(result.error !== undefined ? { error: result.error } : {}),
        },
      ];
    }

    case 'state-update': {
      const data = event.data;
      const answers = data ? stateAnswers(state) : null;
      if (!answers) {
        return [];
      }
      const shared = isRecord(data) ? data : {};
      return [
        {
          type: 'TOOL_CALL_DONE',
          toolCallId: answers,
          success: true,
          result: shared.weather ?? shared.result ?? shared.toolResult ?? data,
        },
      ];
    }

    case 'activity': {
      if (!event.activity || typeof event.activity.type !== 'string') {
        throw new Error('An activity came without its type.');
      }
      return [
        {
          type: 'CUSTOM',
          name: event.activity.type,
          value: event.activity.data,
        },
      ];
    }

    case 'done':
      return [{ type: 'RUN_FINISHED' }];

    case 'error':
      return [
        { type: 'RUN_ERROR', message: event.error?.message || 'Run failed' },
      ];

    default:
      throw new Error(`An adapter said ${event.type}, which no client reads.`);
  }
}

/** A tool call read again, as an AG-UI assistant message says it. */
function callOf(
  call: NonNullable<SaidMessage['toolCalls']>[number],
  messageId: string,
): Record<string, unknown> {
  if (typeof call.toolCallId !== 'string' || !call.toolCallId) {
    throw new Error(`Message ${messageId} holds a tool call without its id.`);
  }
  return {
    id: call.toolCallId,
    type: 'function',
    function: {
      name: call.toolName,
      arguments: JSON.stringify(call.args ?? {}),
    },
  };
}

/**
 * A conversation read again (the runtime's messages, a thread given, the
 * messages a store kept) as one AG-UI `MESSAGES_SNAPSHOT`: its words, its
 * tool calls and their results, which `role: 'tool'` messages carry (their
 * call's id in `metadata.toolCallId`) or a call carries itself. An answer's
 * words are sanitised as they were when it streamed. Throws for a message by
 * anyone else, and for a call still under way: the past has none.
 */
export function snapshotOfMessages(
  messages: readonly SaidMessage[],
): AgUiEvent {
  const said: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (message.role === 'tool') {
      const toolCallId = message.metadata?.toolCallId;
      if (typeof toolCallId !== 'string' || !toolCallId) {
        throw new Error(
          `Tool result ${message.id} does not say which call it answers.`,
        );
      }
      said.push({
        id: message.id,
        role: 'tool',
        toolCallId,
        content: message.content,
      });
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new Error(
        `Message ${message.id} is said by ${message.role}: only the person, the assistant and its tools speak here.`,
      );
    }
    const words =
      typeof message.content === 'string'
        ? message.role === 'assistant'
          ? sanitizeAssistantContent(message.content)
          : message.content
        : '';
    const calls = message.role === 'assistant' ? (message.toolCalls ?? []) : [];
    said.push({
      id: message.id,
      role: message.role,
      content: words,
      ...(calls.length
        ? { toolCalls: calls.map(call => callOf(call, message.id)) }
        : {}),
    });
    for (const call of calls) {
      if (
        call.status !== undefined &&
        call.status !== 'completed' &&
        call.status !== 'failed'
      ) {
        throw new Error(
          `Tool call ${call.toolCallId} is read again ${call.status}: a conversation's past holds no call under way.`,
        );
      }
      if (call.result !== undefined || call.status === 'failed') {
        said.push({
          id: `${call.toolCallId}-result`,
          role: 'tool',
          toolCallId: call.toolCallId,
          content:
            call.status === 'failed'
              ? { success: false, error: 'failed', result: call.result ?? null }
              : call.result,
        });
      }
    }
  }
  return { type: 'MESSAGES_SNAPSHOT', messages: said };
}
