/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's page at its address (`{name}.web.<domain>`): what it is, its
 * operations, its agent and its four addresses, in its own theme.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_VIEW_ID,
  AgentWebPage,
  GALLERY_PATH,
  GALLERY_WORDS,
  loadGallery,
  readAgentView,
  roleOf,
  visibilityOf,
  type AgentView,
} from '../AgentWebPage';

afterEach(() => {
  cleanup();
});

const VIEW: AgentView = {
  id: 'shop',
  name: 'Shop',
  description: 'Sells lamps.',
  emoji: '🛍️',
  kind: 'chat',
  role: 'company',
  acts_for: '',
  agent: {
    id: 'worker-shopper',
    name: 'Shopper',
    description: 'Finds things.',
    model: 'bedrock:us.anthropic.claude-sonnet-4-6',
    mcp_servers: ['tavily'],
    skills: ['crawl'],
    tools: [{ name: 'lookup_order', description: 'Finds an order.' }],
  },
  operations: [
    {
      operation_id: 'quote',
      method: 'POST',
      path: '/quote',
      summary: 'The total of a basket',
      description: '',
      inputs: {
        type: 'object',
        properties: { items: { type: 'array' } },
        required: ['items'],
      },
      output: { type: 'object', properties: { total: { type: 'number' } } },
      pap: { action: 'orders.quote', scope: 'orders:read' },
    },
  ],
  declares_openapi: true,
  protocols: ['pap', 'a2a'],
  visibility: 'private',
  addresses: {
    agent: {
      host: 'shop.agent.datalayer.ai',
      url: 'https://shop.agent.datalayer.ai',
    },
    mcp: {
      host: 'shop.mcp.datalayer.ai',
      url: 'https://shop.mcp.datalayer.ai/mcp',
    },
    api: {
      host: 'shop.api.datalayer.ai',
      url: 'https://shop.api.datalayer.ai',
    },
    web: {
      host: 'shop.web.datalayer.ai',
      url: 'https://shop.web.datalayer.ai',
    },
  },
  interface: { accent: 'violet', theme: { variant: 'loop', mode: 'light' } },
};

describe('an agent at its address', () => {
  it('shows what it is, its four addresses, its operations and its agent', () => {
    const { getByText, getAllByText } = render(<AgentWebPage view={VIEW} />);
    expect(getByText('Shop')).toBeTruthy();
    expect(getByText('A company’s agent')).toBeTruthy();
    expect(getByText('https://shop.mcp.datalayer.ai/mcp')).toBeTruthy();
    expect(getByText('https://shop.api.datalayer.ai')).toBeTruthy();
    expect(getAllByText('Copy')).toHaveLength(4);
    expect(getByText('The total of a basket')).toBeTruthy();
    expect(getByText('The person approves · orders:read')).toBeTruthy();
    expect(getByText('items')).toBeTruthy();
    expect(getByText('total')).toBeTruthy();
    expect(getByText('tavily')).toBeTruthy();
    expect(getByText('lookup_order')).toBeTruthy();
    expect(getByText(visibilityOf('private'))).toBeTruthy();
  });

  it('says whose a person’s own agent is, and asks anything of one that declares no operations', () => {
    const view: AgentView = {
      ...VIEW,
      role: 'personal',
      acts_for: 'eric',
      declares_openapi: false,
      addresses: null,
    };
    const { getByText, queryByText } = render(<AgentWebPage view={view} />);
    expect(getByText('eric’s own agent')).toBeTruthy();
    expect(getByText(/ask it anything/)).toBeTruthy();
    expect(queryByText('Where it is')).toBeNull();
    expect(roleOf({ role: 'app', acts_for: '' })).toBe('An application');
  });

  it('reads the view its web server wrote into the page', () => {
    const tag = document.createElement('script');
    tag.id = AGENT_VIEW_ID;
    tag.type = 'application/json';
    tag.textContent = JSON.stringify(VIEW);
    document.head.appendChild(tag);
    expect(readAgentView().name).toBe('Shop');
    tag.remove();
    expect(() => readAgentView()).toThrow(/agent's web server/);
  });
});

describe('a gallery on the page', () => {
  const PRODUCTS = {
    products: [
      {
        id: 'tennis-ball',
        title: 'Tennis Ball',
        price: 6.99,
        currency: 'USD',
        rating: 4.1,
        stock: 28,
        image: 'https://images.datalayer.io/landing/demo-shop/tennis-ball.jpg',
      },
      {
        id: 'tennis-racket',
        title: 'Tennis Racket',
        price: 49.99,
        currency: 'USD',
        rating: 4.6,
        stock: 0,
        image:
          'https://images.datalayer.io/landing/demo-shop/tennis-racket.jpg',
      },
    ],
    count: 2,
  };
  const answering = (status: number, body: unknown) =>
    vi.fn(async () => ({
      ok: status < 400,
      status,
      json: async () => body,
    })) as unknown as typeof fetch;

  it('shows skeletons, then the products its gallery operation answers, as the chat’s product cards', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise(resolve => {
          answer = resolve;
        }),
    ) as unknown as typeof fetch;
    const view: AgentView = {
      ...VIEW,
      gallery: { operation_id: 'listProducts', title: 'The shop’s products' },
    };
    const { container, getByText, getByLabelText } = render(
      <AgentWebPage view={view} fetcher={fetcher} />,
    );
    expect(getByText('The shop’s products')).toBeTruthy();
    expect(getByLabelText(GALLERY_WORDS.loading)).toBeTruthy();
    expect(container.querySelectorAll('[data-skeleton]').length).toBe(6);
    expect(fetcher).toHaveBeenCalledWith(
      GALLERY_PATH,
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    answer({ ok: true, status: 200, json: async () => PRODUCTS });
    await waitFor(() => expect(getByText('Tennis Racket')).toBeTruthy());
    expect(getByText('Tennis Ball')).toBeTruthy();
    expect(container.querySelectorAll('[data-product]').length).toBe(2);
    expect(container.querySelectorAll('[data-skeleton]').length).toBe(0);
    expect(getByText('Out of stock')).toBeTruthy();
    expect(getByLabelText('Rated 4.6 out of 5')).toBeTruthy();
  });

  it('shows no gallery for an application whose openapi names none', () => {
    const fetcher = answering(200, PRODUCTS);
    const { queryByText } = render(
      <AgentWebPage view={{ ...VIEW, gallery: null }} fetcher={fetcher} />,
    );
    expect(queryByText(GALLERY_WORDS.title)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('says why the products could not be shown, and when there are none', async () => {
    expect(
      await loadGallery(answering(403, { detail: 'Only the owner.' })),
    ).toEqual({ kind: 'failed', detail: 'Only the owner.' });
    expect(await loadGallery(answering(502, 'oops'))).toEqual({
      kind: 'failed',
      detail: 'HTTP 502',
    });
    expect(await loadGallery(answering(200, { products: [] }))).toEqual({
      kind: 'shown',
      products: [],
      count: 0,
    });
    const view: AgentView = {
      ...VIEW,
      gallery: { operation_id: 'listProducts', title: '' },
    };
    const { findByText } = render(
      <AgentWebPage
        view={view}
        fetcher={answering(429, { detail: 'Too many calls.' })}
      />,
    );
    expect(
      await findByText(GALLERY_WORDS.failed('Too many calls.')),
    ).toBeTruthy();
  });
});
