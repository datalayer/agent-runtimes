/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation as a run stream builds it, for a client that draws it
 * natively (Datalayer Mobile): one pure reducer over the AG-UI events of an
 * application's session or an agent's run, and the person's own actions.
 *
 * It reads the stream as the web chat reads it — `TEXT_MESSAGE_*` into one
 * message streamed in place, `TOOL_CALL_*` into a collapsed row whose result
 * is read by `toolResultOf`, `STEP_*` into a step row, a `MESSAGES_SNAPSHOT`
 * through `messagesOfThread`, a `reactor.ui` op on the run refused — and adds
 * what a session says besides: `loop.session`, the question its application
 * asks (`RUN_FINISHED` with `result.asking`, LOOP `loop.ask`), and a turn
 * that ended without words said by how it ended (`answered`, `stopped`,
 * `gone`).
 *
 * Bounded: a long tool run cannot grow it without end. Each tool's arguments
 * and result keep their first `TOOL_TEXT_LIMIT` characters, an answer its
 * first `MESSAGE_TEXT_LIMIT`, the conversation its last `ITEM_LIMIT` rows
 * (`dropped` counts the rest), and an event it does not draw is kept only as
 * its type and name, the last `DIAGNOSTIC_LIMIT` of them — never its payload.
 *
 * @module portable/conversation
 */

import {
  REACTOR_UI_NAME,
  toolResultOf,
  UI_ON_RUN,
  type AgUiEvent,
} from './agui';
import { RUN_END_WORDS } from './records';
import { messagesOfThread } from './thread';

/** How many rows a conversation keeps: its newest. */
export const ITEM_LIMIT = 400;
/** How many characters of an answer are kept. */
export const MESSAGE_TEXT_LIMIT = 100_000;
/** How many characters of a tool's arguments, and of its result, are kept. */
export const TOOL_TEXT_LIMIT = 4_000;
/** How many events it does not draw are kept, by type and name. */
export const DIAGNOSTIC_LIMIT = 50;

/** What is said after a text cut at its limit. */
export const CUT_MARK = '… (cut: too long to keep on this device)';

/** How a turn ended without words of its own: `RUN_END_WORDS`'s. */
export type TurnEnd = 'answered' | 'stopped' | 'gone';

/** One row of a conversation. */
export type ConversationItem =
  | {
      kind: 'message';
      id: string;
      role: 'user' | 'assistant';
      text: string;
      /** Its words are still arriving. */
      streaming: boolean;
    }
  | {
      kind: 'tool';
      id: string;
      name: string;
      /** Its arguments as they streamed: JSON, cut at its limit. */
      args: string;
      status: 'running' | 'complete' | 'error';
      /** Its result in words, cut at its limit. */
      result: string;
      error: string;
    }
  | {
      kind: 'step';
      id: string;
      name: string;
      status: 'running' | 'complete';
    }
  | { kind: 'end'; id: string; end: TurnEnd; words: string }
  | { kind: 'error'; id: string; text: string };

/** What an application asks the person (`loop.ask`): its kind and what answers it. */
export type ConversationQuestion = {
  kind: 'text' | 'choice' | 'form' | 'file';
  prompt: string;
  /** A choice's options. */
  options: string[];
  /** A form's JSON Schema. */
  schema: Record<string, unknown> | null;
  /** A file's kinds. */
  accept: string[];
};

/** A conversation, as the stream and the person built it. */
export type ConversationState = {
  items: ConversationItem[];
  /** A turn is streaming. */
  running: boolean;
  /** The session as `loop.session` said it last, or `null` (an agent's run). */
  session: Record<string, unknown> | null;
  /** What the application waits for an answer to, or `null`. */
  asking: ConversationQuestion | null;
  /** How many of its oldest rows were not kept. */
  dropped: number;
  /** The events it does not draw, by type and name only. */
  diagnostics: { type: string; name: string }[];
  /** How many rows the turn streaming added: whether it said anything. */
  turnRows: number;
};

