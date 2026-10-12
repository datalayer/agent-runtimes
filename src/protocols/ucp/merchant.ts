/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Example Store*, the local UCP test merchant, as a `fetch` (AGENT_PROTOCOLS
 * EX-04, EX-10): the same catalogue, totals, email gate, idempotency and
 * test payment as `agent_runtimes.protocols.ucp.merchant.ExampleStore`, so a
 * page or a test buys from it with no network. A test merchant only: it keeps
 * nothing beyond the page, and refuses any payment but its test handler's.
 *
 * @module protocols/ucp/merchant
 */

import { CHECKOUT_CAPABILITY, SHOPPING_SERVICE, UCP_VERSION } from './index';

type Json = Record<string, any>;

/** The store's products, as the Python store lists them. */
export const EXAMPLE_STORE_CATALOG: Record<
  string,
  { title: string; price: number }
> = {
  tea_sencha: { title: 'Sencha green tea, 100 g', price: 1250 },
  tea_assam: { title: 'Assam black tea, 250 g', price: 1800 },
  mug: { title: 'Stoneware mug', price: 2400 },
};

/** The one payment handler it takes, and the prefix of its test tokens. */
export const EXAMPLE_STORE_HANDLER_ID = 'test_pay_1';
const TEST_TOKEN_PREFIX = 'tok_test_';

