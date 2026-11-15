/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Shopper's comparison (`show_comparison`), read. Pure.
 *
 * @module apps/plugins/product-comparison/read
 */

import {
  amount,
  records,
  safeUrl,
  words,
  type Data,
} from '../../toolCards/kit';

export type ComparedProduct = {
  title: string;
  seller: string;
  variant: string;
  price?: number;
  currency: string;
  availability: string;
  rating?: number;
  url: string;
  picked: boolean;
};

export type Comparison = {
  products: ComparedProduct[];
  pick: string;
  reason: string;
};

/** The products compared, the one picked marked, from what the agent passed or the tool answered. */
export function readComparison(data: Data): Comparison {
  const pick = words(data.pick);
  const fallbackCurrency = words(data.currency);
  const products = records(data.products)
    .map(product => {
      const title = words(product.title);
      return {
        title,
        seller: words(product.seller),
        variant: words(product.variant),
        price: amount(product.price),
        currency: words(product.currency) || fallbackCurrency,
        availability: words(product.availability),
        rating: amount(product.rating),
        url: safeUrl(product.url),
        picked: Boolean(pick) && (pick === title || pick === words(product.id)),
      };
    })
    .filter(product => product.title);
  return { products, pick, reason: words(data.reason) };
}
