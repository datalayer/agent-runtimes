/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Visa's Trusted Agent Protocol, the draft profile over Web Bot Auth
 * (PR-24), against the vectors the Python package computed
 * (`fixtures/tap.json`): the same key, the same bytes, as
 * `test_protocols_web_bot_auth_tap.py`.
 */

import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/web_bot_auth/fixtures/tap.json';
import vectors from '../../../agent_runtimes/protocols/web_bot_auth/fixtures/vectors.json';
import { InMemoryNonceStore, localSigner, publicJwkOf } from './index';
import {
  TAP_MAX_WINDOW_SECONDS,
  TAP_STATUS,
  signTapRequest,
  tapKeys,
  verifyTapRequest,
  type TapIntent,
} from './tap';

const KEYS = tapKeys([publicJwkOf(vectors.key)]);

function signed(vector: (typeof fixture.vectors)[number]): Request {
  return new Request(vector.url, {
    method: vector.method,
    headers: {
      'Signature-Input': vector.signatureInput,
      Signature: vector.signature,
    },
  });
}

describe('TAP: the draft profile over Web Bot Auth', () => {
  it('is said a draft', () => {
    expect(TAP_STATUS).toBe('draft');
    expect(fixture.status).toBe('draft');
  });

  it('reproduces each vector byte for byte', async () => {
    const signer = await localSigner(vectors.key);
    expect(signer.keyid).toBe(fixture.keyid);
    for (const vector of fixture.vectors) {
      const headers = await signTapRequest(
        { method: vector.method, url: vector.url },
        signer,
        {
          intent: vector.intent as TapIntent,
          created: vector.created,
          lifetime: vector.expires - vector.created,
          nonce: vector.nonce,
        },
      );
      expect(headers['Signature-Input']).toBe(vector.signatureInput);
      expect(headers.Signature).toBe(vector.signature);
    }
  });

  it('verifies each vector and says what the agent is doing', async () => {
    const nonceStore = new InMemoryNonceStore();
    for (const vector of fixture.vectors) {
      const found = await verifyTapRequest(signed(vector), await KEYS, {
        nonceStore: new InMemoryNonceStore(),
        now: vector.created + 1,
      });
      expect(found).toEqual({
        verified: true,
        intent: vector.intent,
        keyid: fixture.keyid,
        nonce: vector.nonce,
      });
    }
    // A nonce seen in the last 8 minutes is a replay, whatever it signs.
    const signer = await localSigner(vectors.key);
    const once = async (url: string, intent: TapIntent) =>
      new Request(url, {
        headers: {
          ...(await signTapRequest({ method: 'GET', url }, signer, {
            intent,
            nonce: 'once',
          })),
        },
      });
    const [browse, pay] = fixture.vectors;
    expect(
      (
        await verifyTapRequest(await once(browse.url, 'browse'), await KEYS, {
          nonceStore,
        })
      ).verified,
    ).toBe(true);
    expect(
      await verifyTapRequest(await once(pay.url, 'pay'), await KEYS, {
        nonceStore,
      }),
    ).toMatchObject({ verified: false, reason: 'the nonce was seen before' });
  });

  it('refuses what the profile does not allow', async () => {
    const [browse] = fixture.vectors;
    const nonceStore = new InMemoryNonceStore();
    const keys = await KEYS;
    expect(
      await verifyTapRequest(signed(browse), keys, {
        nonceStore,
        now: browse.expires + 1,
      }),
    ).toMatchObject({ verified: false });
    expect(
      await verifyTapRequest(signed(browse), new Map(), {
        nonceStore,
        now: browse.created + 1,
      }),
    ).toMatchObject({
      verified: false,
      reason: 'the key is not a known Ed25519 key',
    });
    const moved = new Request('https://www.example.com/elsewhere', {
      headers: {
        'Signature-Input': browse.signatureInput,
        Signature: browse.signature,
      },
    });
    expect(
      await verifyTapRequest(moved, keys, {
        nonceStore,
        now: browse.created + 1,
      }),
    ).toMatchObject({ verified: false });
    expect(
      await verifyTapRequest(new Request(browse.url), keys, { nonceStore }),
    ).toEqual({ verified: false, reason: 'the request is not signed' });
    const signer = await localSigner(vectors.key);
    await expect(
      signTapRequest({ method: 'GET', url: browse.url }, signer, {
        intent: 'browse',
        lifetime: TAP_MAX_WINDOW_SECONDS + 1,
      }),
    ).rejects.toThrow('at most 480s');
    await expect(
      signTapRequest({ method: 'GET', url: browse.url }, signer, {
        intent: 'browse',
        components: ['@authority'],
      }),
    ).rejects.toThrow('covers @path');
  });
});
