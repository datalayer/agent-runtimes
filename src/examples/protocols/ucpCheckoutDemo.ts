/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The *UCP checkout* gallery example's work (AGENT_PROTOCOLS EX-10, after
 * EX-04): the UCP client buying from *Example Store*, the local test
 * merchant running in the page (`protocols/ucp/merchant`). A checkout is
 * proposed as an exact, revisioned purchase; completing it asks the host's
 * approver — the page's card — once, and the proposal is spent whatever the
 * answer. The payment is the test handler's; its token is never shown.
 *
 * @module examples/protocols/ucpCheckoutDemo
 */

import {
  contribution,
  definePlugin,
  type ReactorPlatform,
} from '@datalayer/reactor';
import { buildProtocolsReactor } from '../../protocols/agentProtocols';
import {
  UcpApprovers,
  UcpClient,
  UcpPaymentInstruments,
  checkoutSummary,
  proposalSummary,
  type CheckoutProposal,
} from '../../protocols/ucp';
import {
  EXAMPLE_STORE_HANDLER_ID,
  exampleStore,
} from '../../protocols/ucp/merchant';

export const STORE = 'https://store.example';
export const AGENT_PROFILE = 'https://agent.example/.well-known/ucp';
/** The test payment's token: held by the host, never in a summary or a proposal. */
export const TEST_TOKEN = 'tok_test_gallery_never_shown';

export interface UcpCheckoutDemo {
  client: UcpClient;
  reactor: ReactorPlatform;
  orders: Array<{ order: string; checkout: string }>;
}

/** The client, the store, and a host whose approver is `decide`. */
export function ucpCheckoutDemo(
  decide: (proposal: CheckoutProposal) => Promise<boolean>,
): UcpCheckoutDemo {
  const store = exampleStore(STORE);
  const host = definePlugin({
    name: 'gallery-host',
    contributes: [
      contribution(
        UcpApprovers,
        { approve: decide },
        { id: 'person', order: 10 },
      ),
      contribution(
        UcpPaymentInstruments,
        {
          instrument: async () => ({
            id: 'pi_1',
            handler_id: EXAMPLE_STORE_HANDLER_ID,
            type: 'card',
            credential: { type: 'PAYMENT_GATEWAY', token: TEST_TOKEN },
          }),
        },
        { id: 'custody', order: 10 },
      ),
    ],
  });
  return {
    client: new UcpClient(STORE, AGENT_PROFILE, store.fetch),
    reactor: buildProtocolsReactor([host]),
    orders: store.orders,
  };
}

/** Find the tea, put `quantity` in a checkout with the buyer's email, and propose it. */
export async function proposeTea(
  demo: UcpCheckoutDemo,
  quantity = 2,
  email = 'ana@example.com',
): Promise<{ proposal: CheckoutProposal; says: string }> {
  const [product] = await demo.client.search('sencha');
  const created = await demo.client.createCheckout([
    { id: product.id, quantity },
  ]);
  await demo.client.updateCheckout(created.id, { buyer: { email } });
  const proposal = await demo.client.proposeCompletion(created.id);
  return { proposal, says: proposalSummary(proposal) };
}

/** Complete the proposal: the approver is asked; the order, or why not. */
export async function buy(
  demo: UcpCheckoutDemo,
  proposal: CheckoutProposal,
): Promise<{ ok: boolean; says: string }> {
  try {
    const done = checkoutSummary(
      await demo.client.complete(proposal, demo.reactor),
    );
    return {
      ok: true,
      says: `Bought: order ${done.order?.id}, ${done.status}.`,
    };
  } catch (error) {
    return { ok: false, says: `Not bought: ${(error as Error).message}.` };
  }
}
