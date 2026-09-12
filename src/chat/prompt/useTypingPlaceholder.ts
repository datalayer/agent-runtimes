/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The prompt types its own suggestions, so the box is not merely empty.
 *
 * An empty composer under a chat asks a question nobody has answered for the
 * reader: what can I ask this thing? The empty state's suggestion chips answer
 * it, and they disappear the moment the first message is sent. Typing them
 * into the placeholder answers it where the answer is needed — in the box
 * about to be typed in — and keeps answering it later, when the chips are
 * gone.
 *
 * It is the *placeholder* that types, never the editor's content. Animating
 * the real value would put words in a person's message that they did not
 * write, and one careless Enter would send them.
 *
 * Two rules that make it an invitation rather than a distraction:
 *
 * - **It yields.** The moment the prompt has focus the animation stops and the
 *   ordinary placeholder returns — the one that mentions `/` and `@`, which is
 *   what somebody about to type actually needs. A half-typed phrase frozen
 *   under a caret reads as a bug; the static hint reads as help. On blur it
 *   starts again, from the top of the phrase it was on.
 * - **It respects `prefers-reduced-motion`.** For a reader who has asked the
 *   machine to hold still, the suggestion is worth nothing and the movement
 *   costs something.
 *
 * @module chat/prompt/useTypingPlaceholder
 */

import { useEffect, useRef, useState } from 'react';

/** Milliseconds per character while typing. About 220 characters a minute. */
const TYPE_MS = 45;

/** How long a finished phrase stands before it is taken away. */
const HOLD_MS = 1600;

/**
 * Milliseconds per character while rewinding.
 *
 * Much faster than typing, and deliberately so: the typing is the message and
 * the erasing is only the way back. At an equal speed the pair reads as
 * indecision.
 */
const ERASE_MS = 14;

/**
 * The beat between an emptied box and the next phrase starting.
 *
 * The ordinary placeholder stands here, which makes this the only moment the
 * hint naming `/` and `@` is legible — everywhere else in the cycle a
 * suggestion is on top of it. Long enough to be read, therefore, rather than
 * long enough to be noticed: longer, in fact, than the beat a finished
 * suggestion is held for, because the two are doing the same job for different
 * sentences and this is the one a reader has had no chance to read yet.
 */
const GAP_MS = 2000;

/** Where the animation has got to. */
export type TypingState = {
  /** Which phrase, modulo the list's length. */
  index: number;
  /** How many of its characters are showing. */
  shown: number;
  /** Whether it is being taken away rather than put up. */
  erasing: boolean;
};

/**
 * The state at rest, and what a stopped animation returns to.
 *
 * One character already showing, not none. A phrase begins the instant it is
 * its turn — at mount, and again when the prompt loses focus — because the
 * alternative is a beat of the ordinary placeholder before every phrase, and
 * the pause between phrases is where that belongs.
 */
export const TYPING_START: TypingState = {
  index: 0,
  shown: 1,
  erasing: false,
};

/**
 * The next state, and how long to wait before adopting it.
 *
 * Pulled out of the hook and left pure so the rhythm can be read — and
 * tested — without a renderer. The hook is then only a timer and some state.
 */
export function nextTypingStep(
  state: TypingState,
  phrases: string[],
): { delayMs: number; state: TypingState } {
  const phrase = phrases[state.index % phrases.length] ?? '';

  if (!state.erasing) {
    if (state.shown < phrase.length) {
      return {
        delayMs: TYPE_MS,
        state: { ...state, shown: state.shown + 1 },
      };
    }
    // Typed out: stand there long enough to be read before it goes.
    return { delayMs: HOLD_MS, state: { ...state, erasing: true } };
  }

  if (state.shown > 0) {
    return { delayMs: ERASE_MS, state: { ...state, shown: state.shown - 1 } };
  }
  /*
   * Emptied: a beat, then the next one, already on its first character.
   *
   * The state being left — nothing shown — is what stands for the length of
   * that beat, and it is where the ordinary placeholder gets its turn. Landing
   * on the next phrase's first character rather than on another empty frame is
   * what keeps the beat to one pause instead of two. Wrapping, so it loops.
   */
  return {
    delayMs: GAP_MS,
    state: {
      index: (state.index + 1) % phrases.length,
      shown: TYPING_START.shown,
      erasing: false,
    },
  };
}

/** What is on screen in a given state. */
export function typedText(state: TypingState, phrases: string[]): string {
  const phrase = phrases[state.index % phrases.length] ?? '';
  return phrase.slice(0, state.shown);
}

export type TypingPlaceholderOptions = {
  /** The phrases to type out, in order, looping. */
  phrases: string[];
  /**
   * Whether the animation should run.
   *
   * False for a focused prompt, a prompt with something already typed in it,
   * and a prompt that cannot be typed in at all.
   */
  enabled: boolean;
  /** What to show whenever it is not running. */
  idle: string;
};

/** Whether this reader has asked for less movement. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The placeholder to show right now.
 *
 * Returns `idle` unchanged whenever there is nothing to animate, so a caller
 * can pass the result straight through without asking whether the animation
 * is on.
 */
export function useTypingPlaceholder({
  phrases,
  enabled,
  idle,
}: TypingPlaceholderOptions): string {
  /*
   * The phrase list as a primitive.
   *
   * The effect below schedules one timeout per character and cancels it on
   * every re-run, so an array identity in its dependencies would let any
   * re-render of the parent restart the pending tick — a prompt inside a chat
   * that re-renders while streaming would type nothing at all. A joined string
   * changes when the phrases do and not when the array is rebuilt.
   */
  const key = phrases.join(' ');
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const [state, setState] = useState<TypingState>(TYPING_START);
  const [reduced] = useState(prefersReducedMotion);

  const running = enabled && !reduced && phrases.length > 0;

  // A new set of suggestions is a new animation, not a continuation of the old
  // one at whatever character it had reached.
  useEffect(() => {
    setState(TYPING_START);
  }, [key]);

  // Stopped means stopped at the beginning: when it resumes it types a phrase
  // out from the top rather than picking up mid-word, which is what makes the
  // return read as an invitation rather than as a glitch. At the top, not
  // before it — the first character is already there, so typing resumes on the
  // instant rather than after a beat of nothing.
  useEffect(() => {
    if (!running) {
      setState(current => ({
        ...current,
        shown: TYPING_START.shown,
        erasing: false,
      }));
    }
  }, [running]);

  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const step = nextTypingStep(state, phrasesRef.current);
    const timer = setTimeout(() => setState(step.state), step.delayMs);
    return () => clearTimeout(timer);
  }, [running, state]);

  if (!running) {
    return idle;
  }
  /*
   * The idle text until the first character lands.
   *
   * An empty placeholder between one phrase and the next is a box that looks
   * broken for a third of a second, twice a cycle. The ordinary hint fills the
   * gap, which is also the most useful thing to put there.
   */
  return typedText(state, phrases) || idle;
}

export default useTypingPlaceholder;
