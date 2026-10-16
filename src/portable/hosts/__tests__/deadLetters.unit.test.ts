/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * Dead letters and the durable queue's tables, under a host's prefix
 * (plans/DISCORD.md DC-004, DC-403): over a recording connection; Slack's
 * Postgres run, on a real database, covers the rest.
 */

import { describe, expect, it } from 'vitest';
import { DeadLetters, deadLetters, runDeadLettersCli } from '../deadLetters';
import { Logger } from '../observability';
import { PostgresWorkQueue } from '../postgresQueue';
import type { ConnectionPool, QueryAnswer } from '../queue';

function recording(answer: (text: string) => unknown[] = () => []) {
  const statements: string[] = [];
  const query = async (text: string): Promise<QueryAnswer<never>> => {
    statements.push(text.replace(/\s+/g, ' ').trim());
    const rows = answer(text) as never[];
    return { rows, rowCount: rows.length };
  };
  const pool: ConnectionPool = {
    connect: async () => ({ query, release: () => undefined }),
    query,
  };
  return { pool, statements };
}

describe("the queue's tables", () => {
  it("are the host's own, in every statement", async () => {
    const { pool, statements } = recording(text =>
      text.includes('RETURNING') ? [{ event_id: 'x' }] : [],
    );
    const queue = new PostgresWorkQueue<{ a: number }>(pool, 'discord');
    expect(await queue.enqueue({ a: 1 }, 'ix-1')).toBe(true);
    await queue.enqueue({ a: 2 });
    await queue.ready();
    await queue.replay('7', 'ops');
    await queue.payloadOf('7');
    await queue.dead();
    const tables = statements.flatMap(one =>
      [...one.matchAll(/(?:INTO|FROM|UPDATE) (\w+)/g)].map(match => match[1]),
    );
    expect(new Set(tables)).toEqual(
      new Set(['discord_event_claims', 'discord_jobs', 'discord_job_replays']),
    );
    expect(statements).toContain(
      'INSERT INTO discord_event_claims (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id',
    );
  });

  it('refuses a prefix that is not a table name', () => {
    expect(
      () => new PostgresWorkQueue(recording().pool, 'discord_jobs; --'),
    ).toThrow(/table prefix/);
  });
});

describe('dead letters', () => {
  const dead = [
    {
      attempts: 5,
      created_at: new Date('2026-10-16T00:00:00Z'),
      id: '7',
      kind: 'prompt',
      last_error: `failed with dlhk_${'k'.repeat(12)}`,
    },
  ];

  it('lists metadata and a hash, never the payload or a credential', async () => {
    const { pool } = recording(text =>
      text.includes('SELECT id::text')
        ? dead
        : text.includes('SELECT payload')
          ? [{ payload: { prompt: 'the words' } }]
          : [],
    );
    const [one] = await deadLetters(pool, 'discord').list();
    expect(one).toMatchObject({ id: '7', kind: 'prompt', attempts: 5 });
    expect(one?.lastError).toBe('failed with [redacted]');
    expect(one?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(one)).not.toContain('the words');
  });

  it("records a payload read in the host's table, with a reason, credentials still withheld", async () => {
    const { pool, statements } = recording(text =>
      text.includes('SELECT payload')
        ? [{ payload: { prompt: 'the words', bot_token: 'x' } }]
        : [],
    );
    const lines: string[] = [];
    const letters = new DeadLetters(
      pool,
      new PostgresWorkQueue<unknown>(pool, 'discord'),
      new Logger(line => lines.push(line)),
    );
    await expect(letters.payload('7', 'ops', 'short')).rejects.toThrow(
      /ten characters/,
    );
    expect(
      await letters.payload('7', 'ops', 'the user asked why it failed'),
    ).toEqual({ prompt: 'the words', bot_token: '[redacted]' });
    expect(statements.at(-1)).toBe(
      'INSERT INTO discord_payload_access (job_id, operator, reason) VALUES ($1, $2, $3)',
    );
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      event: 'payload.read',
      installation: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
  });

  it("runs the bin's commands, and refuses one without an operator or a known command", async () => {
    const { pool } = recording(text =>
      text.startsWith('UPDATE') ? [{ id: '7' }] : [],
    );
    const letters = deadLetters(pool, 'discord', new Logger(() => undefined));
    const said: string[] = [];
    const out = {
      error: (line: string) => said.push(`error: ${line}`),
      info: (line: string) => said.push(line),
      table: () => said.push('table'),
    };
    expect(await runDeadLettersCli(letters, ['replay', '7'], 'ops', out)).toBe(
      0,
    );
    expect(await runDeadLettersCli(letters, ['list'], 'ops', out)).toBe(0);
    expect(await runDeadLettersCli(letters, ['replay', '7'], ' ', out)).toBe(1);
    expect(await runDeadLettersCli(letters, ['drop'], 'ops', out)).toBe(1);
    expect(said).toEqual([
      'Job 7 is back to work.',
      'table',
      'error: DATALAYER_OPERATOR is required: the name kept with every replay and payload read.',
      'error: Usage: dead-letters list | replay <id> | payload <id> <reason>',
    ]);
  });
});
