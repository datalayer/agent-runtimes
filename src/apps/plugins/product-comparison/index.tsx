/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-product-comparison` — the Shopper's short list,
 * side by side: price, variant, availability, rating and seller, the one it
 * would pick marked with why. Draws `show_comparison`.
 *
 * @module apps/plugins/product-comparison
 */

import type { JSX } from 'react';
import { Label, Link, Text } from '@primer/react';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readComparison, type ComparedProduct } from './read';

export const PRODUCT_COMPARISON_PLUGIN_NAME =
  '@datalayer/loop-plugin-product-comparison';

export const PRODUCT_COMPARISON_WORDS = {
  title: 'Compared',
  pick: (title: string) => `My pick: ${title}`,
  writing: 'Comparing products…',
  picked: 'Picked',
} as const;

export function ProductComparisonCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const { products, pick, reason } = readComparison(read.data);
  if (products.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={PRODUCT_COMPARISON_WORDS.writing} />
    );
  }
  return (
    <CardFrame
      title={PRODUCT_COMPARISON_WORDS.title}
      subtitle={pick ? PRODUCT_COMPARISON_WORDS.pick(pick) : undefined}
    >
      <CardTable<ComparedProduct>
        caption={`${products.length} products`}
        rows={products}
        rowKey={(row, index) => `${row.title}-${index}`}
        columns={[
          {
            key: 'title',
            title: 'Product',
            cell: row => (
              <>
                {row.url ? (
                  <Link href={row.url} target="_blank" rel="noreferrer">
                    {row.title}
                  </Link>
                ) : (
                  row.title
                )}{' '}
                {row.picked ? (
                  <Label variant="success">
                    {PRODUCT_COMPARISON_WORDS.picked}
                  </Label>
                ) : null}
                {row.variant ? (
                  <Text as="div" sx={{ color: 'fg.muted', fontSize: 0 }}>
                    {row.variant}
                  </Text>
                ) : null}
              </>
            ),
          },
          {
            key: 'price',
            title: 'Price',
            align: 'right',
            cell: row => money(row.price, row.currency),
          },
          { key: 'seller', title: 'Seller', cell: row => row.seller },
          {
            key: 'availability',
            title: 'Availability',
            cell: row => row.availability,
          },
          {
            key: 'rating',
            title: 'Rating',
            align: 'right',
            cell: row =>
              row.rating === undefined ? '' : row.rating.toFixed(1),
          },
        ]}
      />
      {reason ? (
        <Text as="p" sx={{ mt: 2, mb: 0, fontSize: 1 }}>
          {reason}
        </Text>
      ) : null}
    </CardFrame>
  );
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
