/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Web Bot Auth: an agent's requests signed, and verified
 * (AGENT_PROTOCOLS PR-20 to PR-23).
 *
 * Implements `draft-ietf-webbotauth-httpsig-protocol-00` (2026-09-01) by
 * wrapping Cloudflare's `web-bot-auth` 0.2.0, which reproduces the draft's
 * Ed25519 vector E.2.1 byte for byte. What is added here is what an agent
 * runtime needs around it:
 *
 * - a signer that is a callable the host owns (`protocols.httpSigner`; Vault
 *   transit in Datalayer): the key never reaches the runtime;
 * - `signedFetch`, a `fetch` that signs every request it sends;
 * - the key directory and its signed response (Appendix B);
 * - verification with keys found by (agent URL, keyid), freshness and an
 *   atomic nonce check, answering `verified`, `invalid` or `unverified`.
 *
 * The Python package `agent_runtimes.protocols.web_bot_auth` is the same
 * protocol, and both read `fixtures/vectors.json` (PR-51).
 *
 * @module protocols/web-bot-auth
 */

import {
  HTTP_MESSAGE_SIGNATURES_DIRECTORY,
  HTTP_MESSAGE_SIGNATURE_TAG,
  SIGNATURE_AGENT_HEADER,
  generateNonce,
  jwkToKeyID,
  parseSignatureAgentHeader,
  sign,
  verify,
  type WebBotAlgorithm,
  type WebBotSigner,
  type WebBotVerifier,
} from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';
import {
  contribution,
  defineContributionPoint,
  definePlugin,
  type ReactorPlatformView,
} from '@datalayer/reactor';
import {
  DEFAULT_ORDER,
  ProtocolDescriptions,
  firstContribution,
  optionalContribution,
} from '../core';

/** The specification implemented. */
export const WEB_BOT_AUTH_SPECIFICATION =
  'draft-ietf-webbotauth-httpsig-protocol-00';
/** Where an agent's key directory is served. */
export const DIRECTORY_PATH = HTTP_MESSAGE_SIGNATURES_DIRECTORY;
/** The directory's media type. */
export const DIRECTORY_MEDIA_TYPE =
  'application/http-message-signatures-directory+json';
/** The tag of a directory response's signature. */
export const DIRECTORY_TAG = 'http-message-signatures-directory';
export const TAG = HTTP_MESSAGE_SIGNATURE_TAG;
export { generateNonce };

function base64url(bytes: Uint8Array): string {
  return base64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The base64url SHA-256 thumbprint of a public JWK (RFC 7638, RFC 8037): the draft's `keyid`. */
export function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  return jwkToKeyID(
    jwk,
    async (data: Uint8Array) =>
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', data as BufferSource),
      ),
    (hash: Uint8Array) => base64url(hash),
  );
}

/**
 * Signs under one key the host holds. `sign` answers the raw signature
 * (Ed25519's 64 bytes). The key is never passed to the runtime.
 */
export interface HttpSigner {
  readonly keyid: string;
  readonly algorithm: WebBotAlgorithm;
  sign(data: Uint8Array): Promise<Uint8Array>;
}

function toWebBotSigner(signer: HttpSigner): WebBotSigner {
  return {
    keyid: signer.keyid,
    algorithm: signer.algorithm,
    sign: (data: Uint8Array) => signer.sign(data),
  };
}

/** A signer whose key is in this page or process: tests and examples only. */
export async function localSigner(privateJwk: JsonWebKey): Promise<HttpSigner> {
  if (
    privateJwk.kty !== 'OKP' ||
    privateJwk.crv !== 'Ed25519' ||
    !privateJwk.d
  ) {
    throw new Error('a local signer takes an Ed25519 private JWK');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
  const keyid = await jwkThumbprint(publicJwkOf(privateJwk));
  return {
    keyid,
    algorithm: 'ed25519',
    async sign(data: Uint8Array) {
      return new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          key,
          data as BufferSource,
        ),
      );
    },
  };
}

