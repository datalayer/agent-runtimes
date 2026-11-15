/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-x-budget` — what is left of the person's X budget
 * today, in the chat's title bar (`LoopSlots.chatHeader`; `Chat`'s
 * `uiPlugins` with `x-budget` draws the same chip). It reads the Marketer's
 * `x-api-budget` guardrail back from the runtimes service and counts
 * nothing itself: the guardrail prices each X call and refuses one past the
 * budget. Never for an anonymous visitor (no token, no X).
 *
 * @module apps/plugins/x-budget
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { LoopSlots } from '../../core';
import { XBudgetSlot } from './XBudgetChip';

export const X_BUDGET_PLUGIN_NAME = '@datalayer/loop-plugin-x-budget';

export const XBudgetPlugin = definePlugin({
  name: X_BUDGET_PLUGIN_NAME,
  displayName: 'X budget',
  description:
    'What is left of the person’s X budget today, read from the agent’s X budget guardrail.',
  octicon: 'meter',
  emoji: '\u{1F4B2}',
  build() {
    return {
      components: [
        {
          slot: LoopSlots.chatHeader,
          id: 'x-budget',
          Component: XBudgetSlot as never,
        },
      ],
    };
  },
}) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;

export { XBudgetChip, XBudgetSlot, X_BUDGET_REFRESH_MS } from './XBudgetChip';
export * from './xBudget';
export default XBudgetPlugin;
