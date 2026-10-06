/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Window messages (LOOP P-25): what an application's code tells the page it
 * sits in, outside the conversation — ``session.send_window_message(data)``.
 *
 * The session API says it with a `CUSTOM` event named `loop.window` —
 * `{data}` — which the AG-UI adapter hands on as an `activity`. The chat
 * does not draw it: it hands it to whoever listens here — the embed's host
 * bridge, which raises it on the element as its `window-message` event.
 */

/** The `CUSTOM` event's name. */
export const LOOP_WINDOW = 'loop.window';

/** What an activity says to the page, or `null` when it is not a window message. */
export function loopWindowMessage(
  activity: { type: string; data: unknown } | undefined,
): { data: unknown } | null {
  if (!activity || activity.type !== LOOP_WINDOW) return null;
  const said = activity.data as Record<string, unknown> | null;
  if (!said || typeof said !== 'object' || !('data' in said)) return null;
  return { data: said.data };
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
 * What a turn's stream says to the page — the `loop.window` events of the
 * turn a window message posted by the page ran — and the sentence its
 * `RUN_ERROR` said, if it failed.
 */
export function windowTurnOf(stream: string): {
  said: unknown[];
  error: string | null;
} {
  const said: unknown[] = [];
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
    } else if (event.type === 'CUSTOM') {
      const message = loopWindowMessage({
        type: String(event.name),
        data: event.value,
      });
      if (message) said.push(message.data);
    }
  }
  return { said, error };
}
