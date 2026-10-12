/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * PACT 1.0, Personal Agent Consent & Trust, as a Reactor Plugin and a
 * personal agent (AGENT_PROTOCOLS PR-10 to PR-13) — the twin of
 * `agent_runtimes.protocols.pact`. Built against
 * `openpactprotocol/openpactprotocol` `docs/spec.md` at 838c6bd
 * (2026-10-06), reviewed 2026-10-12.
 *
 * The personal-agent JWT (§3.2) is signed by the host's key through
 * `pact.signer` (ES256, the Web Bot Auth signer's contract); the delegation
 * token (§5) is kept in `pact.delegationStore`, never handed to the agent;
 * every receipt (§5.6) is verified with `jose` before it is kept in
 * `pact.receiptStore`.
 *
 * @module protocols/pact
 */

import {
  contribution,
  defineContributionPoint,
  definePlugin,
  type ReactorPlatformView,
} from '@datalayer/reactor';
import { compactVerify, importJWK } from 'jose';
import {
  DEFAULT_ORDER,
  ProtocolDescriptions,
  firstContribution,
} from '../core';
import type { HttpSigner } from '../web-bot-auth';

export const PACT_VERSION = '1.0';
export const PACT_PLUGIN = 'agent-runtimes.protocols.pact';
export const DELEGATION_HEADER = 'X-A2A-User-Delegation';
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

type Json = Record<string, any>;

export class PactError extends Error {}

/** A scope a Brand offers, and its action class (F-10): unknown is the most restricted. */
export interface PactScope {
  id: string;
  description: string;
  actionClass: 'read' | 'write';
}

export interface PactCard {
  name: string;
  interfaceUrl: string;
  identityScheme: string;
  profile: 'identity' | 'delegated';
  delegation?: {
    deviceAuthorizationUrl: string;
    tokenUrl: string;
    metadataUrl: string;
    scopes: PactScope[];
  };
}

export interface DelegationStore {
  put(
    brand: string,
    user: string,
    token: string,
    scopes: string[],
  ): Promise<void>;
  get(
    brand: string,
    user: string,
  ): Promise<{ token: string; scopes: string[] } | undefined>;
  delete(brand: string, user: string): Promise<void>;
}
export interface ReceiptStore {
  keep(brand: string, user: string, claims: Json): Promise<void>;
}
export interface DelegatedProfile {
  grantType: string;
}

export class InMemoryDelegationStore implements DelegationStore {
  private held = new Map<string, { token: string; scopes: string[] }>();
  async put(brand: string, user: string, token: string, scopes: string[]) {
    this.held.set(`${brand} ${user}`, { token, scopes });
  }
  async get(brand: string, user: string) {
    return this.held.get(`${brand} ${user}`);
  }
  async delete(brand: string, user: string) {
    this.held.delete(`${brand} ${user}`);
  }
}

export class InMemoryReceiptStore implements ReceiptStore {
  readonly receipts: Array<{ brand: string; user: string; claims: Json }> = [];
  async keep(brand: string, user: string, claims: Json) {
    this.receipts.push({ brand, user, claims });
  }
}

export const PactSigners = defineContributionPoint<HttpSigner>('pact.signer');
export const PactDelegationStores = defineContributionPoint<DelegationStore>(
  'pact.delegationStore',
);
export const PactReceiptStores =
  defineContributionPoint<ReceiptStore>('pact.receiptStore');
export const PactDelegatedProfiles = defineContributionPoint<DelegatedProfile>(
  'pact.extension.delegated',
);
const POINTS = [
  PactSigners,
  PactDelegationStores,
  PactReceiptStores,
  PactDelegatedProfiles,
];

export const PactPlugin = definePlugin({
  name: PACT_PLUGIN,
  version: '1.0.0',
  description: `PACT ${PACT_VERSION}: a personal agent at a business, and what the person let it do.`,
  contributionPoints: POINTS,
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'pact',
        name: 'Personal Agent Consent & Trust',
        layer: 'consent',
        version: PACT_VERSION,
        roles: ['personal-agent', 'provider'],
        status: 'partial',
        specification:
          'https://github.com/openpactprotocol/openpactprotocol/blob/main/docs/spec.md',
        plugin: PACT_PLUGIN,
        points: POINTS.map(point => point.id),
      },
      { id: 'pact', order: DEFAULT_ORDER },
    ),
    contribution(
      PactDelegatedProfiles,
      { grantType: DEVICE_CODE_GRANT },
      { id: 'device-code', order: DEFAULT_ORDER },
    ),
  ],
  // Stores are state: one per reactor, not one per module.
  register: ctx => {
    ctx.contribute(PactDelegationStores, new InMemoryDelegationStore(), {
      id: 'memory',
      order: DEFAULT_ORDER,
    });
    ctx.contribute(PactReceiptStores, new InMemoryReceiptStore(), {
      id: 'memory',
      order: DEFAULT_ORDER,
    });
  },
});

