/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-basket-total` — the Shopper's basket in the chat's
 * title bar (or under the prompt): how many items and its total, read from
 * the last basket it showed (`show_basket`); nothing before one. Brought by
 * the `show-basket` tool.
 *
 * @module apps/plugins/basket-total
 */

import type { JSX } from 'react';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { money, record } from '../../toolCards/kit';
import { readBasket } from '../shopping-basket/read';

export const BASKET_TOTAL_WORDS = {
  short: (count: number, total: string) =>
    `Basket: ${count} ${count === 1 ? 'item' : 'items'} · ${total}`,
  title: (count: number, total: string) =>
    `The basket shown last holds ${count} ${count === 1 ? 'item' : 'items'}, ${total} in all. Nothing is bought until you approve the purchase.`,
} as const;

/** The basket's count and total from a `show_basket` call; undefined without items. */
export function basketTotalOf(
  call: { args: Record<string, unknown>; result: unknown } | undefined,
): { count: number; total: string } | undefined {
  if (!call) {
    return undefined;
  }
  const answered = record(call.result);
  const basket = readBasket(
    answered && 'shown' in answered ? answered : call.args,
  );
  if (basket.items.length === 0) {
    return undefined;
  }
  return {
    count: basket.items.reduce((sum, item) => sum + item.quantity, 0),
    total: money(basket.total, basket.currency),
  };
}

export function BasketTotalChip(): JSX.Element | null {
  const said = basketTotalOf(useLatestToolCall(['show_basket']));
  if (!said) {
    return null;
  }
  return (
    <Chip
      title={BASKET_TOTAL_WORDS.title(said.count, said.total)}
      data="basket-total"
    >
      {BASKET_TOTAL_WORDS.short(said.count, said.total)}
    </Chip>
  );
}

export const basketTotalPlugin = defineChromePlugin({
  id: 'basket-total',
  displayName: 'Basket total',
  description:
    'The basket the agent is putting together, in the chat’s title bar: how many items and its total.',
  octicon: 'package',
  emoji: '\u{1F6D2}',
  Component: BasketTotalChip,
});

export const BasketTotalPlugin = basketTotalPlugin('header');
export default BasketTotalPlugin;
