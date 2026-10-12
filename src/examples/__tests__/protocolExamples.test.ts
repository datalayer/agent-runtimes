/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent protocols' gallery examples (AGENT_PROTOCOLS EX-10): what each
 * page draws is what these run — a request signed in the page and verified,
 * a replay and a changed path refused; a UCP purchase from the in-page test
 * store proposed, approved once, bought once, its token in no summary.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLES, getExampleEntries } from '../example-selector';
import { getExampleGroup } from '../exampleGroups';
import { signedRequestDemo } from '../protocols/signedRequestsDemo';
import {
  TEST_TOKEN,
  buy,
  proposeTea,
  ucpCheckoutDemo,
} from '../protocols/ucpCheckoutDemo';
import type { CheckoutProposal } from '../../protocols/ucp';

describe('Signed requests', () => {
  it('shows the three headers and the base the key signed, verified once', async () => {
    const demo = await signedRequestDemo();
    expect(demo.headers['Signature-Agent']).toBe(
      'sig1="https://agent.example"',
    );
    expect(demo.headers['Signature-Input']).toContain('tag="web-bot-auth"');
    expect(demo.headers['Signature-Input']).toContain(`keyid="${demo.keyid}"`);
    expect(demo.headers.Signature).toMatch(/^sig1=:[A-Za-z0-9+/=]+:$/);
    expect(demo.base).toContain('"@authority": shop.example');
    expect(demo.base).toContain('"@path": /products');
    expect(demo.base).toContain(
      '"signature-agent";key="sig1": "https://agent.example"',
    );
    expect(demo.base).toContain('"@signature-params": ');
    expect(demo.verified).toMatchObject({
      outcome: 'verified',
      keyid: demo.keyid,
    });
    expect(demo.replayed).toMatchObject({
      outcome: 'invalid',
      reason: 'the nonce was seen before',
    });
    expect(demo.tampered.outcome).toBe('invalid');
    // Only public members: the private key is never on the page.
    expect(Object.keys(demo.publicJwk).sort()).toEqual([
      'crv',
      'kid',
      'kty',
      'x',
    ]);
  });
});

describe('UCP checkout', () => {
  it('proposes the exact purchase, asks once, buys once', async () => {
    const asked: CheckoutProposal[] = [];
    const demo = ucpCheckoutDemo(async proposal => {
      asked.push(proposal);
      return true;
    });
    const { proposal, says } = await proposeTea(demo);
    expect(says).toBe(
      'Buy 2 × Sencha green tea, 100 g at store.example for USD 27.00',
    );
    const bought = await buy(demo, proposal);
    expect(bought.ok).toBe(true);
    expect(bought.says).toMatch(/^Bought: order ord_[0-9a-f-]+, completed\.$/);
    expect(asked).toEqual([proposal]);
    expect(await buy(demo, proposal)).toEqual({
      ok: false,
      says: 'Not bought: this proposal was used already.',
    });
    expect(demo.orders).toHaveLength(1);
    expect(JSON.stringify([proposal, says, bought])).not.toContain(TEST_TOKEN);
  });

  it('buys nothing when the person declines', async () => {
    const demo = ucpCheckoutDemo(async () => false);
    const { proposal } = await proposeTea(demo, 1);
    expect(await buy(demo, proposal)).toEqual({
      ok: false,
      says: 'Not bought: the person did not approve this purchase.',
    });
    expect(demo.orders).toEqual([]);
  });
});

describe('the gallery', () => {
  it('lists both under Agent protocols', () => {
    for (const id of [
      'ProtocolSignedRequestsExample',
      'ProtocolUcpCheckoutExample',
    ]) {
      expect(
        getExampleEntries().some(entry => entry.id === id),
        id,
      ).toBe(true);
      expect(EXAMPLES[id], id).toBeTypeOf('function');
      expect(getExampleGroup(id)).toBe('Agent protocols');
    }
  });
});
