/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-x-budget` — what is left of the person's X budget
 * today, in the chat's title bar or under the prompt (its placement; `Chat`'s
 * `uiPlugins` with `x-budget` draws the same chip). It reads the Marketer's
 * `x-api-budget` guardrail back from the runtimes service and counts
 * nothing itself: the guardrail prices each X call and refuses one past the
 * budget. Never for an anonymous visitor (no token, no X): *Sign in to post
 * on X* is drawn locked in its place (`locked-ui`).
 *
 * @module apps/plugins/x-budget
 */

import { defineChromePlugin } from '../../toolCards/chrome';
import { XBudgetChip } from './XBudgetChip';

export const X_BUDGET_PLUGIN_NAME = '@datalayer/loop-plugin-x-budget';

/** The plugin for a placement: `header` (its default) or `footer`. */
export const xBudgetPlugin = defineChromePlugin({
  id: 'x-budget',
  displayName: 'X budget',
  description:
    'What is left of the person’s X budget today, read from the agent’s X budget guardrail.',
  octicon: 'meter',
  emoji: '\u{1F4B2}',
  Component: () => XBudgetChip({}),
});

export const XBudgetPlugin = xBudgetPlugin('header');

export { XBudgetChip, XBudgetSlot, X_BUDGET_REFRESH_MS } from './XBudgetChip';
export * from './xBudget';
export default XBudgetPlugin;
