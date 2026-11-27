/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The online shop's product cards (16 November 2026): a grid of products with
 * their photos, a placeholder while each photo loads and the product's name
 * when it cannot be drawn, a quote and a test order with their total; and the
 * Shopper's comparison and basket with the products' photos.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolCallRenderContext } from '../../types/chat';
import {
  PRODUCT_CARDS_WORDS,
  ProductCardsCard,
  readProductCards,
} from '../plugins/product-cards';
import { ProductComparisonCard } from '../plugins/product-comparison';
import { readComparison } from '../plugins/product-comparison/read';
import { readBasket } from '../plugins/shopping-basket/read';

afterEach(() => cleanup());

const PHOTOS = 'https://images.datalayer.io/landing/demo-shop/';

const contextOf = (
  toolName: string,
  result: unknown,
  status: ToolCallRenderContext['status'] = 'complete',
): ToolCallRenderContext =>
  ({
    toolCallId: 'call-1',
    toolName,
    name: toolName,
    args: {},
    status,
    result,
    defaultUI: <span data-testid="row">the chat's row</span>,
  }) as ToolCallRenderContext;

const products = {
  shown: 'products',
  currency: 'USD',
  count: 3,
  products: [
    {
      id: 'tennis-ball',
      title: 'Tennis Ball',
      price: 6.99,
      currency: 'USD',
      rating: 4.06,
      stock: 28,
      image: `${PHOTOS}tennis-ball.jpg`,
    },
    {
      id: 'volleyball',
      title: 'Volleyball',
      price: 11.99,
      currency: 'USD',
      rating: 3.84,
      stock: 0,
      image: `${PHOTOS}volleyball.jpg`,
    },
  ],
};

describe('the product cards', () => {
  it('draw a grid of products, each with its photo, price, rating and stock', () => {
    const view = render(
      <ProductCardsCard context={contextOf('find_products', products)} />,
    );
    expect(view.container.querySelectorAll('[data-product]')).toHaveLength(2);
    const photo = view.getByAltText('Tennis Ball') as HTMLImageElement;
    expect(photo.src).toBe(`${PHOTOS}tennis-ball.jpg`);
    expect(view.getByText('USD 6.99')).toBeTruthy();
    expect(view.getByLabelText('Rated 4.1 out of 5')).toBeTruthy();
    expect(view.getByText('28 in stock')).toBeTruthy();
    expect(view.getByText(PRODUCT_CARDS_WORDS.outOfStock)).toBeTruthy();
    expect(view.getByText('2 of 3 shown')).toBeTruthy();
  });

  it('hold a placeholder while a photo loads, and the name when it cannot be drawn', () => {
    const view = render(
      <ProductCardsCard context={contextOf('find_products', products)} />,
    );
    const [first, second] = Array.from(
      view.container.querySelectorAll('[data-photo-state]'),
    );
    expect(first.getAttribute('data-photo-state')).toBe('loading');
    expect(first.getAttribute('aria-busy')).toBe('true');
    fireEvent.load(view.getByAltText('Tennis Ball'));
    expect(first.getAttribute('data-photo-state')).toBe('loaded');
    fireEvent.error(view.getByAltText('Volleyball'));
    expect(second.getAttribute('data-photo-state')).toBe('failed');
    expect(second.textContent).toBe('Volleyball');
  });

  it('draw one product larger, with its description', () => {
    const view = render(
      <ProductCardsCard
        context={contextOf('get_product', {
          shown: 'products',
          products: [
            {
              ...products.products[0],
              description: 'A standard ball used in the sport of tennis.',
            },
          ],
        })}
      />,
    );
    expect(
      view.getByText(/standard ball used in the sport of tennis/),
    ).toBeTruthy();
  });

  it('draw a quote and a test order with each photo and the total, saying nothing is charged', () => {
    const lines = [
      {
        product_id: 'tennis-ball',
        title: 'Tennis Ball',
        image: `${PHOTOS}tennis-ball.jpg`,
        price: 6.99,
        quantity: 2,
        line_total: 13.98,
      },
    ];
    const quote = render(
      <ProductCardsCard
        context={contextOf('quote_basket', {
          shown: 'quote',
          lines,
          currency: 'USD',
          total: 13.98,
        })}
      />,
    );
    expect(quote.getByRole('heading', { name: 'Quote' })).toBeTruthy();
    expect(quote.getAllByText('USD 13.98')).toHaveLength(2);
    cleanup();
    const order = render(
      <ProductCardsCard
        context={contextOf('pap__placeOrder', {
          order_id: 'TEST-1A2B3C4D',
          test: true,
          charged: false,
          ships: false,
          lines,
          currency: 'USD',
          total: 13.98,
          message: 'Placed.',
        })}
      />,
    );
    expect(
      order.getByRole('heading', { name: 'Test order TEST-1A2B3C4D' }),
    ).toBeTruthy();
    expect(order.getByText(PRODUCT_CARDS_WORDS.testOrderNote)).toBeTruthy();
    expect(order.getByAltText('Tennis Ball')).toBeTruthy();
  });

  it('keep the chat’s row for a refusal, and a placeholder while the call runs', () => {
    const refused = render(
      <ProductCardsCard
        context={contextOf(
          'get_product',
          "Refused: the shop has no product 'tent'.",
        )}
      />,
    );
    expect(refused.getByTestId('row')).toBeTruthy();
    cleanup();
    const running = render(
      <ProductCardsCard
        context={contextOf('find_products', undefined, 'executing')}
      />,
    );
    expect(running.getByLabelText(PRODUCT_CARDS_WORDS.writing)).toBeTruthy();
  });

  it('read an operation’s answer as the tools’ and refuse a photo not over https', () => {
    const read = readProductCards({
      product: {
        id: 'x',
        title: 'X',
        price: 1,
        image: 'http://insecure/x.jpg',
      },
    });
    expect(read).toMatchObject({ kind: 'products', count: 1 });
    expect(read.kind === 'products' && read.products[0].image).toBe('');
    expect(readProductCards({}).kind).toBe('none');
  });
});

describe('the Shopper’s cards with photos', () => {
  it('read each compared product’s and basket item’s photo', () => {
    expect(
      readComparison({
        products: [{ title: 'Tennis Ball', image: `${PHOTOS}tennis-ball.jpg` }],
      }).products[0].image,
    ).toBe(`${PHOTOS}tennis-ball.jpg`);
    expect(
      readBasket({
        currency: 'USD',
        items: [{ title: 'Lemon', price: 0.79, image: 'javascript:alert(1)' }],
      }).items[0].image,
    ).toBe('');
  });

  it('draw the comparison’s photos in a row under it', () => {
    const view = render(
      <ProductComparisonCard
        context={contextOf('show_comparison', {
          shown: 'comparison',
          currency: 'USD',
          products: [
            {
              title: 'Tennis Ball',
              price: 6.99,
              image: `${PHOTOS}tennis-ball.jpg`,
            },
            { title: 'Volleyball', price: 11.99, image: '' },
          ],
        })}
      />,
    );
    expect(view.container.querySelector('[data-a2ui-card]')).toBeTruthy();
    expect(view.getByRole('list', { name: 'Photos' }).children).toHaveLength(1);
    expect(view.getByAltText('Tennis Ball')).toBeTruthy();
  });
});
