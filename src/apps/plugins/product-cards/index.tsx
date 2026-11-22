/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-product-cards` — products as cards, each with its
 * photo, title, price, rating and stock, a grid for a list; a quote or a test
 * order as its lines, each with its photo, and the total. Draws the demo
 * shop's tools (`list_products`, `find_products`, `get_product`,
 * `quote_basket`, `place_test_order`) in its own chat and in the Shopper's,
 * and its operations (`listProducts`, `findProducts`, `getProduct`,
 * `placeOrder`) called through a server.
 *
 * Drawn with primer-addons' `Card` rather than the A2UI renderer: a grid and
 * a photo's placeholder while it loads are not in the A2UI catalogue.
 *
 * @module apps/plugins/product-cards
 */

import type { JSX } from 'react';
import { Heading, Text } from '@primer/react';
import { Box, Card } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { ProductPhoto } from '../../toolCards/productPhoto';
import { readProductCards, type OrderLine, type ProductCardItem } from './read';

export const PRODUCT_CARDS_PLUGIN_NAME =
  '@datalayer/agent-plugin-product-cards';

export const PRODUCT_CARDS_WORDS = {
  products: 'Products',
  writing: 'Looking at the shop…',
  more: (shown: number, count: number) => `${shown} of ${count} shown`,
  rating: (rating: number) => `Rated ${rating.toFixed(1)} out of 5`,
  inStock: (stock: number) => `${stock} in stock`,
  outOfStock: 'Out of stock',
  quote: 'Quote',
  quoteNote: 'A quote, not an order: nothing is reserved.',
  testOrder: (orderId: string) =>
    orderId ? `Test order ${orderId}` : 'Test order',
  testOrderNote: 'A test order: nothing is charged and nothing ships.',
  total: 'Total',
  each: (price: string) => `${price} each`,
} as const;

function Stars({ rating }: { rating: number }): JSX.Element {
  return (
    <Text
      aria-label={PRODUCT_CARDS_WORDS.rating(rating)}
      sx={{ fontSize: 0, color: 'attention.fg', whiteSpace: 'nowrap' }}
    >
      {'★'} {rating.toFixed(1)}
    </Text>
  );
}

function Stock({ stock }: { stock: number }): JSX.Element {
  return (
    <Text
      sx={{
        fontSize: 0,
        color: stock > 0 ? 'fg.muted' : 'danger.fg',
        whiteSpace: 'nowrap',
      }}
    >
      {stock > 0
        ? PRODUCT_CARDS_WORDS.inStock(stock)
        : PRODUCT_CARDS_WORDS.outOfStock}
    </Text>
  );
}

/** One product: its photo over its title, price, rating and stock. */
export function ProductCard({
  product,
  detailed = false,
}: {
  product: ProductCardItem;
  detailed?: boolean;
}): JSX.Element {
  return (
    <Card
      as="li"
      border
      shadow="none"
      overflow="hidden"
      data-product={product.id || product.title}
    >
      <ProductPhoto
        url={product.image}
        alt={product.title}
        height={detailed ? 220 : 140}
      />
      <Card.Content p={2}>
        <Text as="div" sx={{ fontSize: 1, fontWeight: 'semibold' }}>
          {product.title}
        </Text>
        {product.brand ? (
          <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
            {product.brand}
          </Text>
        ) : null}
        <Text as="div" sx={{ fontSize: 2, fontWeight: 'bold', mt: 1 }}>
          {money(product.price, product.currency)}
        </Text>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          gap={2}
          mt={1}
        >
          {product.rating !== undefined ? (
            <Stars rating={product.rating} />
          ) : (
            <span />
          )}
          {product.stock !== undefined ? <Stock stock={product.stock} /> : null}
        </Box>
        {detailed && product.description ? (
          <Text as="p" sx={{ fontSize: 1, mt: 2, mb: 0 }}>
            {product.description}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
  );
}

/** The products: a grid, or one product larger. */
export function ProductGrid({
  products,
  count,
}: {
  products: ProductCardItem[];
  count: number;
}): JSX.Element {
  const one = products.length === 1;
  return (
    <Box
      as="section"
      aria-label={PRODUCT_CARDS_WORDS.products}
      my={2}
      width="100%"
      maxWidth={one ? 360 : 720}
    >
      <Box
        as="ul"
        m={0}
        p={0}
        sx={{
          listStyle: 'none',
          display: 'grid',
          gap: 2,
          gridTemplateColumns: one
            ? '1fr'
            : 'repeat(auto-fill, minmax(160px, 1fr))',
        }}
      >
        {products.map((product, index) => (
          <ProductCard
            key={`${product.id || product.title}-${index}`}
            product={product}
            detailed={one}
          />
        ))}
      </Box>
      {count > products.length ? (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 1, mb: 0 }}>
          {PRODUCT_CARDS_WORDS.more(products.length, count)}
        </Text>
      ) : null}
    </Box>
  );
}

/** A quote or a test order: each line with its photo, and the total. */
export function OrderCard({
  title,
  note,
  lines,
  currency,
  total,
  test,
}: {
  title: string;
  note: string;
  lines: OrderLine[];
  currency: string;
  total?: number;
  test: boolean;
}): JSX.Element {
  return (
    <Card
      as="section"
      aria-label={title}
      border
      shadow="none"
      variant={test ? 'success' : 'default'}
      my={2}
      p={3}
      width="100%"
      maxWidth={520}
    >
      <Heading as="h4" sx={{ fontSize: 2, mb: 1 }}>
        {title}
      </Heading>
      <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mt: 0, mb: 2 }}>
        {note}
      </Text>
      <Box as="ul" m={0} p={0} sx={{ listStyle: 'none' }}>
        {lines.map((line, index) => (
          <Box
            as="li"
            key={`${line.id || line.title}-${index}`}
            display="flex"
            alignItems="center"
            gap={2}
            py={2}
            borderTop={index === 0 ? undefined : '1px solid'}
            borderColor="border.muted"
          >
            <Box width={48} borderRadius={2} overflow="hidden" flexShrink={0}>
              <ProductPhoto url={line.image} alt={line.title} height={48} />
            </Box>
            <Box flex={1} minWidth={0}>
              <Text as="div" sx={{ fontSize: 1 }}>
                {line.quantity} × {line.title}
              </Text>
              {line.price !== undefined ? (
                <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {PRODUCT_CARDS_WORDS.each(money(line.price, currency))}
                </Text>
              ) : null}
            </Box>
            <Text sx={{ fontSize: 1, whiteSpace: 'nowrap' }}>
              {money(
                line.lineTotal ??
                  (line.price === undefined
                    ? undefined
                    : line.price * line.quantity),
                currency,
              )}
            </Text>
          </Box>
        ))}
      </Box>
      {total !== undefined ? (
        <Box
          display="flex"
          justifyContent="space-between"
          pt={2}
          borderTop="1px solid"
          borderColor="border.default"
        >
          <Text sx={{ fontWeight: 'bold' }}>{PRODUCT_CARDS_WORDS.total}</Text>
          <Text sx={{ fontWeight: 'bold' }}>{money(total, currency)}</Text>
        </Box>
      ) : null}
    </Card>
  );
}

export function ProductCardsCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  if (!read.done) {
    return <CardSkeleton label={PRODUCT_CARDS_WORDS.writing} />;
  }
  const cards = readProductCards(read.data);
  if (cards.kind === 'products') {
    return <ProductGrid products={cards.products} count={cards.count} />;
  }
  if (cards.kind === 'quote' || cards.kind === 'test_order') {
    const test = cards.kind === 'test_order';
    return (
      <OrderCard
        title={
          test
            ? PRODUCT_CARDS_WORDS.testOrder(cards.orderId)
            : PRODUCT_CARDS_WORDS.quote
        }
        note={
          test
            ? PRODUCT_CARDS_WORDS.testOrderNote
            : PRODUCT_CARDS_WORDS.quoteNote
        }
        lines={cards.lines}
        currency={cards.currency}
        total={cards.total}
        test={test}
      />
    );
  }
  return <>{context.defaultUI}</>;
}

export const ProductCardsPlugin = defineToolCardPlugin({
  id: 'product-cards',
  displayName: 'Product cards',
  description:
    'Products as cards — photo, title, price, rating and stock, a grid for a list — and a quote or a test order with each photo and the total.',
  octicon: 'apps',
  emoji: '\u{1F6CD}\u{FE0F}',
  tools: [
    'list_products',
    'find_products',
    'get_product',
    'quote_basket',
    'place_test_order',
    'listProducts',
    'findProducts',
    'getProduct',
    'placeOrder',
  ],
  Card: ProductCardsCard,
});

export {
  readProductCards,
  type OrderLine,
  type ProductCardItem,
  type ProductCards,
} from './read';
export default ProductCardsPlugin;
