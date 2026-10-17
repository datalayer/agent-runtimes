/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** The shared tables, under each host's prefix (DC-004). */

import { describe, expect, it, vi } from 'vitest';
import { applyHostSchema, hostSchemaSql, hostTables } from '../schema';

describe('hostSchemaSql', () => {
  it("creates only the prefix's tables and indexes, all IF NOT EXISTS", () => {
    const sql = hostSchemaSql('x1');
    const created = [
      ...sql.matchAll(/CREATE (?:TABLE|INDEX) (IF NOT EXISTS )?(\w+)/g),
    ];
    expect(created.length).toBe(7);
    for (const [statement, ifNotExists, name] of created) {
      expect(ifNotExists, statement).toBe('IF NOT EXISTS ');
      expect(name, statement).toMatch(/^x1_/);
    }
    expect(
      created
        .map(one => one[2])
        .filter(name => !/_ready$|_claimed_at$/.test(name ?? '')),
    ).toEqual(hostTables('x1'));
    // Every table it names, in any statement, is the prefix's own.
    for (const [, name] of sql.matchAll(/(?:ON|TABLE IF NOT EXISTS) (\w+)/g))
      expect(name).toMatch(/^x1_/);
    expect(sql.startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('names the five shared tables', () => {
    expect(hostTables('discord')).toEqual([
      'discord_event_claims',
      'discord_jobs',
      'discord_usage',
      'discord_payload_access',
      'discord_job_replays',
    ]);
  });

  it('refuses a prefix that is not a table name', () => {
    expect(() => hostSchemaSql('slack; DROP TABLE x')).toThrow(/table prefix/);
  });

  it('applies the script as one query', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: null }));
    await applyHostSchema({ query }, 'discord');
    expect(query).toHaveBeenCalledWith(hostSchemaSql('discord'));
  });
});
