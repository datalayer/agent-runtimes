/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation by voice, hands-free (VOICE.md VO-12, VO-13): what the
 * composer is doing at every moment, and when a turn ends or the person
 * speaks over the agent. Pure: the component (`HandsFree`) keeps the
 * microphone and the clock, this decides.
 *
 * - **Listening**: the microphone is open; the turn ends after
 *   `turnSilenceMs` of silence once the person has spoken (700 ms unless
 *   the application or the person says otherwise), and is sent.
 * - **Thinking**: the turn was sent and the agent is answering, nothing
 *   said yet.
 * - **Speaking**: the answer is being said. The microphone stays open:
 *   speech heard now is barge-in (VO-13) — the voice stops at once, the run
 *   is stopped when the answer is still being written, and what was heard
 *   starts the next turn.
 * - **Paused**: the person paused it (`Esc`, *Pause*), or nothing was said
 *   for `IDLE_PAUSE_MS`; nothing is heard until resumed.
 *
 * @module voice/handsFree
 */

/** What hands-free is doing, shown at all times (VO-12). */
export type HandsFreeState =
  'off' | 'listening' | 'thinking' | 'speaking' | 'paused';

/** The word for each state, as the composer shows it. */
export const HANDS_FREE_WORDS: Record<HandsFreeState, string> = {
  off: 'Talk with it',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  paused: 'Paused',
};

/** The silence after speech that ends a turn, in ms, unless said otherwise (VO-12). */
export const TURN_SILENCE_MS = 700;

/** Listening with nothing said for this long pauses it: a microphone is not left open on an empty room. */
export const IDLE_PAUSE_MS = 5 * 60_000;

/** What decides the state. */
export interface HandsFreeInputs {
  /** The toggle is on. */
  on: boolean;
  /** The person paused it, or the room went quiet. */
  paused: boolean;
  /** The agent's answer is being said. */
  speaking: boolean;
  /** A run is in progress: the agent is answering. */
  running: boolean;
}

/** The state for what is known: speaking wins over thinking, pausing over both. */
export function handsFreeState(inputs: HandsFreeInputs): HandsFreeState {
  if (!inputs.on) {
    return 'off';
  }
  if (inputs.paused) {
    return 'paused';
  }
  if (inputs.speaking) {
    return 'speaking';
  }
  if (inputs.running) {
    return 'thinking';
  }
  return 'listening';
}

/** What the microphone heard so far, as the hearing says it (`HeardSoFar`). */
export interface HeardSoFarLike {
  spoke: boolean;
  silentMs: number;
}

/**
 * Whether the turn ended: the person spoke, and has been silent for the
 * turn's silence since (VO-12).
 */
export function turnEnded(
  heard: HeardSoFarLike,
  turnSilenceMs = TURN_SILENCE_MS,
): boolean {
  return heard.spoke && heard.silentMs >= turnSilenceMs;
}

/**
 * Whether the person spoke over the agent (VO-13): speech found since the
 * agent began answering, while it thinks or speaks. The microphone is opened
 * anew when the agent begins, so what it holds is the person's, not the
 * answer's echo — the browser's echo cancellation keeps that out.
 */
export function bargedIn(
  state: HandsFreeState,
  heard: HeardSoFarLike,
): boolean {
  return (state === 'speaking' || state === 'thinking') && heard.spoke;
}

/** A message as the conversation holds it: enough to find the answer spoken over. */
export interface ConversationItemLike {
  id: string;
  role?: string;
}

/**
 * The answer the person spoke over (VO-13): the agent's last message after
 * the person's last one — still being written, or written and being said.
 * `undefined` while the agent has not answered the turn yet: there is
 * nothing to mark.
 */
export function answerSpokenOver(
  items: readonly ConversationItemLike[],
): string | undefined {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const role = items[i].role;
    if (role === 'user') {
      return undefined;
    }
    if (role === 'assistant') {
      return items[i].id;
    }
  }
  return undefined;
}
