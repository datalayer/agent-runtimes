/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The durable work queue on Postgres: jobs claimed with `FOR UPDATE SKIP
 * LOCKED`, leased and renewed while worked, retried with backoff, dead after
 * five attempts, an ingress claim and its job kept in one transaction. Its
 * tables are `<prefix>_jobs`, `<prefix>_event_claims` and
 * `<prefix>_job_replays` (`hostSchemaSql`). Moved from the Slack service
 * (DC-004).
 *
 * @module portable/hosts/postgresQueue
 */

import {
  tablePrefixOf,
  type ConnectionPool,
  type Queryable,
  type WorkQueue,
} from './queue';

type Job<T> = Readonly<{ attempts: number; id: string; payload: T }>;

export class PostgresWorkQueue<T> implements WorkQueue<T> {
  #handler?: (item: T) => Promise<void>;
  #loop?: Promise<void>;
  #stopping = false;

  readonly #jobs: string;
  readonly #claims: string;
  readonly #replays: string;

  constructor(
    readonly database: ConnectionPool,
    /** The host's table prefix: `slack`, `discord`. */
    readonly tablePrefix: string,
    readonly pollIntervalMs = 250,
    /**
     * How often a job being worked renews its lease (S-207): well within the
     * five minutes after which `reclaimAbandonedJobs` takes a job back, so
     * only a worker that died loses its job, not one answering a long turn.
     */
    readonly leaseRenewMs = 60_000,
  ) {
    const prefix = tablePrefixOf(tablePrefix);
    this.#jobs = `${prefix}_jobs`;
    this.#claims = `${prefix}_event_claims`;
    this.#replays = `${prefix}_job_replays`;
  }

