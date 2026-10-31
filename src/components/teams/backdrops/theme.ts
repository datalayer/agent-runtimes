/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The rules a backdrop's theme puts on a stage's box: the variables light
 * and dark, and the box's own rules — for the graph, and for a stage that
 * draws one member alone in the same look.
 *
 * @module components/teams/backdrops/theme
 */

import type { SceneBackdropTheme, StageSx } from './types';

/**
 * A theme's rules on a box: its own (its background, its keyframes) and its
 * variables, light and dark (Primer's `data-color-mode`: `dark`, or `auto`
 * on a dark system).
 */
export function sceneStageSx(theme: SceneBackdropTheme): StageSx {
  return {
    ...(theme.sx as Record<string, unknown>),
    ...theme.light,
    '[data-color-mode="dark"] &': theme.dark,
    '@media (prefers-color-scheme: dark)': {
      '[data-color-mode="auto"] &': theme.dark,
    },
  } as StageSx;
}
