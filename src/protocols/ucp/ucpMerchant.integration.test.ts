/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The TypeScript shopping client at the Python merchant (AGENT_PROTOCOLS
 * EX-04): Example Store served by `examples/protocols/ucp/merchant_server.py`
 * at `UCP_MERCHANT`, over real HTTP — discovery, search, a checkout created
 * and updated, the exact purchase proposed, approved once by the person,
 * bought once, the same proposal refused after.
 *
 * `agent_runtimes/tests/test_protocols_ucp_two_languages.py` serves the
 * store and runs this file; without `UCP_MERCHANT` there is no store and it
 * does not run.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  UcpApprovers,
  UcpClient,
  UcpPaymentInstruments,
  checkoutSummary,
  type CheckoutProposal,
} from './index';

const MERCHANT = process.env.UCP_MERCHANT ?? '';
/** A local test token: the store accepts any; it is never shown. */
const TOKEN = 'tok_test_4242_never_shown';

describe.skipIf(!MERCHANT)(
  'UCP: the TypeScript client at the Python store',
  () => {
    it('proposes, is approved, buys once', async () => {
      const asked: CheckoutProposal[] = [];
      const person = definePlugin({
        name: 'person',
        contributes: [
          contribution(
            UcpApprovers,
            {
              approve: async (proposal: CheckoutProposal) => {
                asked.push(proposal);
                return true;
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
      });
      const client = new UcpClient(
        MERCHANT,
        'https://shopper-ts.example/.well-known/ucp',
      );
      await client.discover();
      const [product] = await client.search('sencha');
      const created = await client.createCheckout([
        { id: product.id, quantity: 2 },
      ]);
      expect(created.status).toBe('incomplete');
      const checkout = await client.updateCheckout(created.id, {
        buyer: { email: 'ana@example.com' },
      });
      expect(checkout.status).toBe('ready_for_complete');
      const proposal = await client.proposeCompletion(checkout.id);
      const reactor = buildProtocolsReactor([person]);
      const done = await client.complete(proposal, reactor);
      expect(done.status).toBe('completed');
      expect(asked).toEqual([proposal]);
      await expect(client.complete(proposal, reactor)).rejects.toThrow(
        'used already',
      );
      expect(JSON.stringify(checkoutSummary(done))).not.toContain(TOKEN);
    });
  },
);