/** A conversation with nothing in it yet. */
export const emptyConversation = (): ConversationState => ({
  items: [],
  running: false,
  session: null,
  asking: null,
  dropped: 0,
  diagnostics: [],
  turnRows: 0,
});

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const cut = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, limit)}${CUT_MARK}` : value;

/** Text appended to what is kept, never past its limit. */
const appended = (kept: string, delta: string, limit: number): string => {
  if (kept.endsWith(CUT_MARK)) {
    return kept;
  }
  return cut(kept + delta, limit);
};

/** A result in words. */
function said(result: unknown): string {
  if (result === undefined || result === null) {
    return '';
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/** The question an application asks, as `RUN_FINISHED`'s `result.asking` or a session says it. */
export function questionOf(raw: unknown): ConversationQuestion | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const asked = raw as Record<string, unknown>;
  const kind = asked.kind;
  if (
    kind !== 'text' &&
    kind !== 'choice' &&
    kind !== 'form' &&
    kind !== 'file'
  ) {
    throw new Error(
      `The application asks something no client knows: ${String(kind)}.`,
    );
  }
  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  const schema = asked.schema;
  return {
    kind,
    prompt: text(asked.prompt),
    options: strings(asked.options),
    schema:
      schema && typeof schema === 'object' && !Array.isArray(schema)
        ? (schema as Record<string, unknown>)
        : null,
    accept: strings(asked.accept),
  };
}

function withItems(
  state: ConversationState,
  items: ConversationItem[],
  added = 0,
): ConversationState {
  const over = items.length - ITEM_LIMIT;
  return {
    ...state,
    items: over > 0 ? items.slice(over) : items,
    dropped: state.dropped + Math.max(0, over),
    turnRows: state.turnRows + added,
  };
}

function changed(
  state: ConversationState,
  id: string,
  change: (item: ConversationItem) => ConversationItem,
): ConversationState | null {
  const at = state.items.findIndex(item => item.id === id);
  if (at < 0) {
    return null;
  }
  const items = state.items.slice();
  items[at] = change(items[at]);
  return { ...state, items };
}

function noted(state: ConversationState, event: AgUiEvent): ConversationState {
  const entry = {
    type: event.type,
    name: text(event.name) || text(event.activityType),
  };
  return {
    ...state,
    diagnostics: [...state.diagnostics, entry].slice(-DIAGNOSTIC_LIMIT),
  };
}

let rowCount = 0;
const rowId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(rowCount += 1)}`;

/** The person's prompt, added before it is sent: its own row. */
export function withPrompt(
  state: ConversationState,
  id: string,
  words: string,
): ConversationState {
  return withItems({ ...state, asking: null }, [
    ...state.items,
    { kind: 'message', id, role: 'user', text: words, streaming: false },
  ]);
}

/**
 * The turn ended without the stream saying so: the person stopped it
 * (`stopped`), or its client went before the answer (`gone`). What streamed
 * stops streaming; a turn that said nothing is said by how it ended.
 */
export function withTurnEnded(
  state: ConversationState,
  end: Exclude<TurnEnd, 'answered'>,
): ConversationState {
  const items = state.items.map(item =>
    item.kind === 'message' && item.streaming
      ? { ...item, streaming: false }
      : item.kind === 'tool' && item.status === 'running'
        ? { ...item, status: 'error' as const, error: RUN_END_WORDS[end] }
        : item.kind === 'step' && item.status === 'running'
          ? { ...item, status: 'complete' as const }
          : item,
  );
  const ended = { ...state, items, running: false };
  return withItems(ended, [
    ...items,
    { kind: 'end', id: rowId('end'), end, words: RUN_END_WORDS[end] },
  ]);
}

/** A failure said in the conversation (a refusal, a stream cut short): the turn stops with it. */
export function withError(
  state: ConversationState,
  words: string,
): ConversationState {
  const items = state.items.map(item =>
    item.kind === 'message' && item.streaming
      ? { ...item, streaming: false }
      : item.kind === 'tool' && item.status === 'running'
        ? { ...item, status: 'error' as const }
        : item.kind === 'step' && item.status === 'running'
          ? { ...item, status: 'complete' as const }
          : item,
  );
  return withItems({ ...state, running: false }, [
    ...items,
    { kind: 'error', id: rowId('error'), text: words },
  ]);
}

