/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  AgentIdentityClient,
  discoverCompany,
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
  readonly signIn: readonly string[];
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
    const { document } = company;
    const signIn = (['direct', 'device', 'mediated'] as const).filter(
      method => document.auth?.[method] !== undefined,
    );
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
      issuer: document.auth?.issuer ?? null,
      signIn: Object.freeze(signIn),
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