/** A fresh Ed25519 key: its signer and its public JWK. Tests and examples only. */
export async function generateLocalSigner(): Promise<{
  signer: HttpSigner;
  publicJwk: JsonWebKey;
}> {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const signer = await localSigner(privateJwk);
  return {
    signer,
    publicJwk: { ...publicJwkOf(privateJwk), kid: signer.keyid },
  };
}

/** The public members of a JWK. */
export function publicJwkOf(jwk: JsonWebKey): JsonWebKey {
  if (jwk.kty === 'OKP') {
    return { kty: 'OKP', crv: jwk.crv, x: jwk.x };
  }
  if (jwk.kty === 'EC') {
    return { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y };
  }
  throw new Error(`key type ${jwk.kty} is not supported`);
}

/** How a request is signed. */
export interface SignOptions {
  /** Where the key directory is: the agent's origin, by default. */
  agent: string;
  /** `directory` (the default), `jwks_uri` or `cimd`. */
  discovery?: 'directory' | 'jwks_uri' | 'cimd';
  label?: string;
  /** Seconds the signature lives; 60 by default, at most 24 hours. */
  lifetime?: number;
  created?: Date;
  expires?: Date;
  nonce?: string;
  /**
   * Covered besides `@authority` and the `Signature-Agent` member (always
   * covered): `@method` and `@path` by default.
   */
  components?: string[];
}

/** The headers a signed request carries. */
export interface SignedHeaders {
  'Signature-Agent': string;
  'Signature-Input': string;
  Signature: string;
}

/**
 * Sign one request: the `Signature-Agent` member, `@authority`, and —
 * narrower than the draft's minimum, as its §5.2 advises — `@method` and
 * `@path`.
 */
export async function signRequest(
  request: Request,
  signer: HttpSigner,
  options: SignOptions,
): Promise<SignedHeaders> {
  if (!options.agent.startsWith('https://')) {
    throw new Error('a Signature-Agent is an https URI');
  }
  const label = options.label ?? 'sig1';
  const discovery = options.discovery ?? 'directory';
  const agentHeader =
    `${label}="${options.agent}"` +
    (discovery === 'directory' ? '' : `;type=${discovery}`);
  const created = options.created ?? new Date();
  const lifetime = options.lifetime ?? 60;
  if (lifetime > 24 * 60 * 60) {
    throw new Error('a Web Bot Auth signature lives at most 24 hours');
  }
  const expires =
    options.expires ?? new Date(created.getTime() + lifetime * 1000);
  const headers = new Headers(request.headers);
  headers.set(SIGNATURE_AGENT_HEADER, agentHeader);
  const withAgent = new Request(request, { headers });
  const fields = await sign(withAgent, {
    signer: toWebBotSigner(signer),
    created,
    expires,
    label,
    nonce: options.nonce ?? generateNonce(),
    signatureAgentKey: label,
    additionalComponents: (options.components ?? ['@method', '@path']).filter(
      name => name !== '@authority',
    ) as never,
  });
  return {
    'Signature-Agent': agentHeader,
    'Signature-Input': fields.signatureInput,
    Signature: fields.signature,
  };
}

/** A `fetch` that signs every request it sends. */
export function signedFetch(
  signer: HttpSigner,
  options: SignOptions,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const signed = await signRequest(request, signer, options);
    const headers = new Headers(request.headers);
    for (const [name, value] of Object.entries(signed)) {
      headers.set(name, value);
    }
    return fetchImpl(new Request(request, { headers }));
  };
}

/** The directory's body: public keys only, each `kid` its thumbprint. */
export async function directoryBody(keys: JsonWebKey[]): Promise<string> {
  const out = [];
  for (const jwk of keys) {
    if ('d' in jwk && jwk.d) {
      throw new Error('a key directory publishes public keys only');
    }
    const kid = await jwkThumbprint(publicJwkOf(jwk));
    if (
      (jwk as { kid?: string }).kid &&
      (jwk as { kid?: string }).kid !== kid
    ) {
      throw new Error("a directory key's kid is its thumbprint");
    }
    out.push({ ...jwk, kid });
  }
  return JSON.stringify({ keys: out });
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text);
}

