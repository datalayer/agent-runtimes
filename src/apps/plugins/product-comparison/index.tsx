/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-product-comparison` — the Shopper's short list,
 * side by side: price, variant, availability, rating and seller, the one it
 * would pick marked with why. Draws `show_comparison` as a message, with the
 * A2UI renderer (`toolCards/a2uiCard`).
 *
 * @module apps/plugins/product-comparison
 */

import type { JSX } from 'react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { A2uiCard, type CardSpec } from '../../toolCards/a2uiCard';
import { readComparison, type Comparison } from './read';

export const PRODUCT_COMPARISON_PLUGIN_NAME =
  '@datalayer/loop-plugin-product-comparison';

export const PRODUCT_COMPARISON_WORDS = {
  title: 'Compared',
  pick: (title: string) => `My pick: ${title}`,
  writing: 'Comparing products…',
  picked: 'Picked',
  count: (count: number) => `${count} products`,
} as const;

/** The comparison as an A2UI card: a table, the pick and why. */
export function comparisonCard(comparison: Comparison, id: string): CardSpec {
  return {
    id: `comparison-${id}`,
    title: PRODUCT_COMPARISON_WORDS.title,
    captions: [
      PRODUCT_COMPARISON_WORDS.count(comparison.products.length),
      ...(comparison.pick
        ? [PRODUCT_COMPARISON_WORDS.pick(comparison.pick)]
        : []),
    ],
    table: {
      columns: ['Product', 'Price', 'Seller', 'Availability', 'Rating'],
      rows: comparison.products.map(product => ({
        Product:
          (product.picked ? `✓ ${product.title}` : product.title) +
          (product.variant ? ` (${product.variant})` : ''),
        Price: money(product.price, product.currency),
        Seller: product.seller,
        Availability: product.availability,
        Rating: product.rating === undefined ? '' : product.rating.toFixed(1),
      })),
    },
    lines: [
      ...(comparison.reason ? [comparison.reason] : []),
      ...comparison.products
        .filter(product => product.url)
        .map(product => `[${product.title}](${product.url})`),
    ],
  };
}

export function ProductComparisonCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const comparison = readComparison(read.data);
  if (comparison.products.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={PRODUCT_COMPARISON_WORDS.writing} />
    );
  }
  return <A2uiCard spec={comparisonCard(comparison, context.toolCallId)} />;
}

export const ProductComparisonPlugin = defineToolCardPlugin({
  id: 'product-comparison',
  displayName: 'Product comparison',
  description:
    'The products the agent compared, side by side, and the one it would pick with why.',
  octicon: 'table',
  emoji: '\u{1F4CA}',
  tools: ['show_comparison'],
  Card: ProductComparisonCard,
});

export { readComparison, type Comparison, type ComparedProduct } from './read';
export default ProductComparisonPlugin;