  async enqueue(item: T, idempotencyKey?: string): Promise<boolean> {
    if (!idempotencyKey) {
      await this.database.query(
        `INSERT INTO ${this.#jobs} (payload) VALUES ($1)`,
        [item],
      );
      return true;
    }
    // The idempotency key and its job in one transaction.
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const claimed = await client.query(
        `INSERT INTO ${this.#claims} (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`,
        [`ingress:${idempotencyKey}`],
      );
      if (claimed.rowCount === 1)
        await client.query(`INSERT INTO ${this.#jobs} (payload) VALUES ($1)`, [
          item,
        ]);
      await client.query('COMMIT');
      return claimed.rowCount === 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ready(): Promise<boolean> {
    try {
      await this.database.query(`SELECT 1 FROM ${this.#jobs} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /** Jobs that failed five times, with their metadata only: what the dead-letter tool lists. */
  async dead(limit = 50): Promise<
    Array<{
      id: string;
      attempts: number;
      lastError: string | null;
      createdAt: string;
      kind: string;
    }>
  > {
    const result = await this.database.query<{
      attempts: number;
      created_at: Date;
      id: string;
      kind: string | null;
      last_error: string | null;
    }>(
      `SELECT id::text, attempts, last_error, created_at,
              CASE WHEN payload ? 'delivery' THEN 'delivery'
                   WHEN payload ? 'prompt' THEN 'prompt'
                   ELSE 'other' END AS kind
       FROM ${this.#jobs} WHERE state = 'dead' ORDER BY id LIMIT $1`,
      [limit],
    );
    return result.rows.map(row => ({
      attempts: row.attempts,
      createdAt: new Date(row.created_at).toISOString(),
      id: row.id,
      kind: row.kind ?? 'other',
      lastError: row.last_error,
    }));
  }

  /**
   * Put a dead job back to work: once, by id, the replay kept with who asked
   * in the same transaction (`<prefix>_job_replays`, SLACK S-405), refused or not.
   */
  async replay(id: string, operator: string): Promise<boolean> {
    if (!/^\d+$/.test(id)) return false;
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE ${this.#jobs} SET state = 'ready', attempts = 0, available_at = now(), last_error = NULL WHERE id = $1 AND state = 'dead'`,
        [id],
      );
      const replayed = result.rowCount === 1;
      await client.query(
        `INSERT INTO ${this.#replays} (job_id, operator, replayed) VALUES ($1, $2, $3)`,
        [id, operator, replayed],
      );
      await client.query('COMMIT');
      return replayed;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * A dead job's payload, and only a dead one's (S-405): a live job, or an id
   * that is no job, has none to read here.
   */
  async payloadOf(id: string): Promise<unknown> {
    if (!/^\d+$/.test(id)) return undefined;
    const result = await this.database.query<{ payload: unknown }>(
      `SELECT payload FROM ${this.#jobs} WHERE id = $1 AND state = 'dead'`,
      [id],
    );
    return result.rows[0]?.payload;
  }

  start(handler: (item: T) => Promise<void>): void {
    if (this.#loop)
      throw new Error('The PostgreSQL work queue has already started.');
    this.#handler = handler;
    this.#stopping = false;
    this.#loop = this.#run();
  }

  async stop(): Promise<void> {
    this.#stopping = true;
    await this.#loop;
    this.#loop = undefined;
    this.#handler = undefined;
  }

  async #run(): Promise<void> {
    while (!this.#stopping) {
      const job = await this.#claim();
      if (!job) {
        await delay(this.pollIntervalMs);
        continue;
      }
      const lease: ReturnType<typeof setInterval> = setInterval(() => {
        void this.database
          .query(
            `UPDATE ${this.#jobs} SET locked_at = now() WHERE id = $1 AND state = 'processing'`,
            [job.id],
          )
          .catch(() => undefined); // the next renewal, or the reclaim, decides
      }, this.leaseRenewMs);
      (lease as { unref?: () => void }).unref?.();
      try {
        await this.#handler?.(job.payload);
        await this.database.query(`DELETE FROM ${this.#jobs} WHERE id = $1`, [
          job.id,
        ]);
      } catch (error) {
        await this.#fail(job, error);
      } finally {
        clearInterval(lease);
      }
    }
  }

  async #claim(): Promise<Job<T> | undefined> {
    const client = await this.database.connect();
    try {
      await client.query('BEGIN');
      await reclaimAbandonedJobs(client, this.#jobs);
      const selected = await client.query<Job<T>>(
        `SELECT id::text, payload, attempts
         FROM ${this.#jobs}
         WHERE state = 'ready' AND available_at <= now()
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
      );
      const job = selected.rows[0];
      if (!job) {
        await client.query('COMMIT');
        return undefined;
      }
      await client.query(
        `UPDATE ${this.#jobs}
         SET state = 'processing', attempts = attempts + 1, locked_at = now()
         WHERE id = $1`,
        [job.id],
      );
      await client.query('COMMIT');
      return { ...job, attempts: job.attempts + 1 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async #fail(job: Job<T>, error: unknown): Promise<void> {
    const message =
      error instanceof Error ? error.message : 'Unknown worker failure';
    if (job.attempts >= 5) {
      await this.database.query(
        `UPDATE ${this.#jobs} SET state = 'dead', last_error = $2, locked_at = NULL WHERE id = $1`,
        [job.id, message.slice(0, 2_000)],
      );
      return;
    }
    const delaySeconds = Math.min(300, 2 ** job.attempts);
    await this.database.query(
      `UPDATE ${this.#jobs}
       SET state = 'ready', available_at = now() + ($2 * interval '1 second'),
           last_error = $3, locked_at = NULL
       WHERE id = $1`,
      [job.id, delaySeconds, message.slice(0, 2_000)],
    );
  }
}

async function reclaimAbandonedJobs(
  client: Queryable,
  jobs: string,
): Promise<void> {
  await client.query(
    `UPDATE ${jobs}
     SET state = 'ready', available_at = now(), locked_at = NULL,
         last_error = 'Worker lease expired'
     WHERE state = 'processing' AND locked_at < now() - interval '5 minutes'`,
  );
}

const delay = async (milliseconds: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, milliseconds));