/** The `Content-Digest` of a body, SHA-256 (RFC 9530). */
export async function contentDigest(
  body: string | Uint8Array,
): Promise<string> {
  const bytes =
    typeof body === 'string' ? new TextEncoder().encode(body) : body;
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as BufferSource),
  );
  return `sha-256=:${base64(digest)}:`;
}

function authorityOf(url: string): string {
  return new URL(url).host.toLowerCase();
}

/**
 * Sign a directory response with every key it lists (Appendix B): the
 * signature covers `"@authority";req` and `content-digest`.
 */
export async function signDirectoryResponse(
  body: string,
  authorityUrl: string,
  signers: HttpSigner[],
  options: { created?: number; expires?: number; lifetime?: number } = {},
): Promise<Record<string, string>> {
  if (!signers.length) {
    throw new Error('a directory is signed by the keys it publishes');
  }
  const listed = new Set(
    (JSON.parse(body).keys as Array<{ kid: string }>).map(key => key.kid),
  );
  const created = options.created ?? Math.floor(Date.now() / 1000);
  const expires = options.expires ?? created + (options.lifetime ?? 300);
  const digest = await contentDigest(body);
  const inputs: string[] = [];
  const signatures: string[] = [];
  for (const [index, signer] of signers.entries()) {
    if (!listed.has(signer.keyid)) {
      throw new Error(
        `key ${signer.keyid} signs a directory that does not list it`,
      );
    }
    const label = index === 0 ? 'binding' : `binding${index}`;
    const params =
      `("@authority";req "content-digest");created=${created};expires=${expires}` +
      `;keyid="${signer.keyid}";tag="${DIRECTORY_TAG}"`;
    const base =
      `"@authority";req: ${authorityOf(authorityUrl)}\n` +
      `"content-digest": ${digest}\n` +
      `"@signature-params": ${params}`;
    const signature = await signer.sign(new TextEncoder().encode(base));
    inputs.push(`${label}=${params}`);
    signatures.push(`${label}=:${base64(signature)}:`);
  }
  return {
    'Content-Type': DIRECTORY_MEDIA_TYPE,
    'Content-Digest': digest,
    'Signature-Input': inputs.join(', '),
    Signature: signatures.join(', '),
  };
}

/** What verifying a request found. */
export interface Verification {
  outcome: 'verified' | 'invalid' | 'unverified';
  reason?: string;
  agent?: string;
  keyid?: string;
  created?: Date;
  expires?: Date;
  nonce?: string;
}

/** Where nonces are remembered until their signature expires. */
export interface NonceStore {
  checkAndRecord(scope: string, nonce: string, until: Date): Promise<boolean>;
}

/** A nonce store for one page or process. */
export class InMemoryNonceStore implements NonceStore {
  private seen = new Map<string, number>();

  async checkAndRecord(scope: string, nonce: string, until: Date) {
    const now = Date.now();
    for (const [key, end] of this.seen) {
      if (end < now) {
        this.seen.delete(key);
      }
    }
    const key = `${scope} ${nonce}`;
    if (this.seen.has(key)) {
      return false;
    }
    this.seen.set(key, until.getTime());
    return true;
  }
}

/**
 * How an agent's keys are found for one `Signature-Agent` type: each type is
 * an extension of the protocol, the point `web_bot_auth.extension.<type>`.
 * Throws when the keys cannot be read.
 */
export interface KeyDiscovery {
  keys(agent: string): Promise<JsonWebKey[]>;
}

async function fetchChecked(
  fetchImpl: typeof fetch,
  url: string,
  insecureHosts: string[],
): Promise<Response> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'https:' &&
    !insecureHosts.includes(parsed.hostname)
  ) {
    throw new Error('a key directory is fetched over https');
  }
  const response = await fetchImpl(url, {
    headers: { Accept: DIRECTORY_MEDIA_TYPE },
    redirect: 'manual',
  });
  if (response.status !== 200) {
    throw new Error(`the key directory answered ${response.status}`);
  }
  return response;
}

