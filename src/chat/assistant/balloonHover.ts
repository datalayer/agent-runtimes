/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * When the assistant's balloon shows for a hover — the hover-intent rule.
 *
 * The figure and its balloon are one region: the balloon opens when the
 * pointer enters either, and stays while it is over either. Leaving them
 * does not close it at once — the pointer crosses the gap between the figure
 * and the balloon, or a 3D figure's canvas redraws under it — it closes once
 * the pointer has been on neither for `BALLOON_GRACE_MS`. Keyboard focus in
 * the region keeps it open too. Escape, or a press outside, closes it at
 * once; it opens again on the next enter or focus.
 *
 * Pure: the stage dispatches what happened and runs the grace timer while
 * `graceRuns` says so.
 */

/** How long the balloon stays once the pointer is on neither, in ms. */
export const BALLOON_GRACE_MS = 700;

export interface BalloonHover {
  /** The balloon shows for the hover. */
  shown: boolean;
  /** The pointer is over the figure or its balloon. */
  over: boolean;
  /** Keyboard focus is in the figure or its balloon. */
  focused: boolean;
}

export type BalloonHoverEvent =
  'enter' | 'leave' | 'focus' | 'blur' | 'grace' | 'escape' | 'outside';

export const BALLOON_HOVER_START: BalloonHover = {
  shown: false,
  over: false,
  focused: false,
};

export function balloonHover(
  state: BalloonHover,
  event: BalloonHoverEvent,
): BalloonHover {
  switch (event) {
    case 'enter':
      return { ...state, over: true, shown: true };
    case 'leave':
      // Still shown: the grace runs.
      return { ...state, over: false };
    case 'focus':
      return { ...state, focused: true, shown: true };
    case 'blur':
      return { ...state, focused: false };
    case 'grace':
      return state.over || state.focused ? state : { ...state, shown: false };
    case 'escape':
      return { ...state, shown: false };
    case 'outside':
      return { ...state, shown: false, over: false, focused: false };
  }
}

/** Whether the grace timer runs: shown, the pointer on neither, no focus. */
export function graceRuns(state: BalloonHover): boolean {
  return state.shown && !state.over && !state.focused;
}
