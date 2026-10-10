/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A message of an application's code that changed after it was sent
 * (LOOP P-15).
 *
 * The session API says a message's author, or that it was taken away, with a
 * `CUSTOM` event named `loop.message` — `{id, author}` or `{id, removed: true}`
 * — which the AG-UI adapter hands on as an `activity`. A message whose text
 * changed needs nothing here: it is written again under its id, and the chat
 * draws it in place.
 */

import type { MessageSpeaker } from '../../types/messages';

/** The `CUSTOM` event's name. */
export const LOOP_MESSAGE = 'loop.message';

/** What changed about a message already in the conversation. */
export type LoopMessageChange =
  { id: string; removed: true } | { id: string; author: string };

/** The change an activity says, or `null` when it says none. */
export function loopMessageChange(
  activity: { type: string; data: unknown } | undefined,
): LoopMessageChange | null {
  if (!activity || activity.type !== LOOP_MESSAGE) return null;
  const data = activity.data as Record<string, unknown> | null;
  if (!data || typeof data.id !== 'string' || !data.id) return null;
  if (data.removed === true) return { id: data.id, removed: true };
  if (typeof data.author === 'string' && data.author.trim()) {
    return { id: data.id, author: data.author.trim() };
  }
  return null;
}

/** Who a message is by, as the chat draws a named voice. */
export function speakerOf(author: string): MessageSpeaker {
  return { id: `author:${author}`, name: author };
}

/**
 * The conversation with the change made: the message taken away, or given its
 * author. Items that are not that message — tool calls among them — are left
 * as they are.
 */
export function withLoopMessage<
  T extends { id?: string; speaker?: MessageSpeaker },
>(items: T[], change: LoopMessageChange): T[] {
  if ('removed' in change) {
    return items.filter(item => item.id !== change.id);
  }
  return items.map(item =>
    item.id === change.id
      ? { ...item, speaker: speakerOf(change.author) }
      : item,
  );
}
