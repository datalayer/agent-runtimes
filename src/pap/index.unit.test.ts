/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type {
  ClientMetadata,
  DiscoveredCompany,
  JsonWebKeySet,
} from '@datalayer/personal-agent-protocol';
import { describe, expect, it, vi } from 'vitest';
import { PapPersonalAgentCapability } from './index';

const company: DiscoveredCompany = {
  discoveryUrl: 'https://shop.example/.well-known/poppy.json',
  document: {
    protocol_version: '0.3',
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
    extensions: { operations: { version: '1' } },
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
  extensions: { memory: { version: '2' } },
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
    const capability = new PapPersonalAgentCapability({
      discover: vi.fn().mockResolvedValue(company),
    });

    const summary = await capability.discoverCompany('shop.example');

    expect(summary).toMatchObject({
      organization: 'Example Shop',
      signIn: ['direct'],
      scopes: { 'catalogue:read': 'Read the catalogue' },
      scopeHints: {
        'catalogue:read': { changes: 'none', personalData: false },
      },
      protectedResources: ['https://shop.example'],
      interfaces: ['agent:a2a', 'api:openapi'],
      extensions: { operations: '1' },
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
      extensions: { memory: '2' },
    });
    expect(JSON.stringify(summary)).not.toContain('x-coordinate');
    expect(JSON.stringify(summary)).not.toContain('y-coordinate');
  });
});
