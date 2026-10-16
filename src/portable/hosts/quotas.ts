/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Quotas before costly work (SLACK §9, S-404; DISCORD DC-402): questions an
 * hour per person, installation (a Slack workspace, a Discord server),
 * organization and application, taken atomically before a turn starts at
 * Datalayer. A refusal says which limit and when it resets. Moved from the
 * Slack service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/quotas
 */

import { tablePrefixOf, type ConnectionPool, type Queryable } from './queue';

export type QuotaScope =
  'user' | 'installation' | 'organization' | 'application';

export type QuotaLimits = Readonly<Record<QuotaScope, number>>;

export const DEFAULT_QUOTAS: QuotaLimits = {
  application: 600,
  installation: 600,
  organization: 2_000,
  user: 60,
};

export type QuotaEntry = Readonly<{
  scope: QuotaScope;
  key: string;
  limit: number;
}>;

export type QuotaTaken =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; scope: QuotaScope; limit: number; resetsAt: Date }>;

/** The hour a moment falls in: the period counts are kept by. */
export function windowOf(now: Date): string {
  return now.toISOString().slice(0, 13);
}

export function resetOf(now: Date): Date {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

/** A person's quota key in an installation: what their usage line reads. */
export function userQuotaKey(
  installation: string,
  externalUserId: string,
): string {
  return `user:${installation}:${externalUserId}`;
}

/**
 * What each quota counts, for one turn. `keyPrefix` names the installation's
 * key (`installation:<id>` by default; Slack keeps `workspace:<id>`, the keys
 * its counts were kept under).
 */
export function quotaEntries(
  limits: QuotaLimits,
  turn: {
    installation: string;
    externalUserId: string;
    applicationId: string;
    organizationId?: string;
  },
  keyPrefix = 'installation',
): QuotaEntry[] {
  return [
    {
      key: userQuotaKey(turn.installation, turn.externalUserId),
      limit: limits.user,
      scope: 'user',
    },
    {
      key: `${keyPrefix}:${turn.installation}`,
      limit: limits.installation,
      scope: 'installation',
    },
    ...(turn.organizationId
      ? [
          {
            key: `organization:${turn.organizationId}`,
            limit: limits.organization,
            scope: 'organization' as const,
          },
        ]
      : []),
    {
      key: `application:${turn.applicationId}`,
      limit: limits.application,
      scope: 'application',
    },
  ];
}

/**
 * Words for a refusal, said privately. `installation` names the host's
 * installation as its people say it: "this workspace", "this server".
 */
export function quotaWords(
  taken: Extract<QuotaTaken, { ok: false }>,
  installation: string,
): string {
  const whose: Record<QuotaScope, string> = {
    application: 'this application',
    installation,
    organization: 'your organization',
    user: 'you',
  };
  const at = taken.resetsAt.toISOString().slice(11, 16);
  return `@Datalayer has answered ${taken.limit} questions this hour for ${whose[taken.scope]}, its limit. Ask again after ${at} UTC.`;
}

export type QuotaTake =
  Readonly<{ ok: true }> | Readonly<{ ok: false; entry: QuotaEntry }>;

/** Where quota counts are kept. */
export interface QuotaStore {
  /**
   * Take one of each quota for a period, all or none (S-404): refused when
   * any is spent, naming it.
   */
  takeQuota(entries: readonly QuotaEntry[], period: string): Promise<QuotaTake>;
  /** How much of a quota is used in a period. */
  quotaUsed(key: string, period: string): Promise<number>;
}

/** Counts in memory: development and tests. */
export class MemoryQuotaStore implements QuotaStore {
  readonly #usage = new Map<string, number>();

  async takeQuota(
    entries: readonly QuotaEntry[],
    period: string,
  ): Promise<QuotaTake> {
    const spent = entries.find(
      entry => (this.#usage.get(`${period}:${entry.key}`) ?? 0) >= entry.limit,
    );
    if (spent) {
      return { entry: spent, ok: false };
    }
    for (const entry of entries) {
      this.#usage.set(
        `${period}:${entry.key}`,
        (this.#usage.get(`${period}:${entry.key}`) ?? 0) + 1,
      );
    }
    return { ok: true };
  }

  async quotaUsed(key: string, period: string): Promise<number> {
    return this.#usage.get(`${period}:${key}`) ?? 0;
  }
}

/** Counts in `<prefix>_usage`, taken in one transaction, rows locked in a stable order. */
export class PostgresQuotaStore implements QuotaStore {
  readonly #usage: string;

  constructor(
    readonly database: ConnectionPool,
    options: { tablePrefix: string },
  ) {
    this.#usage = `${tablePrefixOf(options.tablePrefix)}_usage`;
  }

  async takeQuota(
    entries: readonly QuotaEntry[],
    period: string,
  ): Promise<QuotaTake> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const taken = await this.#take(client, entries, period);
      await client.query(taken.ok ? 'COMMIT' : 'ROLLBACK');
      return taken;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async #take(
    client: Queryable,
    entries: readonly QuotaEntry[],
    period: string,
  ): Promise<QuotaTake> {
    // Rows locked in a stable order: two turns never deadlock on them.
    const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
    for (const entry of sorted) {
      await client.query(
        `INSERT INTO ${this.#usage} (usage_key, usage_window, used) VALUES ($1, $2, 0)
         ON CONFLICT (usage_key, usage_window) DO NOTHING`,
        [entry.key, period],
      );
    }
    const keys = sorted.map(entry => entry.key);
    const used = await client.query<{ usage_key: string; used: number }>(
      `SELECT usage_key, used FROM ${this.#usage}
       WHERE usage_window = $1 AND usage_key = ANY($2::text[])
       ORDER BY usage_key FOR UPDATE`,
      [period, keys],
    );
    const counts = new Map(used.rows.map(row => [row.usage_key, row.used]));
    const spent = entries.find(
      entry => (counts.get(entry.key) ?? 0) >= entry.limit,
    );
    if (spent) {
      return { entry: spent, ok: false };
    }
    await client.query(
      `UPDATE ${this.#usage} SET used = used + 1
       WHERE usage_window = $1 AND usage_key = ANY($2::text[])`,
      [period, keys],
    );
    return { ok: true };
  }

  async quotaUsed(key: string, period: string): Promise<number> {
    const result = await this.database.query<{ used: number }>(
      `SELECT used FROM ${this.#usage} WHERE usage_key = $1 AND usage_window = $2`,
      [key, period],
    );
    return result.rows[0]?.used ?? 0;
  }
}
