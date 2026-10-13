/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Visa's Trusted Agent Protocol as a profile over Web Bot Auth
 * (AGENT_PROTOCOLS PR-24) — the twin of
 * `agent_runtimes.protocols.web_bot_auth.tap`.
 *
 * **Draft.** Built on 2026-10-13 from Visa's public *Merchant
 * Specifications* and its reference repository (`TAP_SOURCES`), not
 * confirmed by Visa: the product says it *arriving* until it is. Visa
 * publishes no test vector; `fixtures/tap.json` is one computed in Python
 * and reproduced here byte for byte.
 *
 * The agent-recognition signature: `Signature-Input` and `Signature` alone
 * (Visa names no `Signature-Agent`, so keys are handed in by `keyid`),
 * covering at least `@authority` and `@path`, with `created`, `keyid`,
 * `alg="Ed25519"`, `expires`, `nonce` and `tag` — `agent-browser-auth` to
 * browse, `agent-payer-auth` to pay —, `created` and `expires` at most 8
 * minutes apart, a nonce seen in the last 8 minutes a replay. Signed and
 * verified with Cloudflare's `http-message-sig`, the RFC 9421 library under
 * `web-bot-auth`.
 *
 * @module protocols/web-bot-auth/tap
 */

import { createSignature, verifySignature, webcrypto } from 'http-message-sig';
import {
  generateNonce,
  jwkThumbprint,
  type HttpSigner,
  type NonceStore,
} from './index';

/** Draft until Visa confirms it. */
export const TAP_STATUS = 'draft';
/** Where the profile was read, 2026-10-13. */
export const TAP_SOURCES = [
  'https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications',
  'https://developer.visa.com/capabilities/trusted-agent-protocol/overview',
  'https://github.com/visa/trusted-agent-protocol',
] as const;
/** Visa's key directory, as its page says it. */
export const VISA_JWKS = 'https://mcp.visa.com/.well-known/jwks';
export const TAP_BROWSE_TAG = 'agent-browser-auth';
export const TAP_PAY_TAG = 'agent-payer-auth';
export type TapIntent = 'browse' | 'pay';
export const TAP_TAGS: Record<TapIntent, string> = {
  browse: TAP_BROWSE_TAG,
  pay: TAP_PAY_TAG,
};
export const TAP_REQUIRED_COMPONENTS = ['@authority', '@path'] as const;
export const TAP_REQUIRED_PARAMS = [
  'created',
  'keyid',
  'alg',
  'expires',
  'nonce',
  'tag',
] as const;
/** `alg` as Visa writes it. */
export const TAP_ALG = 'Ed25519';
/** The longest window, and how long a nonce is remembered. */
export const TAP_MAX_WINDOW_SECONDS = 8 * 60;

export interface TapSignOptions {
  intent: TapIntent;
  label?: string;
  /** Covered: at least `@authority` and `@path` (the default). */
  components?: string[];
  /** Unix seconds; now by default. */
  created?: number;
  /** Seconds, at most 8 minutes (the default). */
  lifetime?: number;
  nonce?: string;
}

export interface TapSignedHeaders {
  'Signature-Input': string;
  Signature: string;
}

/** What verifying a TAP signature found; `reason` when it does not hold. */
export interface TapVerification {
  verified: boolean;
  reason?: string;
  intent?: TapIntent;
  keyid?: string;
  nonce?: string;
}

/** Sign one request as a TAP agent browsing or paying, under an Ed25519 key. */
export async function signTapRequest(
  request: { method: string; url: string },
  signer: HttpSigner,
  options: TapSignOptions,
): Promise<TapSignedHeaders> {
  if (signer.algorithm !== 'ed25519') {
    throw new Error('a TAP signature is Ed25519');
  }
  const components = options.components ?? [...TAP_REQUIRED_COMPONENTS];
  const missing = TAP_REQUIRED_COMPONENTS.filter(
    name => !components.includes(name),
  );
  if (missing.length) {
    throw new Error(`a TAP signature covers ${missing.join(', ')}`);
  }
  const lifetime = options.lifetime ?? TAP_MAX_WINDOW_SECONDS;
  if (!(lifetime > 0 && lifetime <= TAP_MAX_WINDOW_SECONDS)) {
    throw new Error(
      `a TAP signature lives at most ${TAP_MAX_WINDOW_SECONDS}s (8 minutes)`,
    );
  }
  const created = options.created ?? Math.floor(Date.now() / 1000);
  const fields = await createSignature(
    {
      kind: 'request',
      method: request.method,
      targetUri: request.url,
      fields: [],
    },
    {
      label: options.label ?? 'sig2',
      components,
      parameters: {
        created,
        keyid: signer.keyid,
        alg: TAP_ALG,
        expires: created + lifetime,
        nonce: options.nonce ?? generateNonce(),
        tag: TAP_TAGS[options.intent],
      },
      signer: { algorithm: TAP_ALG, sign: data => signer.sign(data) },
    },
  );
  return {
    'Signature-Input': fields.signatureInput,
    Signature: fields.signature,
  };
}

