/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation as a run stream builds it, for every client that draws one:
 * the web chat (`ChatBase`) and Datalayer Mobile. One pure reducer over the
 * AG-UI events of an application's session or an agent's run, the events
 * every other protocol adapter is normalised into (`portable/adapterEvents`),
 * and the person's own actions.
 *
 * It reads the stream as the chat reads it — `TEXT_MESSAGE_*` into one
 * message streamed in place, `TOOL_CALL_*` into a collapsed row whose result
 * is read by `toolResultOf`, `STEP_*` into a step row, a `MESSAGES_SNAPSHOT`
 * (its tool calls and their results too) through `messagesOfThread`, a
 * `reactor.ui` op on the run refused — and adds what a session says besides:
 * `loop.session`, the question its application asks (`RUN_FINISHED` with
 * `result.asking`, LOOP `loop.ask`), and a turn that ended without words said
 * by how it ended (`answered`, `stopped`, `gone`).
 *
 * An adapter that tells a message or a tool call whole rather than by its
 * deltas — A2A, Vercel AI, ACP, the in-page agent, and the web's AG-UI
 * adapter, which accumulates — says it with three events of this reducer's
 * own, never AG-UI's: `MESSAGE_SAID` (a message's words so far),
 * `TOOL_CALL_SAID` (a call's arguments as an object) and `TOOL_CALL_DONE`
 * (its result as a value). They are refused when malformed.
 *
 * Bounded: a long tool run cannot grow it without end. Each tool's arguments
 * and result keep their first `limits.toolText` characters (their values only
 * when kept whole), an answer its first `limits.messageText`, the
 * conversation its last `limits.items` rows (`dropped` counts the rest), and
 * an event it does not draw is kept only as its type and name, the last
 * `limits.diagnostics` of them — never its payload. A phone keeps
 * `DEVICE_LIMITS`, a browser `BROWSER_LIMITS`.
 *
 * @module portable/conversation
 */

import {
  REACTOR_UI_NAME,
  toolResultOf,
  UI_ON_RUN,
  type AgUiEvent,
  type ToolResultSaid,
} from './agui';
import { displayOfToolResult, type ProtocolDisplay } from './displays';
import { RUN_END_WORDS } from './records';
import { messagesOfThread } from './thread';

/** How many rows a conversation on a phone keeps: its newest. */
export const ITEM_LIMIT = 400;
/** How many characters of an answer a phone keeps. */
export const MESSAGE_TEXT_LIMIT = 100_000;
/** How many characters of a tool's arguments, and of its result, a phone keeps. */
export const TOOL_TEXT_LIMIT = 4_000;
/** How many events it does not draw are kept, by type and name. */
export const DIAGNOSTIC_LIMIT = 50;

/** What a conversation keeps: the bounds of the device that holds it. */
export type ConversationLimits = {
  /** Rows: its newest. */
  items: number;
  /** Characters of an answer. */
  messageText: number;
  /** Characters of a tool's arguments, and of its result. */
  toolText: number;
  /** Events it does not draw, by type and name. */
  diagnostics: number;
};

/** A phone's bounds (Datalayer Mobile). */
export const DEVICE_LIMITS: ConversationLimits = {
  items: ITEM_LIMIT,
  messageText: MESSAGE_TEXT_LIMIT,
  toolText: TOOL_TEXT_LIMIT,
  diagnostics: DIAGNOSTIC_LIMIT,
};

/** A browser's bounds (the web chat): a long working session, still bounded. */
export const BROWSER_LIMITS: ConversationLimits = {
  items: 5_000,
  messageText: 1_000_000,
  toolText: 1_000_000,
  diagnostics: DIAGNOSTIC_LIMIT,
};

/** What is said after a text cut at its limit. */
export const CUT_MARK = '… (cut: too long to keep on this device)';

/** How a turn ended without words of its own: `RUN_END_WORDS`'s. */
export type TurnEnd = 'answered' | 'stopped' | 'gone';

/** What a running tool call waits for: a decision on its approval, or the person's answer. */
export type ToolAwaiting = 'approval' | 'person';

/** A Python exception a tool's code raised. */
export type ToolCodeError = { name: string; value: string; traceback: string };

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
      /** Its arguments read whole, or `null`: not yet whole, or cut. */
      input: Record<string, unknown> | null;
      status: 'running' | 'complete' | 'error';
      /** While running, what it waits for; else `null`. */
      awaiting: ToolAwaiting | null;
      /** Its result in words, cut at its limit. */
      result: string;
      /** Its result as given, what a renderer draws: `undefined` when none, or when its words were cut. */
      value: unknown;
      error: string;
      /** What failed around its code (its sandbox), in words, or `''`. */
      executionError: string;
      /** The exception its code raised, or `null`. */
      codeError: ToolCodeError | null;
      /** The exit code its code ended with (`sys.exit`), or `null`. */
      exitCode: number | null;
      /** The protocol display its result carries, read strictly (`portable/displays`, MOBILE M-037). */
      display: ProtocolDisplay | null;
    }
  | {
      kind: 'step';
      id: string;
      name: string;
      status: 'running' | 'complete';
    }
  | { kind: 'end'; id: string; end: TurnEnd; words: string }
  | { kind: 'error'; id: string; text: string };