interface Checkout {
  id: string;
  status: string;
  lines: Array<{ id: string; quantity: number }>;
  buyer: Json;
  expiresAt: string;
  order?: Json;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const refuse = (status: number, code: string, content: string): Response =>
  json(
    {
      ucp: { version: UCP_VERSION, status: 'error' },
      messages: [{ type: 'error', code, content, severity: 'recoverable' }],
    },
    status,
  );

const meta = () => ({
  version: UCP_VERSION,
  status: 'success',
  capabilities: { [CHECKOUT_CAPABILITY]: [{ version: UCP_VERSION }] },
  payment_handlers: {
    'com.example.test_pay': [
      {
        id: EXAMPLE_STORE_HANDLER_ID,
        version: UCP_VERSION,
        available_instruments: [{ type: 'card' }],
        config: {},
      },
    ],
  },
});

async function fingerprint(path: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(path + body),
  );
  return Array.from(new Uint8Array(digest), b =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** The store: its `fetch`, and the orders it took. */
export function exampleStore(base = 'https://store.example'): {
  fetch: typeof fetch;
  orders: Array<{ order: string; checkout: string }>;
} {
  const checkouts = new Map<string, Checkout>();
  const replies = new Map<
    string,
    { seen: string; status: number; body: Json }
  >();
  const orders: Array<{ order: string; checkout: string }> = [];

  const render = (checkout: Checkout): Json => {
    let subtotal = 0;
    const lines = checkout.lines.map((line, index) => {
      const product = EXAMPLE_STORE_CATALOG[line.id];
      const amount = product.price * line.quantity;
      subtotal += amount;
      return {
        id: `li_${index + 1}`,
        item: { id: line.id, title: product.title, price: product.price },
        quantity: line.quantity,
        totals: [
          { type: 'subtotal', amount },
          { type: 'total', amount },
        ],
      };
    });
    const tax = Math.round(subtotal * 0.08);
    const messages: Json[] = [];
    if (['incomplete', 'ready_for_complete'].includes(checkout.status)) {
      checkout.status = checkout.buyer?.email
        ? 'ready_for_complete'
        : 'incomplete';
      if (!checkout.buyer?.email) {
        messages.push({
          type: 'error',
          code: 'missing',
          path: '$.buyer.email',
          content: 'Buyer email is required',
          severity: 'recoverable',
        });
      }
    }
    return {
      ucp: meta(),
      id: checkout.id,
      status: checkout.status,
      currency: 'USD',
      line_items: lines,
      totals: [
        { type: 'subtotal', amount: subtotal },
        { type: 'tax', amount: tax },
        { type: 'total', amount: subtotal + tax },
      ],
      links: [{ type: 'terms_of_service', url: `${base}/terms` }],
      expires_at: checkout.expiresAt,
      ...(messages.length ? { messages } : {}),
      ...(checkout.buyer?.email ? { buyer: checkout.buyer } : {}),
      ...(checkout.order ? { order: checkout.order } : {}),
    };
  };

  const linesOf = (body: Json): Checkout['lines'] | string => {
    const lines: Checkout['lines'] = [];
    for (const line of body.line_items ?? []) {
      const id = line?.item?.id;
      if (!(id in EXAMPLE_STORE_CATALOG)) {
        return `No product ${id}`;
      }
      lines.push({ id, quantity: Number(line.quantity ?? 1) });
    }
    return lines;
  };

  const handle = (
    method: string,
    path: string,
    body: Json,
  ): { status: number; body: Json } => {
    if (method === 'POST' && path === '/checkout-sessions') {
      const lines = linesOf(body);
      if (typeof lines === 'string') {
        return { status: 404, body: { messages: [{ content: lines }] } };
      }
      const checkout: Checkout = {
        id: `chk_${crypto.randomUUID().slice(0, 12)}`,
        status: 'incomplete',
        lines,
        buyer: body.buyer ?? {},
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
      checkouts.set(checkout.id, checkout);
      return { status: 201, body: render(checkout) };
    }
    const [, , id, action] = path.split('/');
    const checkout = checkouts.get(id);
    if (!checkout) {
      return { status: 404, body: { messages: [{ content: 'No checkout' }] } };
    }
    if (method === 'PUT' && !action) {
      if (!['incomplete', 'ready_for_complete'].includes(checkout.status)) {
        return { status: 409, body: render(checkout) };
      }
      if (body.buyer) {
        checkout.buyer = body.buyer;
      }
      if (body.line_items) {
        const lines = linesOf(body);
        if (typeof lines === 'string') {
          return { status: 404, body: { messages: [{ content: lines }] } };
        }
        checkout.lines = lines;
      }
      return { status: 200, body: render(checkout) };
    }
    if (method === 'POST' && action === 'complete') {
      if (checkout.status !== 'ready_for_complete') {
        return { status: 200, body: render(checkout) };
      }
      const [instrument] = body.payment?.instruments ?? [{}];
      const token = String(instrument?.credential?.token ?? '');
      if (
        instrument?.handler_id !== EXAMPLE_STORE_HANDLER_ID ||
        !token.startsWith(TEST_TOKEN_PREFIX)
      ) {
        return {
          status: 402,
          body: {
            ucp: { version: UCP_VERSION, status: 'error' },
            messages: [
              {
                type: 'error',
                code: 'payment_declined',
                content: 'The payment was declined',
              },
            ],
          },
        };
      }
      const order = {
        id: `ord_${crypto.randomUUID().slice(0, 10)}`,
        permalink_url: `${base}/orders/${checkout.id}`,
      };
      checkout.status = 'completed';
      checkout.order = order;
      orders.push({ order: order.id, checkout: checkout.id });
      return { status: 200, body: render(checkout) };
    }
    if (method === 'POST' && action === 'cancel') {
      if (checkout.status !== 'completed') {
        checkout.status = 'canceled';
      }
      return { status: 200, body: render(checkout) };
    }
    if (method === 'GET' && !action) {
      return { status: 200, body: render(checkout) };
    }
    return { status: 405, body: {} };
  };

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/.well-known/ucp') {
      return json({
        ucp: {
          version: UCP_VERSION,
          services: {
            [SHOPPING_SERVICE]: [
              {
                version: UCP_VERSION,
                transport: 'rest',
                endpoint: `${base}/ucp/v1`,
              },
            ],
          },
          capabilities: { [CHECKOUT_CAPABILITY]: [{ version: UCP_VERSION }] },
          payment_handlers: meta().payment_handlers,
        },
      });
    }
    const headers = new Headers(init?.headers);
    const agent = headers.get('UCP-Agent') ?? '';
    if (!/^profile="https:\/\/[^"]+"$/.test(agent)) {
      return refuse(
        400,
        'invalid_ucp_agent',
        'UCP-Agent names its profile over https',
      );
    }
    if (!headers.get('Request-Id')) {
      return refuse(400, 'missing_request_id', 'Request-Id is required');
    }
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace(/^\/ucp\/v1/, '');
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body = raw ? JSON.parse(raw) : {};
    if (path === '/catalog/search') {
      const query = String(body.query ?? '').toLowerCase();
      return json({
        ucp: { version: UCP_VERSION },
        products: Object.entries(EXAMPLE_STORE_CATALOG)
          .filter(([, product]) => product.title.toLowerCase().includes(query))
          .map(([id, product]) => ({ id, title: product.title })),
      });
    }
    if (method === 'GET') {
      const answer = handle(method, path, body);
      return json(answer.body, answer.status);
    }
    const key = headers.get('Idempotency-Key');
    if (!key) {
      return refuse(
        400,
        'missing_idempotency_key',
        'Idempotency-Key is required',
      );
    }
    const seen = await fingerprint(url.pathname, raw);
    const replied = replies.get(key);
    if (replied) {
      return replied.seen === seen
        ? json(replied.body, replied.status)
        : refuse(
            409,
            'idempotency_conflict',
            'the key was used for another request',
          );
    }
    const answer = handle(method, path, body);
    replies.set(key, { seen, ...answer });
    return json(answer.body, answer.status);
  }) as typeof fetch;

  return { fetch: fetchImpl, orders };
}
