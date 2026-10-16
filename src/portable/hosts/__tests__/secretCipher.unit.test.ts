/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** Secrets at rest (plans/DISCORD.md DC-004; ported from the Slack service). */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretCipher } from '../secretCipher';

describe('SecretCipher', () => {
  it('round-trips a token without storing plaintext', () => {
    const cipher = new SecretCipher(randomBytes(32).toString('base64'), 3);
    const encrypted = cipher.encrypt('host-secret-value', 'A1:-:T1');
    expect(JSON.stringify(encrypted)).not.toContain('host-secret-value');
    expect(encrypted.keyVersion).toBe(3);
    expect(cipher.decrypt(encrypted, 'A1:-:T1')).toBe('host-secret-value');
  });

  it('binds ciphertext to its installation, and to its key version', () => {
    const key = randomBytes(32).toString('base64');
    const cipher = new SecretCipher(key, 1);
    const encrypted = cipher.encrypt('token', 'A1:-:T1');
    expect(() => cipher.decrypt(encrypted, 'A1:-:T2')).toThrow();
    expect(() =>
      new SecretCipher(key, 2).decrypt(encrypted, 'A1:-:T1'),
    ).toThrow(/version 1/);
  });

  it('refuses key material that is not 32 bytes, naming its setting', () => {
    expect(() => new SecretCipher('not-a-32-byte-key', 1)).toThrow(
      /32-byte key/,
    );
    expect(
      () => new SecretCipher('short', 1, 'DISCORD_TOKEN_ENCRYPTION_KEY'),
    ).toThrow(/^DISCORD_TOKEN_ENCRYPTION_KEY must be/);
  });
});