type ToolItem = Extract<ConversationItem, { kind: 'tool' }>;

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
  /** What it keeps: its device's bounds. */
  limits: ConversationLimits;
};

/** A conversation with nothing in it yet, kept within `limits` (a phone's by default). */
export const emptyConversation = (
  limits: ConversationLimits = DEVICE_LIMITS,
): ConversationState => {
  for (const [name, bound] of Object.entries(limits)) {
    if (!Number.isInteger(bound) || bound < 1) {
      throw new Error(
        `A conversation's ${name} bound is ${String(bound)}: give a whole number of at least 1.`,
      );
    }
  }
  return {
    items: [],
    running: false,
    session: null,
    asking: null,
    dropped: 0,
    diagnostics: [],
    turnRows: 0,
    limits,
  };
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** A result as the model read it: the page's `_meta` (its display) is the card's, not words. */
function withoutMeta(result: unknown): unknown {
  if (isRecord(result) && '_meta' in result) {
    const { _meta: _page, ...view } = result;
    return view;
  }
  return result;
}

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
    schema: isRecord(schema) ? schema : null,
    accept: strings(asked.accept),
  };
}

function withItems(
  state: ConversationState,
  items: ConversationItem[],
  added = 0,
): ConversationState {
  const over = items.length - state.limits.items;
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
    diagnostics: [...state.diagnostics, entry].slice(-state.limits.diagnostics),
  };
}

