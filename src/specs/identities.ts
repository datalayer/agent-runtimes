/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Identity Catalog.
 *
 * Who is acting when an agent acts: a person, an agent, an application, an
 * organization, a visitor or a service, issued by Datalayer IAM, the Personal Agent
 * Protocol, Amazon Bedrock AgentCore Identity or an organization's OIDC provider;
 * how each proves it, the token it holds, where its third-party credentials are kept.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { IdentitySpec } from '../types/agentspecs';

export const AWS_AGENTCORE_GATEWAY_IDENTITY_0_0_1: IdentitySpec = {
  id: 'aws-agentcore-gateway',
  version: '0.0.1',
  name: 'AgentCore Gateway tools',
  description:
    "An AgentCore Gateway turning the customer's APIs and Lambda functions into MCP tools. Datalayer agents reach it as an MCP server; its inbound authorizer trusts Datalayer IAM, and its outbound calls take machine-to-machine credentials.",
  subject: 'service',
  provider: 'aws-agentcore',
  protocols: ['mcp'],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl:
      'https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration',
    algorithms: ['RS256'],
    audiences: [
      'arn:aws:bedrock-agentcore:<region>:<account>:gateway/<gateway-id>',
    ],
    clients: ['datalayer-platform'],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'agentcore-runtime',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'agentcore',
    providers: [
      {
        name: 'internal-api',
        kind: 'oauth2',
        flow: 'm2m',
        scopes: [],
      },
      {
        name: 'partner-api-key',
        kind: 'api-key',
        flow: '',
        scopes: [],
      },
    ],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'RS256',
  },
  consent: {
    by: 'organization',
    hostedBy: 'provider',
    binding: false,
  },
  enabled: true,
  tags: ['aws', 'agentcore', 'gateway', 'mcp'],
  icon: 'plug',
  emoji: '🔌',
};

export const AWS_AGENTCORE_RUNTIME_IDENTITY_0_0_1: IdentitySpec = {
  id: 'aws-agentcore-runtime',
  version: '0.0.1',
  name: 'AgentCore Runtime agent',
  description:
    "A Datalayer agent in AgentCore Runtime, in the customer's AWS account. Its JWT authorizer trusts Datalayer IAM's discovery document; Runtime hands the agent a workload access token for the person, and third-party tokens come from AgentCore's token vault, consent bound by Datalayer.",
  subject: 'agent',
  provider: 'aws-agentcore',
  protocols: ['ag-ui', 'a2a', 'mcp'],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl:
      'https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration',
    algorithms: ['RS256'],
    audiences: [
      'arn:aws:bedrock-agentcore:<region>:<account>:runtime/<runtime-id>',
    ],
    clients: ['datalayer-platform'],
    scopes: [],
    claims: {
      org_uid: '<organization>',
    },
    lifetimeSeconds: 900,
  },
  workload: {
    token: 'agentcore-runtime',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'agentcore',
    providers: [
      {
        name: 'github',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['read:user'],
      },
      {
        name: 'google-workspace',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
      },
      {
        name: 'salesforce',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['api', 'refresh_token'],
      },
    ],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'RS256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: true,
  },
  enabled: true,
  tags: ['aws', 'agentcore', 'runtime'],
  icon: 'cloud',
  emoji: '☁️',
};

export const AWS_AGENTCORE_VAULT_IDENTITY_0_0_1: IdentitySpec = {
  id: 'aws-agentcore-vault',
  version: '0.0.1',
  name: 'AgentCore vault from Datalayer',
  description:
    "An agent running on Datalayer, or as an Agent Node on ECS, whose organization keeps third-party tokens in its own AgentCore token vault: the platform obtains the workload access token with the person's verified JWT, never by user id.",
  subject: 'agent',
  provider: 'aws-agentcore',
  protocols: [],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl:
      'https://prod1.datalayer.run/api/iam/v1/oauth/.well-known/openid-configuration',
    algorithms: ['RS256'],
    audiences: [],
    clients: ['datalayer-platform'],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'agentcore-jwt',
    lifetimeSeconds: 900,
  },
  credentials: {
    vault: 'agentcore',
    providers: [
      {
        name: 'github',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['read:user'],
      },
    ],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'RS256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: true,
  },
  enabled: true,
  tags: ['aws', 'agentcore', 'vault'],
  icon: 'lock',
  emoji: '🔐',
};

export const DATALAYER_ACTING_AGENT_IDENTITY_0_0_1: IdentitySpec = {
  id: 'datalayer-acting-agent',
  version: '0.0.1',
  name: 'Agent acting for a person',
  description:
    'A deployed agent acting for the person it answers to: a 15-minute acting token whose subject is the person, carrying the application and the agent. Every tool call is checked by the Shield against the person, the agent and the call.',
  subject: 'agent',
  provider: 'datalayer',
  protocols: [],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl: '',
    algorithms: ['HS256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 900,
  },
  workload: {
    token: 'acting',
    lifetimeSeconds: 900,
  },
  credentials: {
    vault: 'datalayer',
    providers: [],
  },
  custody: {
    keys: 'shared-secret',
    algorithm: 'HS256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: false,
  },
  enabled: true,
  tags: ['datalayer', 'agent'],
  icon: 'dependabot',
  emoji: '🤖',
};

