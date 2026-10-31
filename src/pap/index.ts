/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  AgentIdentityClient,
  discoverCompany,
  mediatedSignIn,
  offersDevice,
  offersDirect,
  type DiscoveredCompany,
  type DiscoveryOptions,
  type JsonWebKeySet,
  type ClientMetadata,
  type IdentityRequestOptions,
} from '@datalayer/personal-agent-protocol';

/** Verified public company capabilities safe for model and UI surfaces. */
export interface PapCompanySummary {
  readonly organization: string;
  readonly domain: string;
  readonly protocolVersion: string;
  readonly issuer: string | null;
  /**
   * Direct and Device as the issuer's `grant_types_supported` offers them,
   * Mediated when the company offers that extension and its grant.
   */
  readonly signIn: readonly string[];
  /** The company's own scopes and what each allows (`auth.scopes`). */
  readonly scopes: Readonly<Record<string, string>>;
  /**
   * What each scope changes at most and whether it touches personal data
   * (`auth.scope_hints`): the company's claim.
   */
  readonly scopeHints: Readonly<
    Record<string, { readonly changes: string; readonly personalData: boolean }>
  >;
  /** The domains whose `poppy.json` names this issuer (`protected_resources`). */
  readonly protectedResources: readonly string[];
  readonly interfaces: readonly string[];
  readonly extensions: Readonly<Record<string, string>>;
}

/** Verified public personal-agent identity safe for model and UI surfaces. */
export interface PapAgentIdentitySummary {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectCount: number;
  readonly signingAlgorithms: readonly string[];
  readonly extensions: Readonly<Record<string, string>>;
}

type DiscoverCompany = (
  domain: string,
  options?: DiscoveryOptions,
) => Promise<DiscoveredCompany>;

interface IdentityClient {
  fetchMetadata(
    clientId: string,
    options?: IdentityRequestOptions,
  ): Promise<ClientMetadata>;
  fetchJwks(
    clientId: string,
    options?: IdentityRequestOptions,
  ): Promise<JsonWebKeySet>;
}

export interface PapPersonalAgentCapabilityOptions {
  readonly discover?: DiscoverCompany;
  readonly identity?: IdentityClient;
}

function extensionVersions(
  extensions: Readonly<Record<string, { readonly version: string }>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(extensions).map(([name, value]) => [name, value.version]),
    ),
  );
}

/**
 * Use PAP clients while enforcing Agent Runtimes' public-summary boundary.
 *
 * Authorization URLs, callback state, assertions, proofs, and tokens are not
 * represented by this API. Those values remain in deterministic host
 * services and cross runtime boundaries only as opaque references.
 */
export class PapPersonalAgentCapability {
  readonly #discover: DiscoverCompany;
  readonly #identity: IdentityClient;

  constructor(options: PapPersonalAgentCapabilityOptions = {}) {
    this.#discover = options.discover ?? discoverCompany;
    this.#identity = options.identity ?? new AgentIdentityClient();
  }

  async discoverCompany(
    domain: string,
    options: DiscoveryOptions = {},
  ): Promise<PapCompanySummary> {
    const company = await this.#discover(domain, options);
    const { document, oauthMetadata } = company;
    const auth = document.auth;
    const signIn = [
      ...(oauthMetadata && offersDirect(oauthMetadata) ? ['direct'] : []),
      ...(oauthMetadata && offersDevice(oauthMetadata) ? ['device'] : []),
      ...(mediatedSignIn(company) === undefined ? [] : ['mediated']),
    ];
    const interfaces = [
      ...(document.agent?.protocols.map(protocol => `agent:${protocol.type}`) ??
        []),
      ...document.apis.map(api => `api:${api.type}`),
      ...(document.web === undefined ? [] : ['web']),
    ];
    return Object.freeze({
      organization: document.organization.name,
      domain: document.organization.domain,
      protocolVersion: document.protocol_version,
      issuer: oauthMetadata?.issuer ?? null,
      signIn: Object.freeze(signIn),
      scopes: Object.freeze({ ...(auth?.scopes ?? {}) }),
      scopeHints: Object.freeze(
        Object.fromEntries(
          Object.entries(auth?.scope_hints ?? {}).map(([name, hint]) => [
            name,
            Object.freeze({
              changes: hint.changes,
              personalData: hint.personal_data,
            }),
          ]),
        ),
      ),
      protectedResources: Object.freeze([
        ...(oauthMetadata?.protected_resources ?? []),
      ]),
      interfaces: Object.freeze(interfaces),
      extensions: extensionVersions(document.extensions),
    });
  }

  async inspectAgent(
    clientId: string,
    options: IdentityRequestOptions = {},
  ): Promise<PapAgentIdentitySummary> {
    const metadata = await this.#identity.fetchMetadata(clientId, options);
    const keys = await this.#identity.fetchJwks(clientId, options);
    const signingAlgorithms = [
      ...new Set(
        keys.keys.map(key => key.alg ?? (key.kty === 'EC' ? 'ES256' : 'RS256')),
      ),
    ].sort();
    return Object.freeze({
      clientId: metadata.client_id,
      clientName: metadata.client_name,
      redirectCount: metadata.redirect_uris.length,
      signingAlgorithms: Object.freeze(signingAlgorithms),
      extensions: extensionVersions(metadata.extensions),
    });
  }
}
