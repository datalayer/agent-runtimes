/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-shop-header` — the Shopper's title bar: the basket
 * it is putting together (a counter: items, and the total as its words), a
 * Budget drop-down told to the agent with every turn, and Approval while a
 * purchase waits. Stands in for `basket-total`: until the agent's tool says
 * the basket, it reads the last basket shown (`show_basket`).
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/shop-header.yaml`):
 * the items, the frontend tool `set_shop_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/shop-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';
import { useLatestToolCall } from '../../toolCards/toolResults';
import { basketTotalOf } from '../basket-total';

export const SHOP_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-shop-header';

/** The basket of the last `show_basket`, for the indicator its tool has not set. */
function useShownBasket() {
  const call = useLatestToolCall(['show_basket']);
  const said = basketTotalOf(call);
  return call && said
    ? { value: said.count, label: said.total, order: call.order }
    : undefined;
}

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const shopHeaderPlugin = defineHeaderPlugin({
  id: 'shop-header',
  derive: { basket: useShownBasket },
});

export default shopHeaderPlugin;
