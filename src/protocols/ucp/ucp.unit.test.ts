/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UCP 2026-08-25 in TypeScript (AGENT_PROTOCOLS PR-30 to PR-32, PR-51,
 * PR-53): the revision fixture the Python package reads, and a purchase
 * proposed, approved and made once against an in-memory store that answers
 * as `agent_runtimes.protocols.ucp.merchant` does.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/ucp/fixtures/checkout.json';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  UCP_ACTION_CLASSES,
  UcpApprovers,
  UcpPaymentInstruments,
  UcpClient,
  checkoutSummary,
  negotiateCapabilities,
  proposalSummary,
  revisionOf,
  type CheckoutProposal,
} from './index';

const STORE = 'https://store.example';
const TOKEN = 'tok_test_4242_never_shown';

/** The test merchant's answers, in memory: one product, the email gate, idempotent changes. */
function store() {
  const checkouts = new Map<
    string,
    { quantity: number; email?: string; status: string }
  >();
  const replies = new Map<string, Response>();
  const orders: string[] = [];
  const meta = fixture.checkout.ucp;
  const render = (id: string) => {
    const c = checkouts.get(id)!;
    if (c.status === 'incomplete' || c.status === 'ready_for_complete') {
      c.status = c.email ? 'ready_for_complete' : 'incomplete';
    }
    const subtotal = 1250 * c.quantity;
    const tax = Math.round(subtotal * 0.08);
    return {
      ...fixture.checkout,
      ucp: meta,
      id,
      status: c.status,
      line_items: [
        {
          ...fixture.checkout.line_items[0],
          quantity: c.quantity,
          totals: [
            { type: 'subtotal', amount: subtotal },
            { type: 'total', amount: subtotal },
          ],
        },
      ],
      totals: [
        { type: 'subtotal', amount: subtotal },
        { type: 'tax', amount: tax },
        { type: 'total', amount: subtotal + tax },
      ],
      buyer: c.email ? { email: c.email } : undefined,
      ...(c.status === 'completed'
        ? { order: { id: 'ord_1', permalink_url: `${STORE}/o/1` } }
        : {}),
    };
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    if (url.pathname === '/.well-known/ucp') {
      return json({
        ucp: {
          version: '2026-08-25',
          services: {
            'dev.ucp.shopping': [
              {
                version: '2026-08-25',
                transport: 'rest',
                endpoint: `${STORE}/ucp/v1`,
              },
            ],
          },
          capabilities: {
            'dev.ucp.shopping.checkout': [{ version: '2026-08-25' }],
          },
          payment_handlers: meta.payment_handlers,
        },
      });
    }
    expect(headers.get('UCP-Agent')).toBe(
      'profile="https://agent.example/.well-known/ucp"',
    );
    const key = headers.get('Idempotency-Key');
    if (key && replies.has(key)) {
      return replies.get(key)!.clone();
    }
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = url.pathname.replace('/ucp/v1', '');
    let reply: Response;
    if (path === '/catalog/search') {
      reply = json({
        ucp: { version: '2026-08-25' },
        products: [{ id: 'tea_sencha' }],
      });
    } else if (path === '/checkout-sessions') {
      const id = `chk_${checkouts.size + 1}`;
      checkouts.set(id, {
        quantity: body.line_items[0].quantity,
        status: 'incomplete',
      });
      reply = json(render(id), 201);
    } else {
      const [, , id, action] = path.split('/');
      const c = checkouts.get(id)!;
      if (init?.method === 'PUT') {
        c.email = body.buyer?.email ?? c.email;
        c.quantity = body.line_items?.[0]?.quantity ?? c.quantity;
      } else if (action === 'complete') {
        expect(body.payment.instruments[0].credential.token).toBe(TOKEN);
        c.status = 'completed';
        orders.push(id);
      }
      reply = json(render(id));
    }
    if (key) {
      replies.set(key, reply.clone());
    }
    return reply;
  }) as typeof fetch;
  return { fetchImpl, orders };
}

function host(approve = true) {
  const asked: CheckoutProposal[] = [];
  return {
    asked,
    plugin: definePlugin({
      name: 'host',
      contributes: [
        contribution(
          UcpApprovers,
          {
            approve: async (p: CheckoutProposal) => {
              asked.push(p);
              return approve;
            },
          },
          { id: 'person', order: 10 },
        ),
        contribution(
          UcpPaymentInstruments,
          {
            instrument: async () => ({
              id: 'pi_1',
              handler_id: 'test_pay_1',
              type: 'card',
              credential: { type: 'PAYMENT_GATEWAY', token: TOKEN },
            }),
          },
          { id: 'custody', order: 10 },
        ),
      ],
    }),
  };
}

async function ready(client: UcpClient) {
  const [product] = await client.search('sencha');
  const created = await client.createCheckout([
    { id: product.id, quantity: 2 },
  ]);
  expect(created.status).toBe('incomplete');
  const checkout = await client.updateCheckout(created.id, {
    buyer: { email: 'ana@example.com' },
  });
  expect(checkout.status).toBe('ready_for_complete');
  return checkout;
}

describe('UCP', () => {
  it('computes the revision the Python package computes', async () => {
    expect(await revisionOf(fixture.checkout)).toBe(fixture.revision);
  });

  it('proposes, is approved, buys once', async () => {
    const merchant = store();
    const client = new UcpClient(
      STORE,
      'https://agent.example/.well-known/ucp',
      merchant.fetchImpl,
    );
    const person = host();
    const reactor = buildProtocolsReactor([person.plugin]);
    const checkout = await ready(client);
    const proposal = await client.proposeCompletion(checkout.id);
    expect(proposalSummary(proposal)).toBe(fixture.summary);
    const done = await client.complete(proposal, reactor);
    expect(done.status).toBe('completed');
    expect(person.asked).toEqual([proposal]);
    await expect(client.complete(proposal, reactor)).rejects.toThrow(
      'used already',
    );
    expect(merchant.orders).toHaveLength(1);
    expect(JSON.stringify(checkoutSummary(done))).not.toContain(TOKEN);
    expect(UCP_ACTION_CLASSES.complete).toBe('buy');
  });

  it('buys nothing without an approver, an approval, or with a changed checkout', async () => {
    const client = new UcpClient(
      STORE,
      'https://agent.example/.well-known/ucp',
      store().fetchImpl,
    );
    const checkout = await ready(client);
    const proposal = await client.proposeCompletion(checkout.id);
    await expect(
      client.complete(proposal, buildProtocolsReactor()),
    ).rejects.toThrow('no UCP approver');
    await expect(
      client.complete(proposal, buildProtocolsReactor([host(false).plugin])),
    ).rejects.toThrow('did not approve');
    await client.updateCheckout(checkout.id, {
      line_items: [{ item: { id: 'tea_sencha' }, quantity: 5 }],
    });
    await expect(
      client.complete(proposal, buildProtocolsReactor([host().plugin])),
    ).rejects.toThrow('changed since it was proposed');
  });

  it('negotiates checkout alone until an extension is contributed', async () => {
    const client = new UcpClient(
      STORE,
      'https://agent.example/.well-known/ucp',
      store().fetchImpl,
    );
    const profile = await client.discover();
    expect(negotiateCapabilities(profile, buildProtocolsReactor())).toEqual([
      'dev.ucp.shopping.checkout',
    ]);
  });
});
