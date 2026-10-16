/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A host's durable work queue, its in-memory development stand-in, and the
 * structural Postgres connection every Postgres implementation here takes
 * (`pg.Pool` and `pg.PoolClient` satisfy it: no `pg` import). Moved from the
 * Slack service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/queue
 */

/** What a query answers: its rows, and how many it changed. */
export type QueryAnswer<R> = { rows: R[]; rowCount: number | null };

/** A Postgres connection as the hosts code uses it: `pg.Pool` or `pg.PoolClient`. */
export interface Queryable {
  query<R extends { [column: string]: any } = any>(
    text: string,
    values?: any[],
  ): Promise<QueryAnswer<R>>;
}

/** A pool of connections, one taken for a transaction: `pg.Pool`. */
export interface ConnectionPool extends Queryable {
  connect(): Promise<Queryable & { release(): void }>;
}

/** A table prefix a host's tables carry (`slack`, `discord`): lowercase letters and digits. */
export function tablePrefixOf(prefix: string): string {
  if (!/^[a-z][a-z0-9]{1,31}$/.test(prefix)) {
    throw new Error(
      `A table prefix is lowercase letters and digits, a letter first: ${prefix}.`,
    );
  }
  return prefix;
}

export interface WorkQueue<T> {
  /**
   * Persist one job. With an idempotency key (a host event or action id),
   * the key and the job are kept in one transaction and a second job under
   * the same key is not enqueued: `false`.
   */
  enqueue(item: T, idempotencyKey?: string): Promise<boolean>;
  /** Whether the queue can take durable work now: what readiness reports. */
  ready(): Promise<boolean>;
  start(handler: (item: T) => Promise<void>): void;
  stop(): Promise<void>;
}

/** In-process development queue. A durable adapter is required in production. */
export class MemoryWorkQueue<T> implements WorkQueue<T> {
  readonly #items: T[] = [];
  readonly #keys = new Set<string>();
  #handler?: (item: T) => Promise<void>;
  #running = false;

  async enqueue(item: T, idempotencyKey?: string): Promise<boolean> {
    if (idempotencyKey) {
      if (this.#keys.has(idempotencyKey)) {
        return false;
      }
      this.#keys.add(idempotencyKey);
    }
    this.#items.push(item);
    queueMicrotask(() => void this.#drain());
    return true;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  start(handler: (item: T) => Promise<void>): void {
    this.#handler = handler;
    void this.#drain();
  }

  async stop(): Promise<void> {
    this.#handler = undefined;
    while (this.#running) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  async #drain(): Promise<void> {
    if (this.#running || !this.#handler) {
      return;
    }
    this.#running = true;
    try {
      while (this.#items.length > 0) {
        const handler = this.#handler;
        if (!handler) {
          break;
        }
        const item = this.#items.shift();
        if (item !== undefined) {
          await handler(item);
        }
      }
    } finally {
      this.#running = false;
    }
  }
}