/** `type=directory`: the origin's well-known directory, its Content-Digest checked. */
export function directoryDiscovery(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  insecureHosts: string[] = [],
): KeyDiscovery {
  return {
    async keys(agent) {
      const origin = new URL(agent);
      const url = `${origin.protocol}//${origin.host}${DIRECTORY_PATH}`;
      const response = await fetchChecked(fetchImpl, url, insecureHosts);
      const body = await response.text();
      if (
        response.headers.get('content-digest') !== (await contentDigest(body))
      ) {
        throw new Error(
          "the directory's Content-Digest does not match its body",
        );
      }
      return (JSON.parse(body).keys as JsonWebKey[]).map(publicJwkOf);
    },
  };
}

/** `type=jwks_uri`: a JWK Set at the URL itself. */
export function jwksUriDiscovery(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  insecureHosts: string[] = [],
): KeyDiscovery {
  return {
    async keys(agent) {
      const response = await fetchChecked(fetchImpl, agent, insecureHosts);
      return ((await response.json()).keys as JsonWebKey[]).map(publicJwkOf);
    },
  };
}

/** Public keys of an agent, by thumbprint; `undefined` when they could not be read. */
export type KeyResolver = (
  agent: string,
  discovery: string,
) => Promise<Map<string, JsonWebKey> | undefined>;

/** A resolver over one discovery per `Signature-Agent` type; a type with none answers nothing. */
export function keyResolver(
  discoveries: Record<string, KeyDiscovery>,
): KeyResolver {
  return async (agent, discovery) => {
    const found = discoveries[discovery];
    if (!found) {
      return undefined;
    }
    try {
      const keys = new Map<string, JsonWebKey>();
      for (const jwk of await found.keys(agent)) {
        keys.set(await jwkThumbprint(jwk), jwk);
      }
      return keys;
    } catch {
      return undefined;
    }
  };
}

/** The two discoveries this package implements, over one fetch. */
export function directoryResolver(
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  insecureHosts: string[] = [],
): KeyResolver {
  return keyResolver({
    directory: directoryDiscovery(fetchImpl, insecureHosts),
    jwks_uri: jwksUriDiscovery(fetchImpl, insecureHosts),
  });
}

export const WEB_BOT_AUTH_PLUGIN = 'agent-runtimes.protocols.web-bot-auth';
/** The host's signer: no default, the key is the host's. */
export const WebBotAuthSigners = defineContributionPoint<HttpSigner>(
  'web_bot_auth.signer',
);
export const WebBotAuthNonceStores = defineContributionPoint<NonceStore>(
  'web_bot_auth.nonceStore',
);
export const WebBotAuthDirectoryDiscoveries =
  defineContributionPoint<KeyDiscovery>('web_bot_auth.extension.directory');
export const WebBotAuthJwksUriDiscoveries =
  defineContributionPoint<KeyDiscovery>('web_bot_auth.extension.jwks_uri');
export const WebBotAuthCimdDiscoveries = defineContributionPoint<KeyDiscovery>(
  'web_bot_auth.extension.cimd',
);
const DISCOVERY_POINTS = {
  directory: WebBotAuthDirectoryDiscoveries,
  jwks_uri: WebBotAuthJwksUriDiscoveries,
  cimd: WebBotAuthCimdDiscoveries,
} as const;
const WEB_BOT_AUTH_POINTS = [
  WebBotAuthSigners,
  WebBotAuthNonceStores,
  ...Object.values(DISCOVERY_POINTS),
];

