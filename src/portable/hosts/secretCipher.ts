/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Secrets at rest (SLACK §9, DISCORD §9): AES-256-GCM, each value bound to
 * what it belongs to (its associated data, an installation's key), with the
 * key's version kept beside it. Moved from the Slack service
 * (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/secretCipher
 */

export type EncryptedSecret = Readonly<{
  ciphertext: string;
  iv: string;
  keyVersion: number;
  tag: string;
}>;

export class SecretCipher {
  readonly #key: Buffer;

  constructor(
    keyBase64: string,
    readonly keyVersion: number,
    /** The setting the key is read from, named when it is refused. */
    keyName = 'The encryption key',
  ) {
    this.#key = Buffer.from(keyBase64, 'base64');
    if (this.#key.length !== 32) {
      throw new Error(`${keyName} must be a base64-encoded 32-byte key.`);
    }
  }

  encrypt(value: string, associatedData: string): EncryptedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(Buffer.from(associatedData));
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      keyVersion: this.keyVersion,
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret, associatedData: string): string {
    if (secret.keyVersion !== this.keyVersion) {
      throw new Error(
        `No decryption key is configured for version ${secret.keyVersion}.`,
      );
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.#key,
      Buffer.from(secret.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(associatedData));
    decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
