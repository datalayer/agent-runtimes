/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** One host thread, one session uid (DC-004). */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostSessionUid } from '../sessionUid';

const discord = (
  JSON.parse(readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8')) as {
    discord: { session: { parts: string[]; uid: string } };
  }
).discord;

const sha = (key: string) =>
  createHash('sha256').update(key).digest('hex').slice(0, 40);

describe('hostSessionUid', () => {
  it("is Slack's uid, the same hash as before the move", () => {
    expect(hostSessionUid('slack', ['A1', '-', 'T1', 'C1', '1700.1'])).toBe(
      `slack-${sha('A1:-:T1:C1:1700.1')}`,
    );
    expect(hostSessionUid('slack', ['A1', '-', 'T1', 'C1', '1700.1'], 2)).toBe(
      `slack-${sha('A1:-:T1:C1:1700.1:2')}`,
    );
  });

  it('names a Discord thread by application, guild, channel and thread', () => {
    const uid = hostSessionUid('discord', ['app', 'guild', 'chan', 'thread']);
    expect(uid).toMatch(/^discord-[0-9a-f]{40}$/);
    // The session uid the session API accepts.
    expect(uid).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(hostSessionUid('discord', ['app', 'guild', 'chan', 'thread'])).toBe(
      uid,
    );
    expect(
      hostSessionUid('discord', ['app', 'guild', 'chan', 'thread'], 1),
    ).not.toBe(uid);
  });

  it("is the contract's Discord session uid (DC-006)", () => {
    expect(hostSessionUid('discord', discord.session.parts)).toBe(
      discord.session.uid,
    );
  });

  it('refuses a kind ai-agents would refuse, and an empty part', () => {
    expect(() => hostSessionUid('Discord', ['a'])).toThrow(/host kind/);
    expect(() => hostSessionUid('discord', [])).toThrow(/parts/);
    expect(() => hostSessionUid('discord', ['a', ''])).toThrow(/parts/);
  });
});
