/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The demo shop's answers, read for its product cards. Pure.
 *
 * Its tools answer `{shown: 'products', products}`, `{shown: 'quote',
 * lines, total}` and `{shown: 'test_order', order_id, lines, total}`
 * (`agent_runtimes.tools.demo_shop`); its operations, called over MCP or
 * PAP, answer the same `products`, `lines` and `total` without `shown`.
 *
 * @module apps/plugins/product-cards/read
 */

import {
  amount,
  records,
  safeImage,
  words,
  type Data,
} from '../../toolCards/kit';

export type ProductCardItem = {
  id: string;
  title: string;
  category: string;
  brand: string;
  price?: number;
  currency: string;
  rating?: number;
  stock?: number;
  image: string;
  description: string;
};

export type OrderLine = {
  id: string;
  title: string;
  image: string;
  price?: number;
  quantity: number;
  lineTotal?: number;
};

export type ProductCards =
  | { kind: 'products'; products: ProductCardItem[]; count: number }
  | {
      kind: 'quote' | 'test_order';
      lines: OrderLine[];
      currency: string;
      total?: number;
      orderId: string;
      note: string;
    }
  | { kind: 'none' };

function product(data: Data, currency: string): ProductCardItem {
  const stock = amount(data.stock);
  return {
    id: words(data.id),
    title: words(data.title),
    category: words(data.category),
    brand: words(data.brand),
    price: amount(data.price),
    currency: words(data.currency) || currency,
    rating: amount(data.rating),
    stock: stock === undefined ? undefined : Math.max(0, Math.floor(stock)),
    image: safeImage(data.image) || safeImage(data.thumbnail),
    description: words(data.description),
  };
}

function line(data: Data): OrderLine {
  const quantity = amount(data.quantity);
  return {
    id: words(data.product_id) || words(data.id),
    title: words(data.title),
    image: safeImage(data.image),
    price: amount(data.price),
    quantity: quantity !== undefined && quantity > 0 ? quantity : 1,
    lineTotal: amount(data.line_total),
  };
}

/** What the cards draw: products, a quote, a test order, or nothing. */
export function readProductCards(data: Data): ProductCards {
  const currency = words(data.currency);
  const single = data.product ? [data.product] : [];
  const products = records(data.products ?? single)
    .map(each => product(each, currency))
    .filter(each => each.title);
  if (products.length > 0) {
    const count = amount(data.count);
    return {
      kind: 'products',
      products,
      count:
        count !== undefined && count > products.length
          ? count
          : products.length,
    };
  }
  const lines = records(data.lines)
    .map(line)
    .filter(each => each.title);
  if (lines.length > 0) {
    const orderId = words(data.order_id);
    return {
      kind: data.shown === 'test_order' || orderId ? 'test_order' : 'quote',
      lines,
      currency,
      total: amount(data.total),
      orderId,
      note: words(data.note) || words(data.message),
    };
  }
  return { kind: 'none' };
}
