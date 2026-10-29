/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agentic Commerce Protocol 2026-04-17 in TypeScript (PR-40 to PR-42, PR-51, PR-53): the session fixture the Python package
 * reads, and a purchase approved and made once against a seller that answers
 * with it.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/agentic_commerce/fixtures/session.json';
import { proposalSummary, type CheckoutProposal } from '../commerce';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  AGENTIC_COMMERCE_ACTION_CLASSES,
  AgenticCommerceApprovers,
  AgenticCommerceClient,
  AgenticCommerceCredentials,
  AgenticCommerceDiscountExtensions,
  AgenticCommercePaymentData,
  declaredExtensions,
  itemsOf,
  revisionOf,
  sessionSummary,
} from './index';

const SELLER = 'https://outfitters.example';
const TOKEN = 'spt_test_shared_payment_token';
const BEARER = 'acp_test_agent_key';

function seller() {
  const seen: Array<{ path: string; headers: Headers; body: any }> = [];
  let status = 'ready_for_payment';
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === '/.well-known/acp.json') {
      return Response.json(fixture.discovery);
    }
    const headers = new Headers(init?.headers);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ path: url.pathname, headers, body });
    expect(headers.get('Authorization')).toBe(`Bearer ${BEARER}`);
    expect(headers.get('API-Version')).toBe('2026-04-17');
    if (init?.method === 'POST') {
      expect(headers.get('Idempotency-Key')).toBeTruthy();
    }
    if (url.pathname.endsWith('/complete')) {
      status = 'completed';
      return Response.json({
        ...fixture.session,
        status,
        order: {
          id: 'ord_1',
          checkout_session_id: fixture.session.id,
          permalink_url: `${SELLER}/orders/1`,
        },
      });
    }
    return Response.json(
      { ...fixture.session, status },
      {
        status:
          init?.method === 'POST' && url.pathname.endsWith('checkout_sessions')
            ? 201
            : 200,
      },
    );
  }) as typeof fetch;
  return { fetchImpl, seen };
}

function host(approve = true, discount = false) {
  return definePlugin({
    name: 'host',
    contributes: [
      contribution(
        AgenticCommerceApprovers,
        { approve: async (_: CheckoutProposal) => approve },
        { id: 'person', order: 10 },
      ),
      contribution(
        AgenticCommerceCredentials,
        { bearer: async () => BEARER },
        { id: 'custody', order: 10 },
      ),
      contribution(
        AgenticCommercePaymentData,
        {
          paymentData: async () => ({
            handler_id: 'test_spt_handler',
            instrument: {
              type: 'card',
              credential: { type: 'spt', token: TOKEN },
            },
          }),
        },
        { id: 'custody', order: 10 },
      ),
      ...(discount
        ? [
            contribution(
              AgenticCommerceDiscountExtensions,
              { name: 'discount' },
              { id: 'host', order: 10 },
            ),
          ]
        : []),
    ],
  });
}

describe('the Agentic Commerce Protocol', () => {
  it('computes the revision the Python package computes', async () => {
    expect(await revisionOf(fixture.session)).toBe(fixture.revision);
  });

  it('sends one Item per unit, as the 2026-04-17 schema writes line_items', () => {
    expect(itemsOf([{ id: 'jacket', quantity: 2 }])).toEqual([
      { id: 'jacket' },
      { id: 'jacket' },
    ]);
  });

  it('proposes, is approved, buys once; no token in what an agent sees', async () => {
    const shop = seller();
    const reactor = buildProtocolsReactor([host()]);
    const client = new AgenticCommerceClient(SELLER, reactor, shop.fetchImpl);
    const discovery = await client.discover();
    expect(discovery.capabilities.services).toEqual(['checkout']);
    const proposal = await client.proposeCompletion(fixture.session.id);
    expect(proposalSummary(proposal)).toBe(fixture.summary);
    const done = await client.complete(proposal);
    expect(done.status).toBe('completed');
    expect(
      shop.seen.at(-1)?.body.payment_data.instrument.credential.token,
    ).toBe(TOKEN);
    expect(shop.seen.at(-1)?.headers.get('Idempotency-Key')).toBe(proposal.id);
    await expect(client.complete(proposal)).rejects.toThrow('used already');
    const summary = JSON.stringify(sessionSummary(done));
    expect(summary).not.toContain(TOKEN);
    expect(summary).not.toContain(BEARER);
    expect(AGENTIC_COMMERCE_ACTION_CLASSES.complete).toBe('buy');
  });

  it('buys nothing declined, and declares only the extensions contributed', async () => {
    const shop = seller();
    const declined = new AgenticCommerceClient(
      SELLER,
      buildProtocolsReactor([host(false)]),
      shop.fetchImpl,
    );
    const proposal = await declined.proposeCompletion(fixture.session.id);
    await expect(declined.complete(proposal)).rejects.toThrow(
      'did not approve',
    );
    expect(declaredExtensions(buildProtocolsReactor())).toEqual([]);
    const reactor = buildProtocolsReactor([host(true, true)]);
    expect(declaredExtensions(reactor)).toEqual(['discount']);
    await new AgenticCommerceClient(
      SELLER,
      reactor,
      shop.fetchImpl,
    ).createCheckout([{ id: 'jacket' }], 'usd');
    expect(shop.seen.at(-1)?.body.capabilities).toEqual({
      extensions: ['discount'],
    });
  });
});
