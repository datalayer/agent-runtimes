/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Web Bot Auth in TypeScript against the vectors the Python package reads
 * (`fixtures/vectors.json`, the draft's Appendix E.2): the same key, the same
 * bytes (PR-20 to PR-23, PR-51, PR-53).
 */

import { definePlugin, contribution } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import vectors from '../../../agent_runtimes/protocols/web_bot_auth/fixtures/vectors.json';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  DIRECTORY_PATH,
  InMemoryNonceStore,
  WebBotAuthCimdDiscoveries,
  WebBotAuthSigners,
  contentDigest,
  directoryBody,
  directoryResolver,
  generateLocalSigner,
  jwkThumbprint,
  localSigner,
  publicJwkOf,
  resolverOf,
  signDirectoryResponse,
  signRequest,
  signedFetch,
  signerOf,
  verifyRequest,
} from './index';

const E21 = vectors.vectors[0];
const NOW = new Date(1735689700_000);

function vectorFetch(): typeof fetch {
  const directory = vectors.directory;
  return (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== directory.url) {
      return new Response('', { status: 404 });
    }
    return new Response(directory.body, {
      status: 200,
      headers: {
        'Content-Digest': directory.contentDigest,
        'Signature-Input': directory.signatureInput,
        Signature: directory.signature,
      },
    });
  }) as typeof fetch;
}

describe('Web Bot Auth, the draft’s vectors', () => {
  it('the key id is the thumbprint', async () => {
    expect(await jwkThumbprint(publicJwkOf(vectors.key))).toBe(vectors.keyid);
    expect((await localSigner(vectors.key)).keyid).toBe(vectors.keyid);
  });

  it('signs E.2.1 byte for byte', async () => {
    const signer = await localSigner(vectors.key);
    const signed = await signRequest(new Request(E21.url), signer, {
      agent: 'https://signature-agent.test',
      label: 'agent2',
      created: new Date(E21.created * 1000),
      expires: new Date(E21.expires * 1000),
      nonce: E21.nonce,
      components: ['@authority'],
    });
    expect(signed.Signature.split('=').slice(1).join('=')).toBe(
      E21.signature.split('=').slice(1).join('='),
    );
  });

  it('verifies E.2.1 through the directory, signed as E.2.3', async () => {
    const request = new Request(E21.url, {
      headers: {
        ...E21.headers,
        'Signature-Input': E21.signatureInput,
        Signature: E21.signature,
      },
    });
    const result = await verifyRequest(
      request,
      directoryResolver(vectorFetch()),
      {
        now: NOW,
      },
    );
    expect(result).toMatchObject({
      outcome: 'verified',
      agent: 'https://signature-agent.test',
      keyid: vectors.keyid,
    });
  });

  it('signs the directory response as E.2.3', async () => {
    const directory = vectors.directory;
    expect(await contentDigest(directory.body)).toBe(directory.contentDigest);
    const headers = await signDirectoryResponse(
      directory.body,
      directory.url,
      [await localSigner(vectors.key)],
      { created: directory.created, expires: directory.expires },
    );
    expect(headers['Signature-Input']).toBe(directory.signatureInput);
    expect(headers.Signature).toBe(directory.signature);
  });
});

describe('Web Bot Auth, one key, two languages', () => {
  it('signs as the Python package signs, header for header', async () => {
    const cross = vectors.cross;
    const signed = await signRequest(
      new Request(cross.url),
      await localSigner(vectors.key),
      {
        agent: cross.agent,
        label: cross.label,
        created: new Date(cross.created * 1000),
        expires: new Date(cross.expires * 1000),
        nonce: cross.nonce,
      },
    );
    expect(signed).toEqual(cross.headers);
  });
});

describe('Web Bot Auth, end to end', () => {
  it('a signed fetch is verified; replay, tampering and unsigned are not', async () => {
    const { signer, publicJwk } = await generateLocalSigner();
    const body = await directoryBody([publicJwk]);
    const directoryUrl = `https://agent.test${DIRECTORY_PATH}`;
    const headers = await signDirectoryResponse(body, directoryUrl, [signer]);
    const agentFetch = (async () =>
      new Response(body, { status: 200, headers })) as unknown as typeof fetch;
    const resolver = directoryResolver(agentFetch);
    const store = new InMemoryNonceStore();
    let received: Request | undefined;
    const shopFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      received = new Request(input, init);
      return new Response('ok');
    }) as typeof fetch;
    await signedFetch(
      signer,
      { agent: 'https://agent.test' },
      shopFetch,
    )('https://shop.test/products?q=tea');
    expect(
      (await verifyRequest(received!.clone(), resolver, { nonceStore: store }))
        .outcome,
    ).toBe('verified');
    const replay = await verifyRequest(received!.clone(), resolver, {
      nonceStore: store,
    });
    expect([replay.outcome, replay.reason]).toEqual([
      'invalid',
      'the nonce was seen before',
    ]);
    const moved = new Request('https://elsewhere.test/products?q=tea', {
      headers: received!.headers,
    });
    expect((await verifyRequest(moved, resolver)).outcome).toBe('invalid');
    expect(
      (await verifyRequest(new Request('https://shop.test/'), resolver))
        .outcome,
    ).toBe('unverified');
    const stranger = await generateLocalSigner();
    await signedFetch(
      stranger.signer,
      { agent: 'https://agent.test' },
      shopFetch,
    )('https://shop.test/products');
    expect((await verifyRequest(received!, resolver)).outcome).toBe(
      'unverified',
    );
  });

  it('never publishes or sends the private key (PR-53)', async () => {
    await expect(directoryBody([vectors.key])).rejects.toThrow(
      'public keys only',
    );
    const signer = await localSigner(vectors.key);
    const signed = await signRequest(
      new Request('https://shop.test/'),
      signer,
      {
        agent: 'https://agent.test',
      },
    );
    for (const value of Object.values(signed)) {
      expect(value).not.toContain(vectors.key.d);
    }
  });
});

describe('Web Bot Auth, the plugin', () => {
  it('has no signer until the host contributes one', async () => {
    expect(() => signerOf(buildProtocolsReactor())).toThrow(
      'no Web Bot Auth signer',
    );
    const { signer } = await generateLocalSigner();
    const reactor = buildProtocolsReactor([
      definePlugin({
        name: 'host',
        contributes: [
          contribution(WebBotAuthSigners, signer, { id: 'vault', order: 10 }),
        ],
      }),
    ]);
    expect(signerOf(reactor)).toBe(signer);
  });

  it('answers a cimd member only once a discovery is contributed', async () => {
    const plain = resolverOf(buildProtocolsReactor());
    expect(await plain('https://agent.test/cimd.json', 'cimd')).toBeUndefined();
    const { publicJwk } = await generateLocalSigner();
    const reactor = buildProtocolsReactor([
      definePlugin({
        name: 'cimd',
        contributes: [
          contribution(
            WebBotAuthCimdDiscoveries,
            { keys: async () => [publicJwkOf(publicJwk)] },
            { id: 'host', order: 10 },
          ),
        ],
      }),
    ]);
    const keys = await resolverOf(reactor)(
      'https://agent.test/cimd.json',
      'cimd',
    );
    expect([...(keys?.keys() ?? [])]).toEqual([
      (publicJwk as { kid: string }).kid,
    ]);
  });
});
