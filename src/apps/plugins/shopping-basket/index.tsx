/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-shopping-basket` — the Shopper's basket, as a
 * message drawn by the A2UI renderer: each item with its seller, quantity
 * and price, the shipping, the total summed here. **Buy** sends *buy this
 * basket* as the person's next turn: the agent then proposes the purchase at
 * the company, which is approved on its exact terms (`pap-purchase`), or
 * gives the seller's checkout. Nothing is bought from the card itself.
 * Draws `show_basket`, the items' photos in a row under it when they have
 * them.
 *
 * @module apps/plugins/shopping-basket
 */

import type { JSX } from 'react';
import { useState } from 'react';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
  submitCard,
  useToolCardSend,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { PhotoStrip } from '../../toolCards/productPhoto';
import { readBasket, type Basket } from './read';

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
  buy: 'Buy',
  asked: 'Asked: approve the purchase when the agent shows it.',
  form: 'Buy this basket',
} as const;

/** The action **Buy** sends. */
export const BUY_ACTION = 'buy_basket';

/** The basket as an A2UI card. */
export function basketCard(
  basket: Basket,
  id: string,
  options: { buy?: boolean; asked?: boolean } = {},
): CardSpec {
  const { currency } = basket;
  return {
    id: `basket-${id}`,
    title: SHOPPING_BASKET_WORDS.title,
    captions: basket.note ? [basket.note] : [],
    table: {
      columns: ['Item', 'Qty', 'Price'],
      rows: basket.items.map(item => ({
        Item: [item.title, item.variant, item.seller]
          .filter(Boolean)
          .join(' · '),
        Qty: String(item.quantity),
        Price: money(item.price, currency),
      })),
    },
    lines: [
      ...(basket.shipping !== undefined
        ? [
            `${SHOPPING_BASKET_WORDS.shipping}: ${money(basket.shipping, currency)}`,
          ]
        : []),
      `**${SHOPPING_BASKET_WORDS.total}: ${money(basket.total, currency)}**`,
      ...(basket.partial ? [SHOPPING_BASKET_WORDS.partial] : []),
      options.asked
        ? SHOPPING_BASKET_WORDS.asked
        : SHOPPING_BASKET_WORDS.nothingBought,
      ...(basket.checkoutUrl
        ? [`[${SHOPPING_BASKET_WORDS.checkout}](${basket.checkoutUrl})`]
        : []),
    ],
    actions:
      options.buy && !options.asked
        ? [
            {
              name: BUY_ACTION,
              label: SHOPPING_BASKET_WORDS.buy,
              primary: true,
            },
          ]
        : [],
  };
}

export function ShoppingBasketCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const send = useToolCardSend();
  const [asked, setAsked] = useState(false);
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
  const onAction = (action: A2uiClientAction) => {
    if (action.name === BUY_ACTION && send) {
      setAsked(
        submitCard(send, {
          title: SHOPPING_BASKET_WORDS.form,
          values: {
            items: basket.items.map(item => `${item.quantity} × ${item.title}`),
            total: money(basket.total, basket.currency),
          },
        }),
      );
    }
  };
  return (
    <>
      <A2uiCard
        spec={basketCard(basket, context.toolCallId, {
          buy: Boolean(send) && read.done,
          asked,
        })}
        onAction={onAction}
      />
      <PhotoStrip
        photos={basket.items.map(item => ({
          url: item.image,
          alt: item.title,
        }))}
      />
    </>
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
