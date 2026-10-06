/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A pane opening, at the theme's pace (LOOP T-10): the third of the three
 * things that move — a message arriving, a status changing, a pane opening.
 *
 * Read from the theme's tokens, `--theme-motion-pane` and
 * `--theme-motion-easing`: a theme that sets no motion (every theme but
 * `loop`) gives `0ms`, and nothing moves; nor does anything when the person
 * asked for reduced motion.
 *
 * @module loop/shell/paneMotion
 */

/** The keyframes' name for a pane opening from a side: one per side. */
export const paneOpenKeyframes = (from: 'left' | 'right'): string =>
  from === 'left' ? 'loopPaneOpenLeft' : 'loopPaneOpenRight';

/** The CSS `animation` of a pane opening from a side. */
export const paneOpenAnimation = (from: 'left' | 'right'): string =>
  `${paneOpenKeyframes(from)} var(--theme-motion-pane, 0ms) var(--theme-motion-easing, ease) both`;

/**
 * The styles of a pane that opens from a side: it comes in a little from
 * that side as it appears. Applied to an element when it is shown (mounted,
 * or out of `display: none`), which is when a CSS animation starts.
 */
export function paneOpening(from: 'left' | 'right'): Record<string, unknown> {
  const shift = from === 'left' ? '-12px' : '12px';
  return {
    animation: paneOpenAnimation(from),
    [`@keyframes ${paneOpenKeyframes(from)}`]: {
      from: { opacity: 0, transform: `translateX(${shift})` },
      to: { opacity: 1, transform: 'none' },
    },
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  };
}
