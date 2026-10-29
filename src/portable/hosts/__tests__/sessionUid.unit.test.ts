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

type Session = { parts: string[]; uid: string };
const contracts = JSON.parse(
  readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8'),
) as {
  discord: { session: Session };
  whatsapp: {
    waba_id: string;
    phone_number_id: string;
    external_user_id: string;
    external_user_id_longest: string;
    group: { id: string };
    session: Session;
    group_session: Session;
  };
};
const { discord, whatsapp } = contracts;

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

  it("is the contract's WhatsApp session uids: a chat by its BSUID, a group by its id", () => {
    const { waba_id, phone_number_id } = whatsapp;
    expect(whatsapp.session.parts).toEqual([
      waba_id,
      phone_number_id,
      whatsapp.external_user_id,
    ]);
    expect(whatsapp.group_session.parts).toEqual([
      waba_id,
      phone_number_id,
      whatsapp.group.id,
    ]);
    expect(hostSessionUid('whatsapp', whatsapp.session.parts)).toBe(
      whatsapp.session.uid,
    );
    expect(hostSessionUid('whatsapp', whatsapp.group_session.parts)).toBe(
      whatsapp.group_session.uid,
    );
    // The longest BSUID still gives a uid the session API accepts.
    expect(
      hostSessionUid('whatsapp', [
        waba_id,
        phone_number_id,
        whatsapp.external_user_id_longest,
      ]),
    ).toMatch(/^whatsapp-[0-9a-f]{40}$/);
    // Start over: a new generation, a new session.
    expect(hostSessionUid('whatsapp', whatsapp.session.parts, 1)).not.toBe(
      whatsapp.session.uid,
    );
  });

  it('refuses a kind ai-agents would refuse, and an empty part', () => {
    expect(() => hostSessionUid('Discord', ['a'])).toThrow(/host kind/);
    expect(() => hostSessionUid('discord', [])).toThrow(/parts/);
    expect(() => hostSessionUid('discord', ['a', ''])).toThrow(/parts/);
  });
});
