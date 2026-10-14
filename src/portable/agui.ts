/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An AG-UI run stream as any JavaScript runtime reads it: the
 * `text/event-stream` frames a run answers, read into AG-UI events, and how a
 * run is known to have ended. The web chat's `AGUIAdapter` and Datalayer
 * Mobile read a stream with these, so that a stream is read one way.
 *
 * No React, DOM, Node or Reactor module: a phone passes a `fetch` whose
 * response body streams (Expo's `expo/fetch`).
 *
 * @module portable/agui
 */

/** One AG-UI event, as a run stream carries it (`type` first, its fields beside it). */
export type AgUiEvent = { type: string; [field: string]: unknown };

/** What the page says when a run's stream closes before the run said how it ended. */
export const RUN_CUT_SHORT =
  'The run stopped before it finished, without an answer or an error: send it again.';

/**
 * The name of `reactor.ui` (Reactor's `AGUI_NAME`): its ops come over the
 * conversation's ui socket, never a run stream (REACTOR_UI RU-W). Held here
 * so that a reader of a run needs no Reactor module; a test holds it to
 * Reactor's.
 */
export const REACTOR_UI_NAME = 'reactor.ui';

/** What the page says when a `reactor.ui` op comes on a run stream. */
export const UI_ON_RUN =
  'A reactor.ui op came on the run stream: it comes over the ui socket (REACTOR_UI RU-W).';

/** What is said when the `fetch` given cannot read a response as it streams. */
export const NOT_STREAMING =
  'This fetch does not stream a response: give one whose response body has getReader (expo/fetch on a phone).';

/** Whether an event ends a run: the run said how it ended. */
export const endsRun = (event: AgUiEvent): boolean =>
  event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR';

/**
 * The `text/event-stream` of a run, read as it arrives: text in, one AG-UI
 * event out per frame. A frame is its `data:` lines up to a blank line; a
 * frame whose data is not JSON is handed to `malformed`, never guessed at.
 */
export class AgUiFrames {
  private buffer = '';
  private data: string[] = [];

  constructor(private readonly malformed: (data: string) => void = () => {}) {}

  /** The events the text completes. */
  push(text: string): AgUiEvent[] {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    const events: AgUiEvent[] = [];
    for (const line of lines) {
      this.line(line, events);
    }
    return events;
  }

  /** The events left when the stream closes: a last frame without its blank line. */
  end(): AgUiEvent[] {
    const events: AgUiEvent[] = [];
    if (this.buffer) {
      this.line(this.buffer, events);
      this.buffer = '';
    }
    this.dispatch(events);
    return events;
  }

  private line(line: string, events: AgUiEvent[]): void {
    if (line === '') {
      this.dispatch(events);
      return;
    }
    if (line.startsWith('data:')) {
      const value = line.slice('data:'.length);
      this.data.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    // `event:`, `id:`, `retry:` and comments name nothing AG-UI reads.
  }

  private dispatch(events: AgUiEvent[]): void {
    if (!this.data.length) {
      return;
    }
    const data = this.data.join('\n');
    this.data = [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.malformed(data);
      return;
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { type?: unknown }).type === 'string'
    ) {
      events.push(parsed as AgUiEvent);
    } else {
      this.malformed(data);
    }
  }
}

/** Every event a complete stream's text holds: a stream already read whole. */
export function eventsOfStream(text: string): AgUiEvent[] {
  const frames = new AgUiFrames();
  return [...frames.push(text), ...frames.end()];
}

/** A text decoder that keeps a character split between two chunks whole. */
function decoderOf(): (chunk: Uint8Array | string) => string {
  if (typeof TextDecoder === 'undefined') {
    throw new Error(
      'This JavaScript runtime has no TextDecoder to read a run stream with.',
    );
  }
  const decoder = new TextDecoder();
  return chunk =>
    typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
}

/**
 * Read a run's stream to its end, each event handed to `onEvent` as it
 * arrives. Throws `RUN_CUT_SHORT` when the stream closes before the run said
 * how it ended, and `NOT_STREAMING` for a response that cannot be read as it
 * streams. An abort ends the reading with the caller's `AbortError`.
 */
export async function readRunStream(
  response: { body?: unknown },
  onEvent: (event: AgUiEvent) => void,
  malformed?: (data: string) => void,
): Promise<void> {
  const body = response.body as
    | { getReader?: () => ReadableStreamDefaultReader<Uint8Array | string> }
    | null
    | undefined;
  if (!body || typeof body.getReader !== 'function') {
    throw new Error(NOT_STREAMING);
  }
  const reader = body.getReader();
  const decode = decoderOf();
  const frames = new AgUiFrames(malformed);
  let ended = false;
  const handle = (events: AgUiEvent[]) => {
    for (const event of events) {
      if (endsRun(event)) {
        ended = true;
      }
      onEvent(event);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value !== undefined) {
        handle(frames.push(decode(value)));
      }
    }
    handle(frames.end());
  } finally {
    reader.releaseLock();
  }
  if (!ended) {
    throw new Error(RUN_CUT_SHORT);
  }
}

/** A tool's result as a run says it (`TOOL_CALL_RESULT`): what it gave, and whether it failed. */
export type ToolResultSaid = {
  /** The result: its JSON read when it is JSON, else its text. */
  result: unknown;
  success: boolean;
  error?: string;
};

/**
 * A tool result's content, read as the chat reads it: JSON when it is JSON,
 * and failed when the execution result says so (`execution_ok: false`, a
 * `code_error`, or an `error` without `success`).
 */
export function toolResultOf(content: unknown): ToolResultSaid {
  let result = content;
  if (typeof result === 'string') {
    try {
      result = JSON.parse(result);
    } catch {
      // Words, kept as they are.
    }
  }
  const said =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : undefined;
  const failed =
    said?.execution_ok === false ||
    said?.code_error != null ||
    (said?.error != null && !said?.success);
  if (!failed) {
    return { result, success: true };
  }
  const codeError = said?.code_error as
    { name?: string; value?: string } | undefined;
  const error =
    (typeof said?.execution_error === 'string' && said.execution_error) ||
    (typeof said?.error === 'string' && said.error) ||
    (codeError
      ? `${codeError.name || 'Error'}: ${codeError.value || ''}`
      : undefined);
  return { result, success: false, error };
}
