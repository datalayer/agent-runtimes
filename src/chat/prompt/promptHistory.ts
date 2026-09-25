/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Walking back through what was sent, the way a shell does on the arrow keys.
 *
 * Two lists make the history: what the runtime remembers from before this
 * page loaded (`seeded`, from the agent's initial state), and what was sent
 * from this composer since (`local`). They are joined oldest first, and a
 * prompt the runtime has since reported for itself is not counted twice.
 *
 * The cursor points into that joined list; one past its end is the draft —
 * whatever was being typed when the walk began, put back when the walk
 * returns there. Typing anything ends the walk: the text on screen becomes a
 * new draft, wherever it was taken from.
 *
 * Pure functions over a plain state, so the rules are testable without an
 * editor; `usePromptHistory` holds one such state for a composer.
 *
 * @module chat/prompt/promptHistory
 */

import { useCallback, useEffect, useRef } from 'react';

/** How many prompts a composer keeps of its own, on top of the seed. */
export const MAX_LOCAL_PROMPTS = 100;

export type HistoryDirection = 'up' | 'down';

export type PromptHistoryState = {
  /** What the runtime remembered, oldest first. */
  readonly seeded: readonly string[];
  /** What this composer sent, oldest first. */
  readonly local: readonly string[];
  /** Where the walk is; `entries.length` is the draft. */
  readonly cursor: number;
  /** What was being typed when the walk began. */
  readonly draft: string;
};

/** The whole history, oldest first, without the seed's own entries repeated. */
export function historyEntries(state: PromptHistoryState): string[] {
  const seen = new Set(state.seeded);
  return [...state.seeded, ...state.local.filter(prompt => !seen.has(prompt))];
}

export function createPromptHistory(
  seeded: readonly string[] = [],
): PromptHistoryState {
  const clean = seeded.map(prompt => prompt.trim()).filter(Boolean);
  return { seeded: clean, local: [], cursor: clean.length, draft: '' };
}

/**
 * The runtime's list, arrived or refreshed.
 *
 * The walk starts over from the draft: the entries under the cursor may have
 * moved, and a cursor kept across that would land on the wrong prompt.
 */
export function reseed(
  state: PromptHistoryState,
  seeded: readonly string[],
): PromptHistoryState {
  const clean = seeded.map(prompt => prompt.trim()).filter(Boolean);
  if (
    clean.length === state.seeded.length &&
    clean.every((prompt, index) => prompt === state.seeded[index])
  ) {
    return state;
  }
  const next = { ...state, seeded: clean, draft: '' };
  return { ...next, cursor: historyEntries(next).length };
}

/** A prompt was sent: it becomes the newest entry, and the walk starts over. */
export function remember(
  state: PromptHistoryState,
  prompt: string,
): PromptHistoryState {
  const text = prompt.trim();
  const entries = historyEntries(state);
  // Sent twice in a row is one entry, as the runtime keeps it too.
  if (!text || entries[entries.length - 1] === text) {
    return { ...state, cursor: entries.length, draft: '' };
  }
  const local = [...state.local, text].slice(-MAX_LOCAL_PROMPTS);
  const next = { ...state, local, draft: '' };
  return { ...next, cursor: historyEntries(next).length };
}

/** Something was typed: the walk is over, and what is on screen is the draft. */
export function edited(state: PromptHistoryState): PromptHistoryState {
  const length = historyEntries(state).length;
  return state.cursor === length
    ? state
    : { ...state, cursor: length, draft: '' };
}

/**
 * One step through the history.
 *
 * `current` is what the composer shows now; it is kept as the draft when the
 * first step up leaves it. Nothing to step to — older than the oldest, or
 * newer than the draft — answers `null`, and the key goes on to do what it
 * does in an editor.
 */
export function step(
  state: PromptHistoryState,
  direction: HistoryDirection,
  current: string,
): { state: PromptHistoryState; text: string } | null {
  const entries = historyEntries(state);
  if (direction === 'up') {
    if (state.cursor === 0) {
      return null;
    }
    const cursor = state.cursor - 1;
    const draft = state.cursor === entries.length ? current : state.draft;
    return { state: { ...state, cursor, draft }, text: entries[cursor] };
  }
  if (state.cursor >= entries.length) {
    return null;
  }
  const cursor = state.cursor + 1;
  const text = cursor === entries.length ? state.draft : entries[cursor];
  return { state: { ...state, cursor }, text };
}

/**
 * A composer's history: what to remember, and where the arrow keys go.
 *
 * Held in a ref rather than in state, because the walk has to answer a
 * keystroke on the spot — the text goes into the composer's own value, and
 * nothing here needs to render.
 */
export function usePromptHistory(seeded?: readonly string[]) {
  const stateRef = useRef<PromptHistoryState>(createPromptHistory(seeded));

  useEffect(() => {
    stateRef.current = reseed(stateRef.current, seeded ?? []);
  }, [seeded]);

  const rememberPrompt = useCallback((prompt: string) => {
    stateRef.current = remember(stateRef.current, prompt);
  }, []);

  const editedPrompt = useCallback(() => {
    stateRef.current = edited(stateRef.current);
  }, []);

  /** The text to show after a step, or `null` when there is nowhere to go. */
  const navigate = useCallback(
    (direction: HistoryDirection, current: string): string | null => {
      const result = step(stateRef.current, direction, current);
      if (!result) {
        return null;
      }
      stateRef.current = result.state;
      return result.text;
    },
    [],
  );

  return { remember: rememberPrompt, edited: editedPrompt, navigate };
}

export default usePromptHistory;
