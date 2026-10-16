/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** Logs without secrets or words (plans/DISCORD.md DC-004, §9). */

import { describe, expect, it } from 'vitest';
import {
  Logger,
  LogTracer,
  pseudonym,
  redact,
  redactCredentials,
  REDACTED,
} from '../observability';

// Built so that no secret scanner takes them for real credentials.
const slackBot = ['xoxb', '1234567890', 'abcdefghij'].join('-');
const discordBot = [
  'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ',
  'GaBcDe',
  'abcdefghijklmnopqrstuvwxyz0123',
].join('.');
const hostKey = `dlhk_${'k'.repeat(20)}`;
const handoff = `dlho_${'o'.repeat(20)}`;

describe('redact', () => {
  it("withholds every host's credential shapes, wherever they appear", () => {
    const said = redact(
      `slack ${slackBot} discord ${discordBot} key ${hostKey} open ${handoff} Bearer abcdefghijkl`,
    ) as string;
    for (const secret of [
      slackBot,
      discordBot,
      hostKey,
      handoff,
      'abcdefghijkl',
    ])
      expect(said).not.toContain(secret);
    expect(said.split(REDACTED).length).toBe(6);
  });

  it('withholds secret fields and words, and keeps ids', () => {
    expect(
      redact({
        token: 'x',
        interaction_token: 'y',
        prompt: 'the words',
        nested: { body: 'b', id: 'C1' },
        error: new Error(`failed with ${hostKey}`),
      }),
    ).toEqual({
      token: REDACTED,
      interaction_token: REDACTED,
      prompt: REDACTED,
      nested: { body: REDACTED, id: 'C1' },
      error: { name: 'Error', message: `failed with ${REDACTED}` },
    });
  });

  it('keeps words but not credentials for a privileged read', () => {
    expect(
      redactCredentials({ prompt: 'the words', bot_token: slackBot }),
    ).toEqual({ prompt: 'the words', bot_token: REDACTED });
  });
});

describe('pseudonym and the audit', () => {
  it('is stable for one salt, another for another salt', () => {
    expect(pseudonym('U1', 'datalayer-slack')).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudonym('U1', 'datalayer-slack')).toBe(
      pseudonym('U1', 'datalayer-slack'),
    );
    expect(pseudonym('U1', 'datalayer-discord')).not.toBe(
      pseudonym('U1', 'datalayer-slack'),
    );
  });

  it('audits who and where by pseudonym, never by name', () => {
    const lines: string[] = [];
    const logger = new Logger(
      line => lines.push(line),
      () => new Date('2026-10-16T00:00:00Z'),
      'datalayer-discord',
    );
    logger.audit('identity.linked', {
      installation: 'app:guild',
      user: '123456789',
      reason: 'linked',
      code: 'dlhc_secret-code',
    });
    const line = JSON.parse(lines[0] ?? '{}');
    expect(line).toMatchObject({
      level: 'audit',
      event: 'identity.linked',
      installation: pseudonym('app:guild', 'datalayer-discord'),
      user: pseudonym('123456789', 'datalayer-discord'),
      code: REDACTED,
    });
    expect(lines[0]).not.toContain('123456789');
  });

  it('traces a span with its outcome and duration', async () => {
    const lines: string[] = [];
    let now = 0;
    const tracer = new LogTracer(
      new Logger(line => lines.push(line)),
      () => (now += 5),
    );
    await tracer.span(
      'job',
      { 'datalayer.discord.kind': 'ask' },
      async () => 1,
    );
    await expect(
      tracer.span('job', {}, async () => {
        throw new TypeError('no');
      }),
    ).rejects.toThrow('no');
    expect(lines.map(line => JSON.parse(line).outcome)).toEqual([
      'ok',
      'error',
    ]);
    expect(JSON.parse(lines[0] ?? '{}').duration_ms).toBe(5);
  });
});
