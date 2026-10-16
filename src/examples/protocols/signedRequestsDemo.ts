/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The *Signed requests* gallery example's work (EX-10): a
 * fresh Ed25519 key generated in the page, one request signed with it
 * (`signRequest`), the three headers and the signature base the signer was
 * handed, then the request verified against the key's directory — and the
 * same request replayed, and one with its path changed, both refused.
 *
 * The key never leaves the page and is never shown: only its public JWK and
 * thumbprint are. No network: the directory is read from memory.
 *
 * @module examples/protocols/signedRequestsDemo
 */

import {
  InMemoryNonceStore,
  generateLocalSigner,
  keyResolver,
  signRequest,
  verifyRequest,
  type HttpSigner,
  type PublicJwk,
  type SignedHeaders,
  type Verification,
} from '../../protocols/web-bot-auth';

export interface SignedRequestDemo {
  /** The key's thumbprint, the `keyid` of the signature. */
  keyid: string;
  publicJwk: PublicJwk;
  url: string;
  headers: SignedHeaders;
  /** The signature base, exactly as the signer signed it. */
  base: string;
  verified: Verification;
  replayed: Verification;
  tampered: Verification;
}

/** A signer that keeps what it was asked to sign: the signature base. */
function recording(signer: HttpSigner): HttpSigner & { bases: string[] } {
  const bases: string[] = [];
  return {
    keyid: signer.keyid,
    algorithm: signer.algorithm,
    bases,
    async sign(data: Uint8Array) {
      bases.push(new TextDecoder().decode(data));
      return signer.sign(data);
    },
  };
}

/** Sign one request with a fresh key, and verify it three ways. */
export async function signedRequestDemo(
  url = 'https://shop.example/products?q=tea',
  agent = 'https://agent.example',
): Promise<SignedRequestDemo> {
  const { signer, publicJwk } = await generateLocalSigner();
  const keeping = recording(signer);
  const headers = await signRequest(new Request(url), keeping, { agent });
  // The shop finds the agent's keys in its directory: here, in memory.
  const resolver = keyResolver({
    directory: { keys: async () => [publicJwk] },
  });
  const nonceStore = new InMemoryNonceStore();
  const sent = (to: string) => new Request(to, { headers: { ...headers } });
  const verified = await verifyRequest(sent(url), resolver, { nonceStore });
  const replayed = await verifyRequest(sent(url), resolver, { nonceStore });
  const changed = new URL(url);
  changed.pathname = '/checkout';
  const tampered = await verifyRequest(sent(changed.toString()), resolver, {
    nonceStore: new InMemoryNonceStore(),
  });
  return {
    keyid: signer.keyid,
    publicJwk,
    url,
    headers,
    base: keeping.bases[0] ?? '',
    verified,
    replayed,
    tampered,
  };
}
