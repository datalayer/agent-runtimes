/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A new session's uid is a ULID, wherever it is minted: a chat's thread is
 * its session, and the adapter names a thread nobody named.
 */

import { describe, expect, it } from 'vitest';
import { generateSessionUid } from '../../types/messages';

const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

describe('a new session’s uid', () => {
  it('is a ULID: 26 characters of Crockford’s base32', () => {
    const uid = generateSessionUid();
    expect(uid).toMatch(ULID);
    expect(uid).toHaveLength(26);
    expect(generateSessionUid()).not.toBe(uid);
  });

  it('says when it was minted, so uids sort by time', () => {
    const stamp = [...generateSessionUid().slice(0, 10)].reduce(
      (value, letter) => value * 32 + ALPHABET.indexOf(letter),
      0,
    );
    expect(Math.abs(stamp - Date.now())).toBeLessThan(5000);
  });

  it('is a session uid as the record takes one, like those minted before', () => {
    const SESSION_UID = /^[A-Za-z0-9_-]{8,128}$/;
    for (const uid of [
      generateSessionUid(),
      'f857341db67348c798f4c1f91a8a8145',
      '79787ffc-4685-4915-b511-23b9b9c3525d',
      'whatsapp-0a1b2c3d',
    ]) {
      expect(uid).toMatch(SESSION_UID);
    }
  });
});
