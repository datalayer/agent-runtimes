/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The TypeScript personal agent at the Python Provider (EX-06): Example Air served by `examples/protocols/pact/provider_server.py`
 * at `PACT_PROVIDER`, over real HTTP — the card read, a conversation under
 * the personal-agent JWT alone, a sign-in granting one scope of two, the
 * step-up, the change made, and every receipt the Python Brand signed
 * verified here and kept.
 *
 * `agent_runtimes/tests/test_protocols_pact_two_languages.py` serves the
 * Provider and runs this file; without `PACT_PROVIDER` there is no Brand to
 * talk to and it does not run.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import { buildProtocolsReactor } from '../agentProtocols';
import { jwkThumbprint, type HttpSigner } from '../web-bot-auth';
import {
  InMemoryReceiptStore,
  PactPersonalAgent,
  PactReceiptStores,
  PactSigners,
} from './index';

const PROVIDER = process.env.PACT_PROVIDER ?? '';
const ISSUER = 'https://pa-ts.example';
const USER = 'user-7f3a';

async function es256Signer(): Promise<{
  signer: HttpSigner;
  publicJwk: JsonWebKey & { kid: string };
}> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const publicJwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  const kid = await jwkThumbprint(publicJwk);
  return {
    publicJwk: { ...publicJwk, kid },
    signer: {
      keyid: kid,
      algorithm: 'ecdsa-p256-sha256' as never,
      async sign(data: Uint8Array) {
        return new Uint8Array(
          await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            pair.privateKey,
            data as BufferSource,
          ),
        );
      },
    },
  };
}

/** What happens away from the protocol: the example's own routes. */
async function example(path: string, body: unknown): Promise<void> {
  const answer = await fetch(`${PROVIDER}/example/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (answer.status !== 204) {
    throw new Error(`${path} answered ${answer.status}`);
  }
}

describe.skipIf(!PROVIDER)(
  'PACT 1.0: the TypeScript personal agent at the Python Provider',
  () => {
    it('reads the card, asks, signs in for one scope of two, steps up, and keeps every verified receipt', async () => {
      const { signer, publicJwk } = await es256Signer();
      await example('register', {
        issuer: ISSUER,
        jwks: { keys: [{ ...publicJwk, alg: 'ES256', use: 'sig' }] },
      });
      const receipts = new InMemoryReceiptStore();
      const reactor = buildProtocolsReactor([
        definePlugin({
          name: 'host',
          contributes: [
            contribution(PactSigners, signer, { id: 'host', order: 10 }),
            contribution(PactReceiptStores, receipts, {
              id: 'record',
              order: 10,
            }),
          ],
        }),
      ]);
      const agent = new PactPersonalAgent({
        cardUrl: `${PROVIDER}/a2a/example-air/.well-known/agent-card.json`,
        issuer: ISSUER,
        audience: `${PROVIDER}/a2a`,
        reactor,
      });

      const card = await agent.discover();
      expect(card.profile).toBe('delegated');
      expect(
        Object.fromEntries(
          card.delegation!.scopes.map(s => [s.id, s.actionClass]),
        ),
      ).toEqual({ 'bookings:read': 'read', 'bookings:change': 'write' });

      // Identity only: the personal-agent JWT, no delegation, no receipt.
      const first = await agent.send(USER, 'Hello, about my trip');
      expect(first).toMatchObject({ kind: 'reply', scopesUsed: [] });
      expect(receipts.receipts).toHaveLength(0);

      // The person grants one scope of the two asked.
      const signIn = await agent.requestSignIn(USER, [
        'bookings:read',
        'bookings:change',
      ]);
      expect(signIn.verificationUri).toContain(signIn.userCode);
      await example('approve', {
        user_code: signIn.userCode,
        scopes: ['bookings:read'],
      });
      expect(await agent.finishSignIn(USER, signIn, 0)).toEqual([
        'bookings:read',
      ]);

      const reply = await agent.send(USER, 'When is my booking?', {
        contextId: first.contextId,
      });
      expect(reply).toMatchObject({
        kind: 'reply',
        text: 'Your booking AB123 flies on 2026-11-02.',
        scopesUsed: ['bookings:read'],
        actions: ['lookup_booking'],
      });

      // A change needs the scope not granted: the Brand steps up.
      const step = await agent.send(USER, 'Please change my flight', {
        contextId: first.contextId,
      });
      expect(step).toMatchObject({
        kind: 'step-up',
        missing: ['bookings:change'],
      });
      const more = await agent.requestSignIn(USER, ['bookings:change']);
      await example('approve', {
        user_code: more.userCode,
        scopes: ['bookings:change'],
      });
      expect(await agent.finishSignIn(USER, more, 0)).toEqual([
        'bookings:change',
      ]);
      const changed = await agent.send(USER, 'Please change my flight', {
        contextId: first.contextId,
      });
      expect(changed).toMatchObject({
        kind: 'reply',
        text: 'Booking AB123 now flies on 2026-11-09.',
        actions: ['lookup_booking', 'change_booking'],
      });

      // Both replies under delegation carried a receipt the Python Brand signed, verified here.
      expect(receipts.receipts).toHaveLength(2);
      // Nothing the agent sees holds the delegation token.
      expect(
        JSON.stringify([first, reply, step, changed, signIn, more]),
      ).not.toMatch(/eyJ/);
    });
  },
);