const TAP_LABEL =
  /(?:^|,)\s*([a-z*][a-z0-9_.*-]*)=\([^)]*\)[^,]*;tag="(?:agent-browser-auth|agent-payer-auth)"/g;

/**
 * Verify the TAP signature of one request against Ed25519 keys known by
 * `keyid` (Visa's directory, or a registry's). A request with no TAP tag is
 * no trusted agent's; the merchant decides what to do with it.
 */
export async function verifyTapRequest(
  request: Request,
  keys: Map<string, JsonWebKey>,
  options: { nonceStore: NonceStore; now?: number },
): Promise<TapVerification> {
  const input = request.headers.get('signature-input');
  if (!input || !request.headers.get('signature')) {
    return { verified: false, reason: 'the request is not signed' };
  }
  const labels = [...input.matchAll(TAP_LABEL)].map(match => match[1]);
  if (labels.length === 0) {
    return { verified: false, reason: 'no signature carries a TAP tag' };
  }
  if (labels.length > 1) {
    return {
      verified: false,
      reason: 'more than one signature carries a TAP tag',
    };
  }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  let keyid: string | undefined;
  let unknownKey = false;
  try {
    const verified = await verifySignature(request, {
      label: labels[0],
      policy: {
        algorithms: [TAP_ALG],
        requiredComponents: [...TAP_REQUIRED_COMPONENTS],
        requiredParameters: [...TAP_REQUIRED_PARAMS],
        now,
        validate: signature => {
          const { created, expires, tag } = signature.parameters;
          return (
            (tag === TAP_BROWSE_TAG || tag === TAP_PAY_TAG) &&
            created !== undefined &&
            expires !== undefined &&
            expires - created <= TAP_MAX_WINDOW_SECONDS &&
            now < expires
          );
        },
      },
      resolveVerifier: async candidate => {
        keyid = candidate.parameters.keyid;
        const jwk = keyid === undefined ? undefined : keys.get(keyid);
        if (!jwk || jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
          unknownKey = true;
          throw new Error('the key is not a known Ed25519 key');
        }
        const key = await crypto.subtle.importKey(
          'jwk',
          jwk,
          { name: 'Ed25519' },
          false,
          ['verify'],
        );
        const verifier = webcrypto.verifier(key);
        return {
          algorithm: TAP_ALG,
          verify: (data: Uint8Array, signature: Uint8Array) =>
            verifier.verify(data, signature),
        };
      },
    });
    const { tag, nonce } = verified.parameters;
    if (nonce === undefined || keyid === undefined) {
      return { verified: false, reason: 'the signature has no nonce', keyid };
    }
    const fresh = await options.nonceStore.checkAndRecord(
      `tap ${keyid}`,
      nonce,
      new Date((now + TAP_MAX_WINDOW_SECONDS) * 1000),
    );
    if (!fresh) {
      return { verified: false, reason: 'the nonce was seen before', keyid };
    }
    return {
      verified: true,
      intent: tag === TAP_PAY_TAG ? 'pay' : 'browse',
      keyid,
      nonce,
    };
  } catch (error) {
    return {
      verified: false,
      reason: unknownKey
        ? 'the key is not a known Ed25519 key'
        : (error as Error).message,
      keyid,
    };
  }
}

/** The `keyid` of an Ed25519 public JWK, as a TAP key list is indexed when it says none. */
export async function tapKeys(
  jwks: JsonWebKey[],
): Promise<Map<string, JsonWebKey>> {
  const keys = new Map<string, JsonWebKey>();
  for (const jwk of jwks) {
    const kid = (jwk as JsonWebKey & { kid?: string }).kid;
    keys.set(kid ?? (await jwkThumbprint(jwk)), jwk);
  }
  return keys;
}
