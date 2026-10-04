/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the floating assistant acts out (LOOP T-22): the presence of the
 * application (T-08), and three moments of its own — greeting when it
 * arrives, speaking while an answer streams in, goodbye when it is sent away.
 *
 * @module chat/assistant/state
 */

import type { PresenceState } from '../presence/presenceStatus';

/** The states a character has an animation for. */
export type AssistantState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'greeting'
  | 'speaking'
  | 'goodbye';

/** What a character is doing, beyond what the application is doing. */
export interface AssistantMoment {
  /** It has just appeared, and says hello once. */
  arriving?: boolean;
  /** It is being sent away. */
  leaving?: boolean;
  /** The answer is arriving: words are being written. */
  speaking?: boolean;
}

/**
 * The state to act, from the application's presence and the moment.
 *
 * Leaving and arriving win, being short; then waiting for the person, which
 * must never be missed; then speaking over thinking, since words arriving
 * are what the person watches; then the presence as it is.
 */
export function assistantStateOf(
  presence: PresenceState,
  moment: AssistantMoment = {},
): AssistantState {
  if (moment.leaving) {
    return 'goodbye';
  }
  if (moment.arriving) {
    return 'greeting';
  }
  if (presence === 'waiting') {
    return 'waiting';
  }
  if (moment.speaking && presence !== 'idle') {
    return 'speaking';
  }
  return presence;
}

/**
 * Whether words are arriving: the newest item of the conversation is the
 * assistant's own message, not a tool call. Read with `busy`, it is speaking.
 */
export function newestIsAnswer(items: readonly unknown[]): boolean {
  const newest = items[items.length - 1] as
    { role?: unknown; toolName?: unknown } | undefined;
  return (
    !!newest &&
    newest.role === 'assistant' &&
    typeof newest.toolName !== 'string'
  );
}

/** A word from the agent, for the character's balloon. */
export interface AssistantSaying {
  /** The message it comes from: a new id is a new thing said. */
  id: string;
  /** Its text, short enough for a balloon. */
  text: string;
  /** Whether there was more than the balloon holds. */
  more: boolean;
}

/** How much of a message the balloon says before *Open the conversation*. */
export const SAYING_LIMIT = 220;

/**
 * The newest thing the agent said, as the Office Assistant said it: in the
 * balloon, while the conversation is closed (T-23). Only its own messages
 * with text — not a tool call, not the person's words; markdown is read as
 * plain words, and a long message is cut at a word with `more` set.
 */
export function latestSaying(
  items: readonly unknown[],
): AssistantSaying | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as {
      id?: unknown;
      role?: unknown;
      toolName?: unknown;
      content?: unknown;
    };
    if (item.role !== 'assistant' || typeof item.toolName === 'string') {
      continue;
    }
    const raw =
      typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? item.content
              .map(part =>
                part &&
                typeof part === 'object' &&
                (part as { type?: unknown }).type === 'text'
                  ? String((part as { text?: unknown }).text ?? '')
                  : '',
              )
              .join(' ')
          : '';
    const plain = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) {
      continue;
    }
    if (plain.length <= SAYING_LIMIT) {
      return { id: String(item.id ?? index), text: plain, more: false };
    }
    const cut = plain.slice(0, SAYING_LIMIT);
    const atWord = cut.slice(
      0,
      Math.max(cut.lastIndexOf(' '), SAYING_LIMIT * 0.6),
    );
    return {
      id: String(item.id ?? index),
      text: `${atWord.trimEnd()}…`,
      more: true,
    };
  }
  return undefined;
}

/**
 * How long the assistant is away, once sent (T-27): for the page — the
 * popup's button calls it back — for the session, or for good; the header's
 * *Floating assistant* always calls it back.
 */
export type AssistantAway = 'none' | 'page' | 'session' | 'always';

/** Where the choice is kept: the session's storage, or for good. */
export const ASSISTANT_AWAY_KEY = 'datalayer-assistant-away';

/** The away a page starts with, from what was kept. Storage may be refused. */
export function keptAway(): AssistantAway {
  try {
    if (window.localStorage.getItem(ASSISTANT_AWAY_KEY) === 'always') {
      return 'always';
    }
    if (window.sessionStorage.getItem(ASSISTANT_AWAY_KEY) === 'session') {
      return 'session';
    }
  } catch {
    // A page without storage keeps the assistant for the page only.
  }
  return 'none';
}

/** Keep the choice where it lasts as long as it says; `none` forgets it. */
export function keepAway(away: AssistantAway): void {
  try {
    window.localStorage.removeItem(ASSISTANT_AWAY_KEY);
    window.sessionStorage.removeItem(ASSISTANT_AWAY_KEY);
    if (away === 'always') {
      window.localStorage.setItem(ASSISTANT_AWAY_KEY, 'always');
    } else if (away === 'session') {
      window.sessionStorage.setItem(ASSISTANT_AWAY_KEY, 'session');
    }
  } catch {
    // Without storage the choice holds for the page.
  }
}

/** A box on the screen, as `getBoundingClientRect` gives it. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What the assistant never sits over (T-27): an open dialog or overlay —
 * Primer's `Dialog`, an `ActionMenu` or `SelectPanel` overlay, a native
 * `<dialog>` — and the composer of a chat.
 */
export const ASSISTANT_OBSTACLES = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  'dialog[open]',
  '[class*="prc-Overlay-Overlay"]',
  '[data-chat-composer]',
].join(', ');

/** How near the pointer works, in pixels, before the assistant steps aside. */
export const POINTER_ROOM = 24;

/** How long the pointer stays away before the assistant comes back, in ms. */
export const POINTER_CALM_MS = 1500;

/** Whether two boxes share any area, the first grown by `margin`. */
export function boxesMeet(a: ScreenBox, b: ScreenBox, margin = 0): boolean {
  return (
    a.left - margin < b.right &&
    b.left < a.right + margin &&
    a.top - margin < b.bottom &&
    b.top < a.bottom + margin
  );
}

/**
 * Whether the pointer at `point` works where the assistant stands: over it,
 * or within `POINTER_ROOM` of it — a press beside it is aimed at what it
 * hides or crowds.
 */
export function pointerNear(
  box: ScreenBox,
  point: { x: number; y: number },
  room = POINTER_ROOM,
): boolean {
  return boxesMeet(
    box,
    { left: point.x, top: point.y, right: point.x, bottom: point.y },
    room,
  );
}
