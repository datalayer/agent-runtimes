/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Shopper's basket (`show_basket`), read. Pure.
 *
 * @module apps/plugins/shopping-basket/read
 */

import {
  amount,
  records,
  safeUrl,
  words,
  type Data,
} from '../../toolCards/kit';

export type BasketItem = {
  title: string;
  seller: string;
  variant: string;
  quantity: number;
  price?: number;
  url: string;
};

export type Basket = {
  items: BasketItem[];
  currency: string;
  shipping?: number;
  /** The items' sum and the shipping: computed here, never the agent's word alone. */
  total: number;
  /** Whether a price was missing, so the total is not the whole. */
  partial: boolean;
  checkoutUrl: string;
  note: string;
};

export function readBasket(data: Data): Basket {
  const items = records(data.items)
    .map(item => {
      const quantity = amount(item.quantity);
      return {
        title: words(item.title),
        seller: words(item.seller),
        variant: words(item.variant),
        quantity: quantity !== undefined && quantity > 0 ? quantity : 1,
        price: amount(item.price),
        url: safeUrl(item.url),
      };
    })
    .filter(item => item.title);
  const shipping = amount(data.shipping);
  const partial = items.some(item => item.price === undefined);
  const sum = items.reduce(
    (total, item) => total + (item.price ?? 0) * item.quantity,
    0,
  );
  return {
    items,
    currency: words(data.currency),
    shipping,
    total: Math.round((sum + (shipping ?? 0)) * 100) / 100,
    partial,
    checkoutUrl: safeUrl(data.checkout_url),
    note: words(data.note),
  };
}
