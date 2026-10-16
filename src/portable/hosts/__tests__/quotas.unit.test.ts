/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * Quotas before costly work (plans/DISCORD.md DC-004, DC-402): the rules,
 * the memory store, and what the Postgres store asks of its connection
 * (Slack's Postgres run, on a real database, covers the rest).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUOTAS,
  MemoryQuotaStore,
  PostgresQuotaStore,
  quotaEntries,
  quotaWords,
  resetOf,
  windowOf,
} from '../quotas';
import type { ConnectionPool, QueryAnswer } from '../queue';

const turn = {
  applicationId: 'dep-1',
  externalUserId: 'U1',
  installation: 'A1:-:T1',
  organizationId: 'org-1',
};

describe('quota rules', () => {
  it("counts a turn against the person, the installation (by the host's key prefix), the organization and the application", () => {
    expect(quotaEntries(DEFAULT_QUOTAS, turn, 'workspace')).toEqual([
      { key: 'user:A1:-:T1:U1', limit: 60, scope: 'user' },
      { key: 'workspace:A1:-:T1', limit: 600, scope: 'installation' },
      { key: 'organization:org-1', limit: 2000, scope: 'organization' },
      { key: 'application:dep-1', limit: 600, scope: 'application' },
    ]);
    expect(
      quotaEntries(DEFAULT_QUOTAS, { ...turn, organizationId: undefined }).map(
        one => one.key,
      ),
    ).toEqual(['user:A1:-:T1:U1', 'installation:A1:-:T1', 'application:dep-1']);
  });

  it('keeps counts by the hour, and says when one resets in the host’s words', () => {
    const now = new Date('2026-10-16T10:42:00Z');
    expect(windowOf(now)).toBe('2026-10-16T10');
    expect(resetOf(now).toISOString()).toBe('2026-10-16T11:00:00.000Z');
    expect(
      quotaWords(
        {
          ok: false,
          limit: 600,
          resetsAt: resetOf(now),
          scope: 'installation',
        },
        'this server',
      ),
    ).toBe(
      '@Datalayer has answered 600 questions this hour for this server, its limit. Ask again after 11:00 UTC.',
    );
  });
});

describe('MemoryQuotaStore', () => {
  it('takes all or none, refusing the spent entry by name', async () => {
    const store = new MemoryQuotaStore();
    const entries = quotaEntries({ ...DEFAULT_QUOTAS, user: 2 }, turn);
    expect(await store.takeQuota(entries, 'w')).toEqual({ ok: true });
    expect(await store.takeQuota(entries, 'w')).toEqual({ ok: true });
    const third = await store.takeQuota(entries, 'w');
    expect(third).toMatchObject({ ok: false, entry: { scope: 'user' } });
    // A refusal takes nothing: the application was not counted a third time.
    expect(await store.quotaUsed('application:dep-1', 'w')).toBe(2);
    expect(await store.takeQuota(entries, 'next')).toEqual({ ok: true });
  });
});

describe('PostgresQuotaStore', () => {
  it('locks in a stable order, and rolls back a refusal', async () => {
    const statements: string[] = [];
    const client = {
      query: async (text: string): Promise<QueryAnswer<never>> => {
        statements.push(text.replace(/\s+/g, ' ').trim());
        return {
          rows: text.includes('SELECT usage_key')
            ? ([{ usage_key: 'user:x', used: 1 }] as never[])
            : [],
          rowCount: 0,
        };
      },
      release: () => undefined,
    };
    const pool: ConnectionPool = {
      connect: async () => client,
      query: client.query,
    };
    const store = new PostgresQuotaStore(pool, { tablePrefix: 'discord' });
    const taken = await store.takeQuota(
      [
        { key: 'user:x', limit: 1, scope: 'user' },
        { key: 'application:a', limit: 5, scope: 'application' },
      ],
      'w',
    );
    expect(taken).toMatchObject({ ok: false, entry: { key: 'user:x' } });
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toContain('INSERT INTO discord_usage');
    expect(statements.at(-1)).toBe('ROLLBACK');
    expect(statements.some(one => one.startsWith('UPDATE'))).toBe(false);
    expect(() => new PostgresQuotaStore(pool, { tablePrefix: 'x;' })).toThrow();
  });
});
