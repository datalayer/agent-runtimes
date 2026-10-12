/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The TypeScript buyer at the Python seller (AGENT_PROTOCOLS EX-05): Example
 * Outfitters served by `examples/protocols/agentic_commerce/seller_server.py`
 * at `ACP_SELLER`, over real HTTP — discovery, a session created, the buyer's
 * email given, the exact purchase proposed, approved, completed once with a
 * delegated payment token no summary shows, the same proposal refused after.
 *
 * `agent_runtimes/tests/test_protocols_agentic_commerce_two_languages.py`
 * serves the seller and runs this file; without `ACP_SELLER` there is no
 * seller and it does not run.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import { type CheckoutProposal } from '../commerce';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  AgenticCommerceApprovers,
  AgenticCommerceClient,
  AgenticCommerceCredentials,
  AgenticCommercePaymentData,
  sessionSummary,
} from './index';

const SELLER = process.env.ACP_SELLER ?? '';
/** The test seller's own local values: a test token and the bearer it issued. */
const TOKEN = 'spt_test_shared_payment_token';
const BEARER = 'acp_test_agent_key';

describe.skipIf(!SELLER)(
  'ACP: the TypeScript buyer at the Python seller',
  () => {
    it('proposes, is approved, buys once; no token in what an agent sees', async () => {
      const asked: CheckoutProposal[] = [];
      const host = definePlugin({
        name: 'host',
        contributes: [
          contribution(
            AgenticCommerceApprovers,
            {
              approve: async (proposal: CheckoutProposal) => {
                asked.push(proposal);
                return true;
              },
            },
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
        ],
      });
      const client = new AgenticCommerceClient(
        SELLER,
        buildProtocolsReactor([host]),
      );
      await client.discover();
      const created = await client.createCheckout(
        [{ id: 'socks', quantity: 2 }],
        'usd',
      );
      const session = await client.updateCheckout(created.id, {
        buyer: { email: 'ana@example.com' },
      });
      expect(session.status).toBe('ready_for_payment');
      const proposal = await client.proposeCompletion(session.id);
      const done = await client.complete(proposal);
      expect(done.status).toBe('completed');
      expect(asked).toEqual([proposal]);
      await expect(client.complete(proposal)).rejects.toThrow('used already');
      const summary = JSON.stringify(sessionSummary(done as never));
      expect(summary).not.toContain(TOKEN);
      expect(summary).not.toContain(BEARER);
    });
  },
);