let rowCount = 0;
const rowId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(rowCount += 1)}`;

/** A tool call just begun: running, nothing said of it yet. */
function toolRow(id: string, name: string): ToolItem {
  return {
    kind: 'tool',
    id,
    name,
    args: '',
    input: null,
    status: 'running',
    awaiting: null,
    result: '',
    value: undefined,
    error: '',
    executionError: '',
    codeError: null,
    exitCode: null,
    display: null,
  };
}

/** Its arguments kept: their words cut at the limit, the object only when kept whole. */
function withInput(
  item: ToolItem,
  input: Record<string, unknown>,
  limit: number,
): ToolItem {
  const words = JSON.stringify(input);
  const whole = words.length <= limit;
  return { ...item, args: cut(words, limit), input: whole ? input : null };
}

/** A human-in-the-loop call: its arguments are steps the person confirms. */
const asksThePerson = (input: Record<string, unknown> | null): boolean =>
  !!input && Array.isArray(input.steps);

/**
 * A tool call with its result: failed when the protocol, its sandbox, its
 * code or its exit code says so; still running when it waits on an approval
 * (`pending_approval`) or on the person (its steps). A result read from a
 * conversation's past is its outcome only: nothing waits there any more.
 */
function withResult(
  item: ToolItem,
  result: ToolResultSaid,
  limit: number,
  past = false,
): ToolItem {
  const given = result.result;
  const words = said(withoutMeta(given));
  const record = isRecord(given) ? given : null;
  const executionError =
    typeof record?.execution_error === 'string' ? record.execution_error : '';
  const raised = isRecord(record?.code_error) ? record.code_error : null;
  const codeError: ToolCodeError | null = raised
    ? {
        name: text(raised.name) || 'Error',
        value: text(raised.value) || 'Unknown error',
        traceback: cut(text(raised.traceback), limit),
      }
    : null;
  const exitCode =
    record && typeof record.exit_code === 'number' ? record.exit_code : null;
  const failed =
    !result.success ||
    executionError !== '' ||
    codeError !== null ||
    (exitCode !== null && exitCode !== 0) ||
    record?.execution_ok === false;
  const awaiting: ToolAwaiting | null =
    failed || past
      ? null
      : record?.pending_approval === true
        ? 'approval'
        : asksThePerson(item.input)
          ? 'person'
          : null;
  return {
    ...item,
    status: failed ? 'error' : awaiting ? 'running' : 'complete',
    awaiting,
    result: cut(words, limit),
    value: words.length <= limit ? given : undefined,
    error: result.error ?? '',
    executionError: cut(executionError, limit),
    codeError,
    exitCode,
    display: displayOfToolResult(item.name, given, item.id),
  };
}

/** The rows a conversation said again holds: its messages, and its tool calls with their results. */
function rowsOfSnapshot(
  messages: unknown,
  limits: ConversationLimits,
  unread: string[],
): ConversationItem[] {
  if (!Array.isArray(messages)) {
    throw new Error('A messages snapshot carries no list of messages.');
  }
  const rows: ConversationItem[] = [];
  const tools = new Map<string, number>();
  for (const message of messages) {
    for (const drawn of messagesOfThread([message])) {
      rows.push({
        kind: 'message',
        id: drawn.id,
        role: drawn.role === 'user' ? 'user' : 'assistant',
        text: cut(
          typeof drawn.content === 'string' ? drawn.content : '',
          limits.messageText,
        ),
        streaming: false,
      });
    }
    if (!isRecord(message)) {
      continue;
    }
    if (message.role === 'assistant' && message.toolCalls !== undefined) {
      if (!Array.isArray(message.toolCalls)) {
        throw new Error(
          `Message ${String(message.id)}'s tool calls are not a list.`,
        );
      }
      for (const call of message.toolCalls) {
        const fn = isRecord(call) ? call.function : undefined;
        if (!isRecord(call) || typeof call.id !== 'string' || !isRecord(fn)) {
          throw new Error(
            `Message ${String(message.id)} holds a tool call without its id and function.`,
          );
        }
        const argsWords = text(fn.arguments);
        let input: Record<string, unknown> | null = null;
        if (argsWords && argsWords.length <= limits.toolText) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(argsWords);
          } catch {
            parsed = undefined;
          }
          if (!isRecord(parsed)) {
            throw new Error(
              `Tool call ${call.id}'s arguments are not a JSON object.`,
            );
          }
          input = parsed;
        }
        tools.set(call.id, rows.length);
        rows.push({
          ...toolRow(call.id, text(fn.name)),
          args: cut(argsWords, limits.toolText),
          input: argsWords ? input : {},
          // Said again from the past: it ended, as its result says.
          status: 'complete',
        });
      }
    }
    if (message.role === 'tool') {
      const id = text(message.toolCallId);
      const at = tools.get(id);
      if (at === undefined) {
        // A result whose call the snapshot does not carry (a client that
        // reads words only): kept as the unread events are, by name.
        unread.push(id || 'no call');
        continue;
      }
      rows[at] = withResult(
        rows[at] as ToolItem,
        toolResultOf(message.content),
        limits.toolText,
        true,
      );
    }
  }
  return rows;
}

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
 * The conversation without some of its rows: those the person removed (a
 * turn taken away), or a message its application took back.
 */
export function withoutItems(
  state: ConversationState,
  ids: Iterable<string>,
): ConversationState {
  const drop = new Set(ids);
  return { ...state, items: state.items.filter(item => !drop.has(item.id)) };
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
        ? {
            ...item,
            status: 'error' as const,
            awaiting: null,
            error: RUN_END_WORDS[end],
          }
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
        ? { ...item, status: 'error' as const, awaiting: null }
        : item.kind === 'step' && item.status === 'running'
          ? { ...item, status: 'complete' as const }
          : item,
  );
  return withItems({ ...state, running: false }, [
    ...items,
    { kind: 'error', id: rowId('error'), text: words },
  ]);
}

/** The string field an event must carry, or a refusal that names it. */
function required(event: AgUiEvent, field: string): string {
  const value = event[field];
  if (typeof value !== 'string' || !value) {
    throw new Error(`${event.type} carries no ${field}.`);
  }
  return value;
}

