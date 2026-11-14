/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  AVAILABLE_PROTOCOL_VERSIONS,
  AgentIdentityClient,
  discoverCompany,
  mediatedSignIn,
  negotiateExtensions,
  offersDevice,
  SUPPORTED_EXTENSIONS,
  offersDirect,
  organizationLabel,
  parseVersion,
  type DiscoveredCompany,
  type DiscoveryOptions,
  type JsonWebKeySet,
  type ClientMetadata,
  type IdentityRequestOptions,
} from '@datalayer/personal-agent-protocol';

/**
 * The one PAP version Agent Runtimes speaks: the newest its SDK implements
 * (the 1.0 draft with personal-agent-protocol 0.35). Announced and accepted
 * alone: a company serving only older versions is refused at discovery,
 * never negotiated down to.
 */
export const PAP_PROTOCOL_VERSION: string = [
  ...AVAILABLE_PROTOCOL_VERSIONS,
].reduce((newest, version) => {
  const [a, b] = [parseVersion(newest), parseVersion(version)];
  return b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? version : newest;
});

/** Verified public company capabilities safe for model and UI surfaces. */
export interface PapCompanySummary {
  readonly organization: string;
  readonly domain: string;
  /**
   * The name with the domain beside it (`organizationLabel`): the name is what
   * the domain says about itself, unconfirmed (PAP 1.0 §10.3), never shown alone.
   */
  readonly label: string;
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
  /**
   * The extensions a Session with it declares, one version each (`Poppy-Extensions`, PAP draft
   * 0.4 §3.3, §3.4): each it lists at a version this agent implements.
   */
  readonly extensions: Readonly<Record<string, string>>;
}

/** Verified public personal-agent identity safe for model and UI surfaces. */
export interface PapAgentIdentitySummary {
  readonly clientId: string;
  readonly clientName: string;
  readonly redirectCount: number;
  readonly signingAlgorithms: readonly string[];
  /**
   * The extensions this personal agent implements, one version each, declared per Session (PAP
   * draft 0.4 §3.3): client metadata lists none any more.
   */
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
    // At the one version Agent Runtimes speaks, whatever else the caller passes.
    const company = await this.#discover(domain, {
      ...options,
      protocolVersions: [PAP_PROTOCOL_VERSION],
    });
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
      label: organizationLabel(document.organization),
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
      extensions: Object.freeze(negotiateExtensions(document.extensions)),
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
      extensions: Object.freeze({ ...SUPPORTED_EXTENSIONS }),
    });
  }
}