export const WebBotAuthPlugin = definePlugin({
  name: WEB_BOT_AUTH_PLUGIN,
  version: '1.0.0',
  description: `Web Bot Auth (${WEB_BOT_AUTH_SPECIFICATION}): sign an agent's requests, verify an agent's.`,
  contributionPoints: WEB_BOT_AUTH_POINTS,
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'web_bot_auth',
        name: 'Web Bot Auth (HTTP Message Signatures for automated traffic)',
        layer: 'identity',
        version: WEB_BOT_AUTH_SPECIFICATION,
        roles: ['signer', 'verifier', 'directory'],
        status: 'implemented',
        specification:
          'https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/',
        plugin: WEB_BOT_AUTH_PLUGIN,
        points: WEB_BOT_AUTH_POINTS.map(point => point.id),
      },
      { id: 'web_bot_auth', order: DEFAULT_ORDER },
    ),
    contribution(WebBotAuthNonceStores, new InMemoryNonceStore(), {
      id: 'memory',
      order: DEFAULT_ORDER,
    }),
    contribution(WebBotAuthDirectoryDiscoveries, directoryDiscovery(), {
      id: 'fetch',
      order: DEFAULT_ORDER,
    }),
    contribution(WebBotAuthJwksUriDiscoveries, jwksUriDiscovery(), {
      id: 'fetch',
      order: DEFAULT_ORDER,
    }),
  ],
});

/** The host's signer; throws when the host contributed none. */
export function signerOf(reactor: ReactorPlatformView): HttpSigner {
  return firstContribution(reactor, WebBotAuthSigners, 'Web Bot Auth signer');
}

/** A resolver over the discoveries contributed: one per type that has one. */
export function resolverOf(reactor: ReactorPlatformView): KeyResolver {
  const discoveries: Record<string, KeyDiscovery> = {};
  for (const [type, point] of Object.entries(DISCOVERY_POINTS)) {
    const found = optionalContribution(
      reactor,
      point,
      `Web Bot Auth ${type} discovery`,
    );
    if (found) {
      discoveries[type] = found;
    }
  }
  return keyResolver(discoveries);
}

/**
 * Verify the Web Bot Auth signature of one request. Keys are found by the
 * pair (the covered `Signature-Agent` URL, `keyid`), never by `keyid` alone.
 */
export async function verifyRequest(
  request: Request,
  resolveKeys: KeyResolver,
  options: { nonceStore?: NonceStore; now?: Date; clockSkew?: number } = {},
): Promise<Verification> {
  if (
    !request.headers.get('signature') ||
    !request.headers.get('signature-input')
  ) {
    return { outcome: 'unverified', reason: 'the request is not signed' };
  }
  const agentHeader = request.headers.get(SIGNATURE_AGENT_HEADER);
  if (!agentHeader) {
    return {
      outcome: 'invalid',
      reason: 'the request names no Signature-Agent',
    };
  }
  let unresolved: string | undefined;
  try {
    const verified = await verify(request, {
      now: options.now,
      clockSkew: options.clockSkew,
      resolver: async candidate => {
        const entry = candidate.signatureAgent;
        if (!entry) {
          throw new Error(
            'the signature does not cover its Signature-Agent member',
          );
        }
        const keys = await resolveKeys(entry.uri, entry.type);
        const jwk = keys?.get(candidate.keyid);
        if (!jwk) {
          unresolved = entry.uri;
          throw new Error('the key is not in the agent’s directory');
        }
        return (await verifierFromJWK(jwk)) as WebBotVerifier;
      },
    });
    const agent = verified.signatureAgent?.uri;
    if (verified.nonce && options.nonceStore) {
      const fresh = await options.nonceStore.checkAndRecord(
        `${agent} ${verified.keyid}`,
        verified.nonce,
        verified.expires,
      );
      if (!fresh) {
        return {
          outcome: 'invalid',
          reason: 'the nonce was seen before',
          agent,
        };
      }
    }
    return {
      outcome: 'verified',
      agent,
      keyid: verified.keyid,
      created: verified.created,
      expires: verified.expires,
      nonce: verified.nonce,
    };
  } catch (error) {
    if (unresolved) {
      return {
        outcome: 'unverified',
        reason: 'the key is not in the agent’s directory',
        agent: unresolved,
      };
    }
    return { outcome: 'invalid', reason: (error as Error).message };
  }
}

export { parseSignatureAgentHeader };
