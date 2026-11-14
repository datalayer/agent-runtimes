/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  SUPPORTED_EXTENSIONS,
  type ClientMetadata,
  type DiscoveredCompany,
  type JsonWebKeySet,
} from '@datalayer/personal-agent-protocol';
import { describe, expect, it, vi } from 'vitest';
import { PAP_PROTOCOL_VERSION, PapPersonalAgentCapability } from './index';

const company: DiscoveredCompany = {
  discoveryUrl: 'https://shop.example/.well-known/poppy.json',
  document: {
    protocol_version: '1.0',
    organization: { name: 'Example Shop', domain: 'shop.example' },
    auth: {
      issuer: 'https://auth.shop.example',
      scopes: { 'catalogue:read': 'Read the catalogue' },
      scope_hints: {
        'catalogue:read': { changes: 'none', personal_data: false },
      },
    },
    agent: {
      protocols: [{ type: 'a2a', endpoint: 'https://shop.example/agent' }],
    },
    apis: [
      {
        type: 'openapi',
        url: 'https://shop.example/openapi.json',
        description: 'Read the catalogue',
      },
    ],
    // PAP draft 0.4 §3.3: a list, one entry per version the company supports.
    extensions: { operations: [{ version: '2' }, { version: '3' }] },
  },
  // Direct and Device are what the issuer's grants say (draft 0.3 §3.2).
  oauthMetadata: {
    issuer: 'https://auth.shop.example',
    token_endpoint: 'https://auth.shop.example/token',
    revocation_endpoint: 'https://auth.shop.example/revoke',
    authorization_endpoint: 'https://auth.shop.example/authorize',
    grant_types_supported: [
      'urn:ietf:params:oauth:grant-type:jwt-bearer',
      'refresh_token',
      'authorization_code',
    ],
    protected_resources: ['https://shop.example'],
    scopes_supported: ['catalogue:read'],
  },
};

const metadata: ClientMetadata = {
  client_id: 'https://assistant.example/agent.json',
  client_name: 'Example Assistant',
  jwks_uri: 'https://assistant.example/jwks.json',
  redirect_uris: ['https://assistant.example/callback'],
  token_endpoint_auth_method: 'private_key_jwt',
};

const keys: JsonWebKeySet = {
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      x: 'x-coordinate',
      y: 'y-coordinate',
      use: 'sig',
    },
  ],
};

describe('PapPersonalAgentCapability', () => {
  it('returns company capabilities without remote endpoints', async () => {
    const discover = vi.fn().mockResolvedValue(company);
    const capability = new PapPersonalAgentCapability({ discover });

    const summary = await capability.discoverCompany('shop.example');

    // At the one version Agent Runtimes speaks, the newest the SDK has.
    expect(PAP_PROTOCOL_VERSION).toBe('1.0');
    expect(discover).toHaveBeenCalledWith('shop.example', {
      protocolVersions: ['1.0'],
    });
    expect(summary).toMatchObject({
      organization: 'Example Shop',
      // The domain beside the unconfirmed name (PAP 1.0 §10.3).
      label: 'Example Shop (shop.example)',
      protocolVersion: '1.0',
      signIn: ['direct'],
      scopes: { 'catalogue:read': 'Read the catalogue' },
      scopeHints: {
        'catalogue:read': { changes: 'none', personalData: false },
      },
      protectedResources: ['https://shop.example'],
      interfaces: ['agent:a2a', 'api:openapi'],
      // The version a Session declares: the one this agent implements (Poppy-Extensions).
      extensions: { operations: '3' },
    });
    expect(JSON.stringify(summary)).not.toContain('openapi.json');
    expect(JSON.stringify(summary)).not.toContain('/agent');
    expect(JSON.stringify(summary)).not.toContain('/token');
  });

  it('returns public key policy without JWK coordinates', async () => {
    const capability = new PapPersonalAgentCapability({
      identity: {
        fetchMetadata: vi.fn().mockResolvedValue(metadata),
        fetchJwks: vi.fn().mockResolvedValue(keys),
      },
    });

    const summary = await capability.inspectAgent(metadata.client_id);

    expect(summary).toMatchObject({
      clientName: 'Example Assistant',
      signingAlgorithms: ['ES256'],
      // What this agent implements, declared per Session; client metadata lists none.
      extensions: { ...SUPPORTED_EXTENSIONS },
    });
    expect(JSON.stringify(summary)).not.toContain('x-coordinate');
    expect(JSON.stringify(summary)).not.toContain('y-coordinate');
  });
});