/** A conversation with one more event of its stream. */
export function reduceConversation(
  state: ConversationState,
  event: AgUiEvent,
): ConversationState {
  switch (event.type) {
    case 'RUN_STARTED':
      return { ...state, running: true, asking: null, turnRows: 0 };

    case 'TEXT_MESSAGE_START': {
      const id = text(event.messageId) || rowId('message');
      if (state.items.some(item => item.id === id)) {
        return state;
      }
      const role = event.role === 'user' ? 'user' : 'assistant';
      return withItems(
        state,
        [
          ...state.items,
          { kind: 'message', id, role, text: '', streaming: true },
        ],
        1,
      );
    }

    case 'TEXT_MESSAGE_CONTENT':
    case 'TEXT_MESSAGE_CHUNK': {
      const delta = text(event.delta);
      const id = text(event.messageId);
      const grown = changed(state, id, item =>
        item.kind === 'message'
          ? { ...item, text: appended(item.text, delta, MESSAGE_TEXT_LIMIT) }
          : item,
      );
      if (grown) {
        return grown;
      }
      return withItems(
        state,
        [
          ...state.items,
          {
            kind: 'message',
            id: id || rowId('message'),
            role: event.role === 'user' ? 'user' : 'assistant',
            text: cut(delta, MESSAGE_TEXT_LIMIT),
            streaming: event.type === 'TEXT_MESSAGE_CONTENT',
          },
        ],
        1,
      );
    }

    case 'TEXT_MESSAGE_END':
      return (
        changed(state, text(event.messageId), item =>
          item.kind === 'message' ? { ...item, streaming: false } : item,
        ) ?? state
      );

    case 'TOOL_CALL_START': {
      const id = text(event.toolCallId) || rowId('tool');
      if (state.items.some(item => item.id === id)) {
        return state;
      }
      return withItems(
        state,
        [
          ...state.items,
          {
            kind: 'tool',
            id,
            name: text(event.toolCallName) || text(event.name),
            args: '',
            status: 'running',
            result: '',
            error: '',
          },
        ],
        1,
      );
    }

    case 'TOOL_CALL_ARGS':
      return (
        changed(state, text(event.toolCallId), item =>
          item.kind === 'tool'
            ? {
                ...item,
                args: appended(item.args, text(event.delta), TOOL_TEXT_LIMIT),
              }
            : item,
        ) ?? state
      );

    case 'TOOL_CALL_END':
      return state;

    case 'TOOL_CALL_RESULT': {
      const result = toolResultOf(event.content);
      return (
        changed(state, text(event.toolCallId), item =>
          item.kind === 'tool'
            ? {
                ...item,
                status: result.success ? 'complete' : 'error',
                result: cut(said(result.result), TOOL_TEXT_LIMIT),
                error: result.error ?? '',
              }
            : item,
        ) ?? noted(state, event)
      );
    }

    case 'STEP_STARTED': {
      const name = text(event.stepName) || text(event.name);
      return withItems(
        state,
        [
          ...state.items,
          { kind: 'step', id: rowId('step'), name, status: 'running' },
        ],
        1,
      );
    }

    case 'STEP_FINISHED': {
      const name = text(event.stepName) || text(event.name);
      const at = state.items
        .map((item, index) => ({ item, index }))
        .reverse()
        .find(
          ({ item }) =>
            item.kind === 'step' &&
            item.name === name &&
            item.status === 'running',
        );
      if (!at) {
        return noted(state, event);
      }
      const items = state.items.slice();
      items[at.index] = {
        ...(at.item as Extract<ConversationItem, { kind: 'step' }>),
        status: 'complete',
      };
      return { ...state, items };
    }

    case 'MESSAGES_SNAPSHOT': {
      const messages = messagesOfThread(event.messages);
      return withItems(
        { ...state, dropped: 0 },
        messages.map(message => ({
          kind: 'message' as const,
          id: message.id,
          role:
            message.role === 'user'
              ? ('user' as const)
              : ('assistant' as const),
          text: cut(
            typeof message.content === 'string' ? message.content : '',
            MESSAGE_TEXT_LIMIT,
          ),
          streaming: false,
        })),
        // The conversation said again is what this turn says (a resume):
        // never also said as a wordless answer.
        1,
      );
    }

    case 'CUSTOM': {
      if (event.name === REACTOR_UI_NAME) {
        return withError(state, UI_ON_RUN);
      }
      if (
        event.name === 'loop.session' &&
        event.value &&
        typeof event.value === 'object'
      ) {
        const session = event.value as Record<string, unknown>;
        return {
          ...state,
          session,
          asking: questionOf(session.asking) ?? state.asking,
        };
      }
      return noted(state, event);
    }

    case 'ACTIVITY_SNAPSHOT':
    case 'ACTIVITY_DELTA':
      if (event.activityType === REACTOR_UI_NAME) {
        return withError(state, UI_ON_RUN);
      }
      return noted(state, event);

    case 'RUN_FINISHED': {
      const result =
        event.result && typeof event.result === 'object'
          ? (event.result as Record<string, unknown>)
          : {};
      const asking = questionOf(result.asking);
      const items = state.items.map(item =>
        item.kind === 'message' && item.streaming
          ? { ...item, streaming: false }
          : item,
      );
      const finished = { ...state, items, running: false, asking };
      if (asking || state.turnRows > 0) {
        return finished;
      }
      // Answered without a word: said by how it ended (RUN_END_WORDS).
      return withItems(finished, [
        ...items,
        {
          kind: 'end',
          id: rowId('end'),
          end: 'answered',
          words: RUN_END_WORDS.answered,
        },
      ]);
    }

    case 'RUN_ERROR':
      return withError(state, text(event.message) || 'Run failed');

    default:
      return noted(state, event);
  }
}

/** The question in words with what answers it, for a screen reader or a row. */
export function questionWords(question: ConversationQuestion): string {
  switch (question.kind) {
    case 'choice':
      return `${question.prompt} (${question.options.join(' or ')})`;
    case 'file':
      return `${question.prompt} (a file: ${question.accept.join(', ') || 'any file'})`;
    default:
      return question.prompt;
  }
}

/** The fields a form question asks, in order, with their titles: what a native form draws. */
export function formFieldsOf(schema: Record<string, unknown> | null): {
  name: string;
  title: string;
  type: string;
  options: string[];
  required: boolean;
}[] {
  const properties =
    schema?.properties && typeof schema.properties === 'object'
      ? (schema.properties as Record<string, Record<string, unknown>>)
      : {};
  const required = Array.isArray(schema?.required)
    ? (schema?.required as unknown[])
    : [];
  return Object.entries(properties).map(([name, field]) => ({
    name,
    title: text(field?.title) || name,
    type: text(field?.type) || 'string',
    options: Array.isArray(field?.enum) ? field.enum.map(String) : [],
    required: required.includes(name),
  }));
}