export const DATALAYER_PERSON_IDENTITY_0_0_1: IdentitySpec = {
  id: 'datalayer-person',
  version: '0.0.1',
  name: 'Datalayer person',
  description:
    'A person signed in to Datalayer IAM, by password, GitHub, Google, LinkedIn or Okta. The platform token stays inside Datalayer; anything a third party must verify is exchanged for a short-lived, audience-bound token signed asymmetrically.',
  subject: 'person',
  provider: 'datalayer',
  protocols: [],
  inbound: {
    kind: 'session',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl: '',
    algorithms: ['HS256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 86400,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'datalayer',
    providers: [
      {
        name: 'google-workspace',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      },
      {
        name: 'github',
        kind: 'oauth2',
        flow: 'user-federation',
        scopes: ['read:user', 'repo'],
      },
    ],
  },
  custody: {
    keys: 'shared-secret',
    algorithm: 'HS256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: false,
  },
  enabled: true,
  tags: ['datalayer', 'person'],
  icon: 'person',
  emoji: '🧑',
};

export const DATALAYER_SERVICE_AGENT_IDENTITY_0_0_1: IdentitySpec = {
  id: 'datalayer-service-agent',
  version: '0.0.1',
  name: 'Service agent',
  description:
    "An agent that works unattended for an organization (a schedule, a trigger, a team's worker): a service principal that obtains its token with OAuth 2.0 client credentials, scoped by the organization's policy.",
  subject: 'service',
  provider: 'datalayer',
  protocols: [],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl: '',
    algorithms: ['HS256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'client-credentials',
    lifetimeSeconds: 3600,
  },
  credentials: {
    vault: 'datalayer',
    providers: [],
  },
  custody: {
    keys: 'shared-secret',
    algorithm: 'HS256',
  },
  consent: {
    by: 'organization',
    hostedBy: 'datalayer',
    binding: false,
  },
  enabled: true,
  tags: ['datalayer', 'service'],
  icon: 'server',
  emoji: '⚙️',
};

export const DATALAYER_VISITOR_IDENTITY_0_0_1: IdentitySpec = {
  id: 'datalayer-visitor',
  version: '0.0.1',
  name: 'Visitor',
  description:
    'Someone talking to an embedded or public application without an account: an ephemeral identity, no vault, never asked to consent to a third party; a tool that needs one is refused in a sentence.',
  subject: 'visitor',
  provider: 'datalayer',
  protocols: [],
  inbound: {
    kind: 'jwt',
    issuer: 'https://prod1.datalayer.run/api/iam/v1/oauth',
    discoveryUrl: '',
    algorithms: ['HS256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 3600,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'none',
    providers: [],
  },
  custody: {
    keys: 'shared-secret',
    algorithm: 'HS256',
  },
  consent: {
    by: 'none',
    hostedBy: 'none',
    binding: false,
  },
  enabled: true,
  tags: ['datalayer', 'visitor'],
  icon: 'eye',
  emoji: '👀',
};

export const ORGANIZATION_OIDC_IDENTITY_0_0_1: IdentitySpec = {
  id: 'organization-oidc',
  version: '0.0.1',
  name: 'Organization sign-in (OIDC)',
  description:
    "An organization's own OpenID Connect provider (Entra ID, Okta, Google), registered on Datalayer for enterprise sign-in and SCIM: its issuer is checked against its discovery document and its keys.",
  subject: 'organization',
  provider: 'oidc',
  protocols: [],
  inbound: {
    kind: 'jwt',
    issuer: 'https://login.example.com',
    discoveryUrl: 'https://login.example.com/.well-known/openid-configuration',
    algorithms: ['RS256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'none',
    providers: [],
  },
  custody: {
    keys: 'provider',
    algorithm: 'RS256',
  },
  consent: {
    by: 'organization',
    hostedBy: 'provider',
    binding: false,
  },
  enabled: true,
  tags: ['enterprise', 'sso'],
  icon: 'organization',
  emoji: '🏢',
};

export const PAP_COMPANY_IDENTITY_0_0_1: IdentitySpec = {
  id: 'pap-company',
  version: '0.0.1',
  name: 'PAP company',
  description:
    'A business answering the personal agents its customers bring: it verifies their client assertions and DPoP proofs against the published keys, signs the person in by itself or mediated, and holds one Account Token per person and application.',
  subject: 'organization',
  provider: 'pap',
  protocols: ['pap', 'pact'],
  inbound: {
    kind: 'dpop',
    issuer: '',
    discoveryUrl: '',
    algorithms: ['ES256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'datalayer',
    providers: [],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'ES256',
  },
  consent: {
    by: 'person',
    hostedBy: 'provider',
    binding: true,
  },
  pap: {
    roles: ['company'],
    clientIdPerApplication: true,
    pairwise: true,
    dpop: true,
  },
  enabled: true,
  tags: ['pap', 'company'],
  icon: 'briefcase',
  emoji: '🏪',
};

export const PAP_PERSON_IDENTITY_0_0_1: IdentitySpec = {
  id: 'pap-person',
  version: '0.0.1',
  name: 'PAP person, for themselves',
  description:
    'A person who connects their own account at a company, with no application acting for them: the tenant is the person, pairwise and DPoP-bound as an application is.',
  subject: 'person',
  provider: 'pap',
  protocols: ['pap'],
  inbound: {
    kind: 'dpop',
    issuer: '',
    discoveryUrl: '',
    algorithms: ['ES256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'datalayer',
    providers: [],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'ES256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: true,
  },
  pap: {
    roles: ['personal-agent'],
    clientIdPerApplication: false,
    pairwise: true,
    dpop: true,
  },
  enabled: true,
  tags: ['pap', 'person'],
  icon: 'person',
  emoji: '🧑‍💼',
};

export const PAP_PERSONAL_AGENT_IDENTITY_0_0_1: IdentitySpec = {
  id: 'pap-personal-agent',
  version: '0.0.1',
  name: 'PAP personal agent',
  description:
    'An application acting for a person at a company, under the Personal Agent Protocol: one client id per application published with its keys, a pairwise user id per company that companies cannot link, DPoP-bound tokens, keys signed in Vault transit and never handed to a runtime.',
  subject: 'application',
  provider: 'pap',
  protocols: ['pap', 'web-bot-auth'],
  inbound: {
    kind: 'dpop',
    issuer: '',
    discoveryUrl: '',
    algorithms: ['ES256'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'acting',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'datalayer',
    providers: [],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'ES256',
  },
  consent: {
    by: 'person',
    hostedBy: 'datalayer',
    binding: true,
  },
  pap: {
    roles: ['personal-agent'],
    clientIdPerApplication: true,
    pairwise: true,
    dpop: true,
  },
  enabled: true,
  tags: ['pap', 'personal-agent'],
  icon: 'person',
  emoji: '🙋',
};

export const WEB_BOT_AUTH_AGENT_IDENTITY_0_0_1: IdentitySpec = {
  id: 'web-bot-auth-agent',
  version: '0.0.1',
  name: 'Signed web agent',
  description:
    "An agent whose outbound requests are signed (HTTP Message Signatures, RFC 9421) with a key a website checks against the agent's published key directory, so a site knows which agent is calling.",
  subject: 'agent',
  provider: 'datalayer',
  protocols: ['web-bot-auth'],
  inbound: {
    kind: 'http-signature',
    issuer: '',
    discoveryUrl: '',
    algorithms: ['Ed25519'],
    audiences: [],
    clients: [],
    scopes: [],
    claims: {},
    lifetimeSeconds: 0,
  },
  workload: {
    token: 'none',
    lifetimeSeconds: 0,
  },
  credentials: {
    vault: 'none',
    providers: [],
  },
  custody: {
    keys: 'vault-transit',
    algorithm: 'Ed25519',
  },
  consent: {
    by: 'none',
    hostedBy: 'none',
    binding: false,
  },
  enabled: true,
  tags: ['web-bot-auth', 'agent'],
  icon: 'globe',
  emoji: '✍️',
};

export const IDENTITY_CATALOGUE: Record<string, IdentitySpec> = {
  'aws-agentcore-gateway': AWS_AGENTCORE_GATEWAY_IDENTITY_0_0_1,
  'aws-agentcore-runtime': AWS_AGENTCORE_RUNTIME_IDENTITY_0_0_1,
  'aws-agentcore-vault': AWS_AGENTCORE_VAULT_IDENTITY_0_0_1,
  'datalayer-acting-agent': DATALAYER_ACTING_AGENT_IDENTITY_0_0_1,
  'datalayer-person': DATALAYER_PERSON_IDENTITY_0_0_1,
  'datalayer-service-agent': DATALAYER_SERVICE_AGENT_IDENTITY_0_0_1,
  'datalayer-visitor': DATALAYER_VISITOR_IDENTITY_0_0_1,
  'organization-oidc': ORGANIZATION_OIDC_IDENTITY_0_0_1,
  'pap-company': PAP_COMPANY_IDENTITY_0_0_1,
  'pap-person': PAP_PERSON_IDENTITY_0_0_1,
  'pap-personal-agent': PAP_PERSONAL_AGENT_IDENTITY_0_0_1,
  'web-bot-auth-agent': WEB_BOT_AUTH_AGENT_IDENTITY_0_0_1,
};

/** A Identity, by `id` or `id:version`, or undefined. */
export function getIdentity(ref: string): IdentitySpec | undefined {
  // Own entries only: `constructor` and `toString` are not Identitys.
  const own = (id: string): IdentitySpec | undefined =>
    Object.prototype.hasOwnProperty.call(IDENTITY_CATALOGUE, id)
      ? IDENTITY_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

export function listIdentitys(): IdentitySpec[] {
  return Object.values(IDENTITY_CATALOGUE);
}