/** A conversation with one more event of its stream. */
export function reduceConversation(
  state: ConversationState,
  event: AgUiEvent,
): ConversationState {
  const { limits } = state;
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
          ? { ...item, text: appended(item.text, delta, limits.messageText) }
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
            text: cut(delta, limits.messageText),
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

    case 'MESSAGE_SAID': {
      // A message told whole so far, by an adapter that accumulates it.
      const id = required(event, 'messageId');
      if (typeof event.text !== 'string') {
        throw new Error(`MESSAGE_SAID of ${id} carries no text.`);
      }
      if (event.role !== 'user' && event.role !== 'assistant') {
        throw new Error(
          `MESSAGE_SAID of ${id} is said by ${String(event.role)}: only the person or the assistant speaks here.`,
        );
      }
      const role = event.role;
      const words = cut(event.text, limits.messageText);
      const streaming = role === 'assistant' && event.streaming !== false;
      const at = state.items.findIndex(item => item.id === id);
      if (at >= 0) {
        const kept = state.items[at];
        if (kept.kind !== 'message') {
          throw new Error(`MESSAGE_SAID of ${id} names a ${kept.kind} row.`);
        }
        const items = state.items.slice();
        items[at] = { ...kept, text: words, streaming };
        return { ...state, items };
      }
      return withItems(
        state,
        [...state.items, { kind: 'message', id, role, text: words, streaming }],
        1,
      );
    }

    case 'TOOL_CALL_START': {
      const id = text(event.toolCallId) || rowId('tool');
      if (state.items.some(item => item.id === id)) {
        return state;
      }
      return withItems(
        state,
        [
          ...state.items,
          toolRow(id, text(event.toolCallName) || text(event.name)),
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
                args: appended(item.args, text(event.delta), limits.toolText),
              }
            : item,
        ) ?? state
      );

    case 'TOOL_CALL_END':
      // Its arguments are whole: read them, unless they were cut.
      return (
        changed(state, text(event.toolCallId), item => {
          if (item.kind !== 'tool' || item.args.endsWith(CUT_MARK)) {
            return item;
          }
          if (!item.args) {
            return { ...item, input: {} };
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(item.args);
          } catch {
            parsed = undefined;
          }
          if (!isRecord(parsed)) {
            return {
              ...item,
              status: 'error',
              awaiting: null,
              error: 'Its arguments are not a JSON object.',
            };
          }
          return { ...item, input: parsed };
        }) ?? state
      );

    case 'TOOL_CALL_SAID': {
      // A call's arguments told whole, by an adapter that parsed them.
      const id = required(event, 'toolCallId');
      const name = required(event, 'toolCallName');
      if (!isRecord(event.args)) {
        throw new Error(
          `TOOL_CALL_SAID of ${id} carries arguments that are not an object.`,
        );
      }
      const args = event.args;
      const at = state.items.findIndex(item => item.id === id);
      if (at < 0) {
        return withItems(
          state,
          [...state.items, withInput(toolRow(id, name), args, limits.toolText)],
          1,
        );
      }
      const kept = state.items[at];
      if (kept.kind !== 'tool') {
        throw new Error(`TOOL_CALL_SAID of ${id} names a ${kept.kind} row.`);
      }
      const items = state.items.slice();
      items[at] = withInput(
        kept,
        { ...(kept.input ?? {}), ...args },
        limits.toolText,
      );
      return { ...state, items };
    }

    case 'TOOL_CALL_RESULT': {
      const result = toolResultOf(event.content);
      return (
        changed(state, text(event.toolCallId), item =>
          item.kind === 'tool'
            ? withResult(item, result, limits.toolText)
            : item,
        ) ?? noted(state, event)
      );
    }

    case 'TOOL_CALL_DONE': {
      // A call's result as a value, by an adapter (or the page) that has it;
      // `answered` when it is the person's answer.
      const id = required(event, 'toolCallId');
      if (typeof event.success !== 'boolean') {
        throw new Error(
          `TOOL_CALL_DONE of ${id} does not say whether it succeeded.`,
        );
      }
      if (event.error !== undefined && typeof event.error !== 'string') {
        throw new Error(`TOOL_CALL_DONE of ${id} says its error in no words.`);
      }
      const result: ToolResultSaid = {
        result: event.result,
        success: event.success,
        ...(event.error !== undefined ? { error: event.error } : {}),
      };
      return (
        changed(state, id, item =>
          item.kind === 'tool'
            ? withResult(
                item,
                result,
                limits.toolText,
                // The person's own answer (an approval decided, steps
                // confirmed): nothing waits after it.
                event.answered === true,
              )
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
      const unread: string[] = [];
      const rows = rowsOfSnapshot(event.messages, limits, unread);
      const restored = withItems(
        { ...state, dropped: 0 },
        rows,
        // The conversation said again is what this turn says (a resume):
        // never also said as a wordless answer.
        1,
      );
      return unread.reduce(
        (kept, id) =>
          noted(kept, { type: 'TOOL_CALL_RESULT', name: `${id} (no call)` }),
        restored,
      );
    }

    case 'CUSTOM': {
      if (event.name === REACTOR_UI_NAME) {
        return withError(state, UI_ON_RUN);
      }
      if (event.name === 'loop.session' && isRecord(event.value)) {
        const session = event.value;
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
      const result = isRecord(event.result) ? event.result : {};
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
