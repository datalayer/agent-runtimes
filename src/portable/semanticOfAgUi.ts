/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A session's AG-UI events reduced to the semantic events a chat host
 * renders (`semantic.ts`, version 1). A stream is read with `AgUiFrames` or
 * `readRunStream` (`agui.ts`); this says what each event means to a host.
 *
 * The runtime's `loop.turn` event says which turn a stream is and where it
 * stands (`running`, `finished`, `failed`: agent_runtimes/loop/apps/
 * external_turns.py); a stopped session's stream ends without a run end,
 * so `stop` is never read from an event: the host that pressed Stop says it.
 * A question is read from `RUN_FINISHED.result.asking` only: the run stream
 * carries no `loop.ask` event (that is the record's word, `record.py`).
 *
 * Moved from the Slack service (DC-005, S-205).
 *
 * @module portable/semanticOfAgUi
 */

import type { AgUiEvent } from './agui';
import type { AskQuestion, SemanticEvent } from './semantic';

/** What one turn says of itself: its id, and whether it is a replay. */
export type TurnInfo = Readonly<{
  replayed: boolean;
  session: string;
  state: string;
  turn: string;
}>;

/** A string field of an event, or the fallback: never an object stringified. */
const stringOf = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The turn a `loop.turn` event names, or `undefined` for any other event. */
export function turnOf(event: AgUiEvent): TurnInfo | undefined {
  if (event.type !== 'CUSTOM' || event.name !== 'loop.turn') {
    return undefined;
  }
  const value = isRecord(event.value) ? event.value : {};
  return {
    replayed: value.replayed === true,
    session: stringOf(value.session),
    state: stringOf(value.state),
    turn: stringOf(value.turn),
  };
}

/** What a tool's result says of itself: JSON when it is JSON, else nothing. */
function resultRecord(content: unknown): Record<string, unknown> | undefined {
  if (isRecord(content)) {
    return content;
  }
  if (typeof content !== 'string') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The question a turn ends on (`RUN_FINISHED.result.asking`), as
 * a host asks it, or `undefined` when the value is not a question. A kind a
 * host does not know is answered in Datalayer, as a form (SLACK S-307):
 * never guessed to be text. (`conversation.ts`'s `questionOf`, for a native
 * client, throws on such a kind instead.)
 */
export function askQuestionOf(value: unknown): AskQuestion | undefined {
  if (!isRecord(value) || typeof value.prompt !== 'string') {
    return undefined;
  }
  const kind =
    value.kind === 'text' ||
    value.kind === 'choice' ||
    value.kind === 'file' ||
    value.kind === 'form'
      ? value.kind
      : 'form';
  const options = Array.isArray(value.options)
    ? value.options.filter((one): one is string => typeof one === 'string')
    : undefined;
  return kind === 'choice'
    ? { kind, prompt: value.prompt, options: options ?? [] }
    : { kind, prompt: value.prompt };
}

/**
 * The semantic events (version 1) one AG-UI event means: none for an event a
 * host does not show. `tools` keeps each running call's name by its id, for
 * its result.
 */
export function semanticOf(
  event: AgUiEvent,
  tools: Map<string, string>,
): SemanticEvent[] {
  switch (event.type) {
    case 'TEXT_MESSAGE_CONTENT':
    case 'TEXT_MESSAGE_CHUNK':
      return typeof event.delta === 'string' && event.delta
        ? [{ kind: 'text', text: event.delta }]
        : [];
    case 'TOOL_CALL_START': {
      const id = stringOf(event.toolCallId);
      const name = stringOf(event.toolCallName, 'a tool');
      tools.set(id, name);
      return [{ kind: 'tool', id, name, status: 'running' }];
    }
    case 'TOOL_CALL_RESULT': {
      const id = stringOf(event.toolCallId);
      const name = tools.get(id) ?? 'a tool';
      const result = resultRecord(event.content);
      if (result?.pending_approval === true) {
        return [{ kind: 'approval', toolCallId: id, toolName: name }];
      }
      const failed = result?.success === false || result?.isError === true;
      return [
        { kind: 'tool', id, name, status: failed ? 'failed' : 'complete' },
      ];
    }
    case 'STEP_STARTED':
      return typeof event.stepName === 'string' && event.stepName
        ? [{ kind: 'progress', label: event.stepName }]
        : [];
    case 'RUN_FINISHED': {
      const asking = askQuestionOf(
        isRecord(event.result) ? event.result.asking : undefined,
      );
      return asking
        ? [{ kind: 'ask', question: asking }]
        : [{ kind: 'completion' }];
    }
    case 'RUN_ERROR':
      return [
        { kind: 'error', message: stringOf(event.message, 'The run failed.') },
      ];
    default:
      return [];
  }
}
