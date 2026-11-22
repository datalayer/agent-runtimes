/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The examples shell's layout contract, in one place.
 *
 * The page never scrolls. `html`, `body` and `#root` are 100% tall with no
 * margin and clip (html/examples.html); the shell is pinned to the window's
 * four edges and is a column: the header at its own height, the content area
 * taking the rest. Every example renders inside `ExampleWrapper`, whose root
 * child fills the content area exactly and cannot grow past it: an example
 * with long content scrolls a panel of its own, never the page.
 *
 * Why not `100vw`/`100vh`: the viewport units count the scrollbars, follow
 * the large viewport on mobile and, under a zoomed root, are scaled with it;
 * a shell measured in them was taller than the window at 110% zoom, and an
 * example root at `100vh` under a 60px header scrolled by 60px. Inset 0 and
 * flex shares are exact at every zoom and every fractional size.
 *
 * Checked in the browser by scripts/check-examples-viewport.py and here by
 * src/examples/__tests__/exampleFrame.test.ts.
 */

/** The header's height, also the north notice's offset. */
export const EXAMPLES_HEADER_HEIGHT = 60;

/** The shell: the window itself. */
export const EXAMPLES_SHELL_SX = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
} as const;

/**
 * The header: its own height, never squeezed, and above the content area.
 * It does not clip: the account's hovercard and other popovers drawn in place
 * hang below it, over the example (its left side gives way instead, so the
 * header never grows past the window's right edge).
 */
export const EXAMPLES_HEADER_SX = {
  flex: 'none',
  height: `${EXAMPLES_HEADER_HEIGHT}px`,
  minWidth: 0,
  position: 'relative',
  zIndex: 100,
  boxSizing: 'border-box',
} as const;

/**
 * The content area: what the header leaves, and nothing past it. Layout
 * containment makes it the containing block of the example's `fixed`
 * layers too (a floating chat's side panel, a spec overlay), so they stay
 * under the header instead of covering it; popovers portalled to the body
 * are not concerned.
 */
export const EXAMPLES_CONTENT_SX = {
  flex: '1 1 0',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  contain: 'layout',
} as const;

/**
 * The frame every example renders in (ExampleWrapper), and the rule for its
 * root child: fill the frame, never exceed it, scroll inside when it must.
 */
export const EXAMPLE_FRAME_SX = {
  position: 'relative',
  flex: '1 1 0',
  height: '100%',
  width: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
} as const;

export const EXAMPLE_ROOT_SX = {
  flex: '1 1 0',
  minHeight: 0,
  minWidth: 0,
  maxHeight: '100%',
  maxWidth: '100%',
  width: '100%',
  boxSizing: 'border-box',
  // Plain content pages scroll here; an example that manages its own
  // scrollers sets `overflow: hidden` on its root.
  overflow: 'auto',
} as const;