const READ_VERBS = new Set(['read', 'view', 'list', 'status', 'lookup']);

function actionClassOf(id: string): 'read' | 'write' {
  const verb = id.split(':').pop()?.toLowerCase() ?? '';
  return READ_VERBS.has(verb) ? 'read' : 'write';
}

function bearer(scheme: Json | undefined): boolean {
  return (
    String(scheme?.httpAuthSecurityScheme?.scheme ?? '').toLowerCase() ===
    'bearer'
  );
}

/** A Brand's card as PACT 1.0 reads it (§2.1, §5.1); throws when it is not one. */
export function readCard(card: Json): PactCard {
  const iface = (card.supportedInterfaces ?? []).find(
    (entry: Json) =>
      entry.protocolBinding === 'HTTP+JSON' && entry.protocolVersion === '1.0',
  );
  if (!iface) {
    throw new PactError('the card offers no HTTP+JSON 1.0 interface');
  }
  const schemes: Json = card.securitySchemes ?? {};
  const requirements: string[][] = (card.securityRequirements ?? []).map(
    (entry: Json) => Object.keys(entry.schemes ?? {}),
  );
  const alone = requirements.find(
    names => names.length === 1 && bearer(schemes[names[0]]),
  );
  if (!alone) {
    throw new PactError(
      'the card does not ask for the personal-agent JWT alone',
    );
  }
  const identity = alone[0];
  let delegation: PactCard['delegation'];
  for (const names of requirements) {
    if (names.length !== 2 || !names.includes(identity)) {
      continue;
    }
    const oauth =
      schemes[names.find(name => name !== identity)!]?.oauth2SecurityScheme;
    const device = oauth?.flows?.deviceCode;
    if (!oauth || !device) {
      continue;
    }
    if (!oauth.oauth2MetadataUrl) {
      throw new PactError('the delegation names no RFC 8414 metadata');
    }
    delegation = {
      deviceAuthorizationUrl: device.deviceAuthorizationUrl,
      tokenUrl: device.tokenUrl,
      metadataUrl: oauth.oauth2MetadataUrl,
      scopes: Object.entries(device.scopes ?? {}).map(([id, description]) => ({
        id,
        description: String(description),
        actionClass: actionClassOf(id),
      })),
    };
    break;
  }
  return {
    name: String(card.name ?? ''),
    interfaceUrl: String(iface.url).replace(/\/$/, ''),
    identityScheme: identity,
    profile: delegation ? 'delegated' : 'identity',
    delegation,
  };
}

