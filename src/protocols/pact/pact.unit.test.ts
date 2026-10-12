/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * PACT 1.0 in TypeScript (AGENT_PROTOCOLS PR-11 to PR-13, PR-51, PR-53): the
 * card fixture the Python package reads, the personal-agent JWT verified as
 * a Provider verifies it, and the Delegated profile against a Brand that
 * answers as `agent_runtimes.protocols.pact.provider` does.
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import {
  CompactSign,
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
} from 'jose';
import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/pact/fixtures/card.json';
import { buildProtocolsReactor } from '../agentProtocols';
import { jwkThumbprint, type HttpSigner } from '../web-bot-auth';
import {
  InMemoryReceiptStore,
  PactPersonalAgent,
  PactReceiptStores,
  PactSigners,
  readCard,
  signPersonalAgentJwt,
} from './index';

const ISSUER = 'https://pa.example';
const USER = 'user-7f3a';
const AUDIENCE = 'https://provider.example/a2a';

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
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: jwk.x,
    y: jwk.y,
  } as JsonWebKey;
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

/** Example Air, answering as the Python Provider does, in memory. */
async function brand(agentJwk: JsonWebKey & { kid: string }) {
  const keys = await generateKeyPair('ES256');
  const brandJwk = { ...(await exportJWK(keys.publicKey)), kid: 'brand-key' };
  const iface = fixture.reads.interfaceUrl;
  let approved: string[] | undefined;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    if (url.endsWith('/.well-known/agent-card.json')) {
      return Response.json(fixture.card);
    }
    if (url.endsWith('/oauth-authorization-server')) {
      return Response.json({ jwks_uri: `${iface}/oauth/jwks.json` });
    }
    if (url.endsWith('/jwks.json')) {
      return Response.json({ keys: [brandJwk] });
    }
    const token = (headers.get('Authorization') ?? '').replace('Bearer ', '');
    await jwtVerify(token, await importJWK(agentJwk, 'ES256'), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (url.endsWith('/device_authorization')) {
      return Response.json({
        device_code: 'dc_secret',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://air.example/login',
        verification_uri_complete:
          'https://air.example/login?user_code=WDJB-MJHT',
        expires_in: 600,
        interval: 0,
      });
    }
    if (url.endsWith('/token')) {
      if (!approved) {
        return Response.json(
          { error: 'authorization_pending' },
          { status: 400 },
        );
      }
      return Response.json({
        token_type: 'Bearer',
        access_token: 'delegation-jwt',
        scope: approved.join(' '),
      });
    }
    const delegated = headers.get('X-A2A-User-Delegation');
    const body = JSON.parse(String(init?.body));
    if (!delegated) {
      return Response.json({
        message: {
          messageId: 'r-1',
          contextId: 'ctx-1',
          role: 'ROLE_AGENT',
          parts: [{ text: 'Your booking reference?' }],
        },
      });
    }
    const claims = {
      grantId: 'g-1',
      user: 'jane-4471',
      pa: ISSUER,
      brand: iface,
      scopesUsed: ['bookings:read'],
      actions: [{ tool: 'lookup_booking' }],
      ts: '2026-10-12T00:00:00Z',
    };
    const jws = await new CompactSign(
      new TextEncoder().encode(JSON.stringify(claims)),
    )
      .setProtectedHeader({ alg: 'ES256', kid: 'brand-key' })
      .sign(keys.privateKey);
    return Response.json({
      message: {
        messageId: 'r-2',
        contextId: body.message.contextId ?? 'ctx-1',
        role: 'ROLE_AGENT',
        parts: [{ text: 'AB123 flies on 2026-11-02.' }],
        metadata: { 'pact.receipt': { jws, claims } },
      },
    });
  }) as typeof fetch;
  return { fetchImpl, approve: (scopes: string[]) => (approved = scopes) };
}

describe('PACT 1.0', () => {
  it('reads the card the Python package reads, the same way', () => {
    const card = readCard(fixture.card);
    expect({
      interfaceUrl: card.interfaceUrl,
      identityScheme: card.identityScheme,
      profile: card.profile,
      scopes: Object.fromEntries(
        card.delegation!.scopes.map(s => [s.id, s.actionClass]),
      ),
    }).toEqual(fixture.reads);
    expect(() =>
      readCard({ ...fixture.card, supportedInterfaces: [] }),
    ).toThrow('HTTP+JSON');
  });

  it('signs a personal-agent JWT a Provider verifies', async () => {
    const { signer, publicJwk } = await es256Signer();
    const token = await signPersonalAgentJwt(signer, {
      issuer: ISSUER,
      subject: USER,
      audience: AUDIENCE,
    });
    const { payload } = await jwtVerify(
      token,
      await importJWK(publicJwk, 'ES256'),
      {
        issuer: ISSUER,
        audience: AUDIENCE,
      },
    );
    expect(payload.sub).toBe(USER);
    expect(payload.exp! - payload.iat!).toBe(120);
    await expect(
      signPersonalAgentJwt(signer, {
        issuer: ISSUER,
        subject: 'ana@example.com',
        audience: AUDIENCE,
      }),
    ).rejects.toThrow('opaque');
  });

  it('signs in at the Brand, sends under delegation, keeps the verified receipt', async () => {
    const { signer, publicJwk } = await es256Signer();
    const air = await brand(publicJwk);
    const receipts = new InMemoryReceiptStore();
    const reactor = buildProtocolsReactor([
      definePlugin({
        name: 'host',
        contributes: [
          contribution(PactSigners, signer, { id: 'vault', order: 10 }),
          contribution(PactReceiptStores, receipts, {
            id: 'record',
            order: 10,
          }),
        ],
      }),
    ]);
    const agent = new PactPersonalAgent({
      cardUrl: `${fixture.reads.interfaceUrl}/.well-known/agent-card.json`,
      issuer: ISSUER,
      audience: AUDIENCE,
      reactor,
      fetchImpl: air.fetchImpl,
    });
    const first = await agent.send(USER, 'Hello');
    expect(first).toMatchObject({ kind: 'reply', contextId: 'ctx-1' });
    await expect(agent.requestSignIn(USER, ['refunds:issue'])).rejects.toThrow(
      'not on the card',
    );
    const signIn = await agent.requestSignIn(USER, [
      'bookings:read',
      'bookings:change',
    ]);
    expect(JSON.stringify(signIn)).not.toContain('dc_secret');
    air.approve(['bookings:read']);
    expect(await agent.finishSignIn(USER, signIn, 0)).toEqual([
      'bookings:read',
    ]);
    const reply = await agent.send(USER, 'When is my booking?', {
      contextId: 'ctx-1',
    });
    expect(reply).toMatchObject({
      kind: 'reply',
      scopesUsed: ['bookings:read'],
      actions: ['lookup_booking'],
    });
    expect(JSON.stringify(reply)).not.toContain('delegation-jwt');
    expect(receipts.receipts).toHaveLength(1);
  });
});
