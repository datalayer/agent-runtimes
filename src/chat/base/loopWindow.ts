/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Window messages (P-25): what an application's code tells the page it
 * sits in, outside the conversation — ``session.send_window_message(data)``.
 *
 * The session says it with a `reactor.ui` `window` op named `message`, its
 * `args` `{data}` (RU-3), on the conversation's ui socket (RU-W). The chat does not draw it: it hands
 * it to whoever listens here — the embed's host bridge, which raises it on
 * the element as its `window-message` event. A window op of another name is
 * not one this page acts on: refused, it throws.
 */

import { AGUI_NAME, type WindowOp } from '@datalayer/reactor/ui';

/** The name of the window op that hands the page a message. */
export const WINDOW_MESSAGE = 'message';

/** What a window op hands the page. Throws for a window op of another name. */
export function windowMessageOf(op: WindowOp): unknown {
  if (op.body.name !== WINDOW_MESSAGE) {
    throw new Error(
      `A window op named ${op.body.name} is not one this page acts on`,
    );
  }
  const args = op.body.args;
  if (!args || !('data' in args)) {
    throw new Error('A window message says no data');
  }
  return args.data;
}

const listeners = new Set<(data: unknown) => void>();

/** Hand a window message to whoever listens. */
export function tellLoopWindow(data: unknown): void {
  for (const listener of [...listeners]) listener(data);
}

/** Listen for window messages. Returns the unsubscribe. */
export function onLoopWindowMessage(
  listener: (data: unknown) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Why the turn a window message posted by the page ran failed — its
 * `RUN_ERROR`'s sentence — or `null`. What its code tells the page back comes
 * on the conversation's ui socket (RU-W), never on this stream: a
 * `reactor.ui` event here is refused.
 */
export function windowTurnErrorOf(stream: string): string | null {
  let error: string | null = null;
  for (const block of stream.split('\n\n')) {
    const data = block
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice('data:'.length).trim())
      .join('');
    if (!data) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(data) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (event.type === 'RUN_ERROR') {
      error = String(event.message ?? 'The turn failed.');
    } else if (event.type === 'CUSTOM' && event.name === AGUI_NAME) {
      throw new Error(
        'A reactor.ui op came on the run stream: it comes over the ui socket.',
      );
    }
  }
  return error;
}
