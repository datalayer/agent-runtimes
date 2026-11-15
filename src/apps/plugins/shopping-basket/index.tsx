/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-shopping-basket` — the Shopper's basket: each item
 * with its seller, quantity and price, the shipping, the total summed here,
 * and the seller's checkout when there is no connection to buy through.
 * Draws `show_basket`. Nothing is bought from it: a purchase is approved on
 * the company's own terms (`pap-purchase`).
 *
 * @module apps/plugins/shopping-basket
 */

import type { JSX } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Link, Text } from '@primer/react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readBasket, type BasketItem } from './read';

export const SHOPPING_BASKET_PLUGIN_NAME =
  '@datalayer/loop-plugin-shopping-basket';

export const SHOPPING_BASKET_WORDS = {
  title: 'Your basket',
  writing: 'Putting the basket together…',
  shipping: 'Shipping',
  total: 'Total',
  partial: 'A price is missing: the total is not the whole.',
  nothingBought:
    'Nothing is bought until you approve the exact purchase: the items, the seller and the total.',
  checkout: 'Pay at the seller’s checkout',
} as const;

export function ShoppingBasketCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const basket = readBasket(read.data);
  if (basket.items.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={SHOPPING_BASKET_WORDS.writing} />
    );
  }
  const { currency } = basket;
  return (
    <CardFrame
      title={SHOPPING_BASKET_WORDS.title}
      subtitle={basket.note || undefined}
    >
      <CardTable<BasketItem>
        caption={`${basket.items.length} items`}
        rows={basket.items}
        rowKey={(row, index) => `${row.title}-${index}`}
        columns={[
          {
            key: 'title',
            title: 'Item',
            cell: row => (
              <>
                {row.url ? (
                  <Link href={row.url} target="_blank" rel="noreferrer">
                    {row.title}
                  </Link>
                ) : (
                  row.title
                )}
                {row.variant || row.seller ? (
                  <Text as="div" sx={{ color: 'fg.muted', fontSize: 0 }}>
                    {[row.variant, row.seller].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
              </>
            ),
          },
          {
            key: 'quantity',
            title: 'Qty',
            align: 'right',
            cell: row => row.quantity,
          },
          {
            key: 'price',
            title: 'Price',
            align: 'right',
            cell: row => money(row.price, currency),
          },
        ]}
      />
      <Box
        display="flex"
        justifyContent="flex-end"
        flexDirection="column"
        alignItems="flex-end"
        mt={2}
      >
        {basket.shipping !== undefined ? (
          <Text sx={{ fontSize: 1 }}>
            {SHOPPING_BASKET_WORDS.shipping}: {money(basket.shipping, currency)}
          </Text>
        ) : null}
        <Text sx={{ fontSize: 2, fontWeight: 'bold' }} data-basket-total>
          {SHOPPING_BASKET_WORDS.total}: {money(basket.total, currency)}
        </Text>
        {basket.partial ? (
          <Text sx={{ fontSize: 0, color: 'attention.fg' }}>
            {SHOPPING_BASKET_WORDS.partial}
          </Text>
        ) : null}
      </Box>
      <Text as="p" sx={{ mt: 2, mb: 0, fontSize: 0, color: 'fg.muted' }}>
        {SHOPPING_BASKET_WORDS.nothingBought}
      </Text>
      {basket.checkoutUrl ? (
        <Link href={basket.checkoutUrl} target="_blank" rel="noreferrer">
          {SHOPPING_BASKET_WORDS.checkout}
        </Link>
      ) : null}
    </CardFrame>
  );
}

export const ShoppingBasketPlugin = defineToolCardPlugin({
  id: 'shopping-basket',
  displayName: 'Shopping basket',
  description:
    'The basket the agent put together: each item, its seller and price, the shipping and the total.',
  octicon: 'package',
  emoji: '\u{1F6D2}',
  tools: ['show_basket'],
  Card: ShoppingBasketCard,
});

export { readBasket, type Basket, type BasketItem } from './read';
export default ShoppingBasketPlugin;
