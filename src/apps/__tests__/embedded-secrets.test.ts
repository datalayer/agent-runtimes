/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * No file of the embed holds a secret (B-02): what the build
 * refuses (`vite.embed.config.ts`, `embedSecrets`), and that nothing of the
 * environment it is built in enters it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { secretsIn } from '../embed/embeddedSecrets';

const config = readFileSync(
  join(__dirname, '..', '..', '..', 'vite.embed.config.ts'),
  'utf8',
);

/** Made here, of the shapes the build refuses; none is a credential. */
const segment = (n: number) => 'A'.repeat(n);
const jwt = `eyJ${segment(12)}.eyJ${segment(12)}.${segment(12)}`;

describe('the embed’s secrets', () => {
  it('finds each kind of secret the PAP SDK’s bundle test finds, by name', () => {
    expect(
      secretsIn(`({BASE_URL:"./",VITE_DATALAYER_API_KEY:"${jwt}"})`),
    ).toEqual(['a compact JWT']);
    expect(secretsIn(`-----BEGIN PRIVATE KEY-----\n${segment(64)}`)).toEqual([
      'a PEM private key',
    ]);
    expect(secretsIn(`{"kty":"EC","d":"${segment(43)}"}`)).toEqual([
      'a private JWK member',
    ]);
    expect(
      secretsIn(`headers:{Authorization:"Bearer ${segment(24)}"}`),
    ).toEqual(['a Bearer or DPoP token']);
  });

  it('leaves the code that sends a token, and a library naming a key header, alone', () => {
    expect(secretsIn('headers:{Authorization:`Bearer ${token}`}')).toEqual([]);
    expect(
      secretsIn('if(pem.includes("-----BEGIN PRIVATE KEY-----"))throw e'),
    ).toEqual([]);
    expect(secretsIn('const d = jwk.d; // "d": the private member')).toEqual(
      [],
    );
  });

  it('is checked on every file the build writes, and the environment stays out', () => {
    expect(config).toContain("envPrefix: 'DATALAYER_EMBED_'");
    expect(config).toContain('embedSecrets(),');
    expect(config).toMatch(
      /secretsIn\(text\)\.map\(kind => `\$\{kind\} in \$\{file\.fileName\}`\)/,
    );
  });
});