function b64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One personal-agent JWT (§3.2): ES256 by the host's signer, `sub` opaque, ≤ 300 s. */
export async function signPersonalAgentJwt(
  signer:
    | HttpSigner
    | {
        keyid: string;
        algorithm: string;
        sign(data: Uint8Array): Promise<Uint8Array>;
      },
  claims: {
    issuer: string;
    subject: string;
    audience: string;
    lifetime?: number;
  },
): Promise<string> {
  if (signer.algorithm !== 'ecdsa-p256-sha256') {
    throw new PactError(
      'a personal-agent JWT is signed ES256 here (a P-256 key)',
    );
  }
  if (!claims.subject || claims.subject.includes('@')) {
    throw new PactError('`sub` is a stable, opaque id: never an address');
  }
  const lifetime = claims.lifetime ?? 120;
  if (lifetime > 300) {
    throw new PactError('a personal-agent JWT lives at most 300 seconds');
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: Json) =>
    b64url(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'ES256', kid: signer.keyid, typ: 'JWT' })}.${encode(
    {
      iss: claims.issuer,
      sub: claims.subject,
      aud: claims.audience,
      iat: now,
      exp: now + lifetime,
      jti: crypto.randomUUID(),
    },
  )}`;
  const signature = await signer.sign(new TextEncoder().encode(input));
  return `${input}.${b64url(signature)}`;
}

export type Reply = {
  kind: 'reply';
  text: string;
  contextId: string;
  scopesUsed: string[];
  actions: string[];
};
export type StepUp = {
  kind: 'step-up';
  text: string;
  contextId: string;
  missing: string[];
  verificationUri: string;
};
/** What the person is shown to sign in at the Brand: never the device code. */
export type SignIn = {
  verificationUri: string;
  userCode: string;
  expiresIn: number;
  reference: string;
};

/** A personal agent at one Brand. */
export class PactPersonalAgent {
  card?: PactCard;
  private pending = new Map<string, string>();
  private jwks?: Json;

  constructor(
    private readonly options: {
      cardUrl: string;
      issuer: string;
      audience: string;
      reactor: ReactorPlatformView;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private get fetch(): typeof fetch {
    return this.options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private jwt(user: string): Promise<string> {
    const signer = firstContribution(
      this.options.reactor,
      PactSigners,
      'PACT signer',
    );
    return signPersonalAgentJwt(signer, {
      issuer: this.options.issuer,
      subject: user,
      audience: this.options.audience,
    });
  }

  private delegations(): DelegationStore {
    return firstContribution(
      this.options.reactor,
      PactDelegationStores,
      'PACT delegation store',
    );
  }

  async discover(): Promise<PactCard> {
    const answer = await this.fetch(this.options.cardUrl);
    if (answer.status !== 200) {
      throw new PactError(`the card answered ${answer.status}`);
    }
    this.card = readCard(await answer.json());
    return this.card;
  }

  async send(
    user: string,
    text: string,
    options: { contextId?: string; messageId?: string } = {},
  ): Promise<Reply | StepUp> {
    const card = this.card ?? (await this.discover());
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.jwt(user)}`,
      'A2A-Version': '1.0',
      'Content-Type': 'application/json',
    };
    const held = await this.delegations().get(card.interfaceUrl, user);
    if (held) {
      headers[DELEGATION_HEADER] = `Bearer ${held.token}`;
    }
    const answer = await this.fetch(`${card.interfaceUrl}/message:send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: {
          messageId: options.messageId ?? crypto.randomUUID(),
          role: 'ROLE_USER',
          parts: [{ text }],
          ...(options.contextId ? { contextId: options.contextId } : {}),
        },
      }),
    });
    if (answer.status === 401) {
      throw new PactError(
        'the Brand refused the personal agent’s identity or its delegation',
      );
    }
    const body: Json = await answer.json();
    if (body.error) {
      throw new PactError(
        `${body.error.details?.[0]?.reason ?? body.error.status}: ${body.error.message}`,
      );
    }
    if (body.task) {
      const meta = body.task.metadata ?? {};
      return {
        kind: 'step-up',
        text: (body.task.status?.message?.parts ?? [])
          .map((p: Json) => p.text)
          .join(' '),
        contextId: body.task.contextId,
        missing: meta['pact.missingScopes'] ?? [],
        verificationUri: meta['pact.verificationUriComplete'] ?? '',
      };
    }
    const reply = body.message;
    let claims: Json = {};
    if (held) {
      const receipt = reply.metadata?.['pact.receipt'];
      if (!receipt) {
        throw new PactError('a reply under delegation carries no receipt');
      }
      claims = await this.verifyReceipt(receipt);
      await firstContribution(
        this.options.reactor,
        PactReceiptStores,
        'PACT receipt store',
      ).keep(card.interfaceUrl, user, claims);
    }
    return {
      kind: 'reply',
      text: (reply.parts ?? []).map((p: Json) => p.text).join(' '),
      contextId: reply.contextId,
      scopesUsed: claims.scopesUsed ?? [],
      actions: (claims.actions ?? []).map((a: Json) => a.tool),
    };
  }

  private async verifyReceipt(receipt: Json): Promise<Json> {
    const card = this.card!;
    if (!this.jwks) {
      const metadata = await (
        await this.fetch(card.delegation!.metadataUrl)
      ).json();
      this.jwks = await (await this.fetch(metadata.jwks_uri)).json();
    }
    const kid = JSON.parse(
      atob(receipt.jws.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')),
    ).kid;
    const jwk = (this.jwks!.keys as Json[]).find(key => key.kid === kid);
    if (!jwk) {
      throw new PactError('no key of the Brand signs this receipt');
    }
    const { payload } = await compactVerify(
      receipt.jws,
      await importJWK(jwk, 'ES256'),
    );
    const claims = JSON.parse(new TextDecoder().decode(payload));
    if (JSON.stringify(claims) !== JSON.stringify(receipt.claims)) {
      throw new PactError('the receipt’s claims are not the ones it signs');
    }
    return claims;
  }

  async requestSignIn(user: string, scopes: string[]): Promise<SignIn> {
    const card = this.card ?? (await this.discover());
    if (!card.delegation) {
      throw new PactError('the Brand offers no delegation');
    }
    const offered = new Set(card.delegation.scopes.map(scope => scope.id));
    const unknown = scopes.filter(scope => !offered.has(scope));
    if (unknown.length) {
      throw new PactError(`not on the card: ${unknown.join(', ')}`);
    }
    const answer = await this.fetch(card.delegation.deviceAuthorizationUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.jwt(user)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.options.issuer,
        scope: scopes.join(' '),
      }).toString(),
    });
    if (answer.status !== 200) {
      throw new PactError(`device authorization answered ${answer.status}`);
    }
    const body = await answer.json();
    const reference = crypto.randomUUID();
    this.pending.set(reference, body.device_code);
    return {
      verificationUri: body.verification_uri_complete ?? body.verification_uri,
      userCode: body.user_code,
      expiresIn: body.expires_in,
      reference,
    };
  }

  /** Ask once whether the person approved: the scopes granted, or `undefined` while pending. */
  async pollSignIn(
    user: string,
    signIn: SignIn,
  ): Promise<string[] | undefined> {
    const card = this.card!;
    const deviceCode = this.pending.get(signIn.reference);
    if (!deviceCode) {
      throw new PactError('no sign-in pending under this reference');
    }
    const answer = await this.fetch(card.delegation!.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await this.jwt(user)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT,
        device_code: deviceCode,
        client_id: this.options.issuer,
      }).toString(),
    });
    const body = await answer.json();
    if (body.error === 'authorization_pending' || body.error === 'slow_down') {
      return undefined;
    }
    if (body.error) {
      this.pending.delete(signIn.reference);
      throw new PactError(`the sign-in ended: ${body.error}`);
    }
    const granted = String(body.scope ?? '')
      .split(' ')
      .filter(Boolean);
    await this.delegations().put(
      card.interfaceUrl,
      user,
      body.access_token,
      granted,
    );
    this.pending.delete(signIn.reference);
    return granted;
  }

  /** Poll until the person approved; the scopes they actually granted. */
  async finishSignIn(
    user: string,
    signIn: SignIn,
    intervalMs = 5000,
    attempts = 120,
  ): Promise<string[]> {
    for (let i = 0; i < attempts; i++) {
      const granted = await this.pollSignIn(user, signIn);
      if (granted) {
        return granted;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    throw new PactError('the person did not sign in in time');
  }
}
