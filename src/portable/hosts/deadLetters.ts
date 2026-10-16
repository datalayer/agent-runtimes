/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Dead letters (S-405, DC-403): jobs that failed five
 * times. By default an operator sees their metadata and a hash of their
 * payload — never the words of a prompt or a delivery. Replaying puts one
 * back to work, once. Reading a payload is privileged: a dead job's only, it
 * needs a reason, is recorded in `<prefix>_payload_access` and audited, and
 * its credentials are still redacted. Every replay is kept in
 * `<prefix>_job_replays` with who asked. Moved from the Slack service
 * (DC-004); each service keeps only the bin that opens its
 * database and calls `runDeadLettersCli`.
 *
 * @module portable/hosts/deadLetters
 */

import { createHash } from 'node:crypto';

import { Logger, redact, redactCredentials } from './observability';
import { PostgresWorkQueue } from './postgresQueue';
import { tablePrefixOf, type ConnectionPool } from './queue';

export type DeadLetter = Readonly<{
  id: string;
  kind: string;
  attempts: number;
  createdAt: string;
  /** The last error, redacted: a credential in an error message is not shown. */
  lastError: string;
  /** sha256 of the payload: tells two jobs apart without showing either. */
  payloadHash: string;
}>;

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export class DeadLetters {
  readonly #access: string;
  readonly #queueName: string;

  constructor(
    readonly database: ConnectionPool,
    readonly queue: PostgresWorkQueue<unknown>,
    readonly logger: Logger = new Logger(),
  ) {
    const prefix = tablePrefixOf(queue.tablePrefix);
    this.#access = `${prefix}_payload_access`;
    this.#queueName = `${prefix}-queue`;
  }

  async list(limit = 50): Promise<DeadLetter[]> {
    const dead = await this.queue.dead(limit);
    return Promise.all(
      dead.map(async one => ({
        attempts: one.attempts,
        createdAt: one.createdAt,
        id: one.id,
        kind: one.kind,
        lastError: String(redact(one.lastError ?? '')),
        payloadHash: payloadHash(await this.queue.payloadOf(one.id)),
      })),
    );
  }

  async replay(id: string, operator: string): Promise<boolean> {
    if (!operator.trim()) {
      throw new Error('Name who replays the job.');
    }
    const replayed = await this.queue.replay(id, operator);
    this.logger.audit('admin.changed', {
      by: operator,
      installation: this.#queueName,
      job: id,
      reason: replayed ? 'dead job replayed' : 'not a dead job',
    });
    return replayed;
  }

  /** A payload, for a stated reason, recorded and audited; secrets still redacted. */
  async payload(
    id: string,
    operator: string,
    reason: string,
  ): Promise<unknown> {
    if (reason.trim().length < 10) {
      throw new Error('Say why the payload is read: ten characters at least.');
    }
    if (!operator.trim()) {
      throw new Error('Name who reads the payload.');
    }
    // A dead job's only: a live job or an unknown id is refused, and no read
    // of it is recorded.
    const payload = await this.queue.payloadOf(id);
    if (payload === undefined) {
      throw new Error(
        `Job ${id} is not a dead job: there is no payload to read.`,
      );
    }
    await this.database.query(
      `INSERT INTO ${this.#access} (job_id, operator, reason) VALUES ($1, $2, $3)`,
      [id, operator, reason.slice(0, 1_000)],
    );
    this.logger.audit('payload.read', {
      by: operator,
      installation: this.#queueName,
      job: id,
      reason: 'privileged payload access',
    });
    return redactCredentials(payload);
  }
}

/** The dead letters of a host's queue (`<prefix>_jobs`). */
export function deadLetters(
  database: ConnectionPool,
  tablePrefix: string,
  logger?: Logger,
): DeadLetters {
  return new DeadLetters(
    database,
    new PostgresWorkQueue<unknown>(database, tablePrefix),
    logger,
  );
}

/** What the dead-letters bin prints or says, and its exit code. */
export type CliOutput = {
  table: (rows: unknown) => void;
  info: (line: string) => void;
  error: (line: string) => void;
};

export const DEAD_LETTERS_USAGE =
  'Usage: dead-letters list | replay <id> | payload <id> <reason>';

/**
 * `dead-letters list | replay <id> | payload <id> <reason…>`: metadata and
 * hashes by default (S-405). Who acts is said in `operator`
 * (`DATALAYER_OPERATOR`), never taken from the container's user: a replay
 * and a payload read are kept with this name. Answers the exit code.
 */
export async function runDeadLettersCli(
  letters: DeadLetters,
  argv: readonly string[],
  operator: string,
  out: CliOutput = {
    table: rows => console.table(rows),
    info: line => console.info(line),
    error: line => console.error(line),
  },
): Promise<number> {
  const [command, id, ...rest] = argv;
  if (!operator.trim()) {
    out.error(
      'DATALAYER_OPERATOR is required: the name kept with every replay and payload read.',
    );
    return 1;
  }
  if (command === 'list') {
    out.table(await letters.list());
    return 0;
  }
  if (command === 'replay' && id) {
    out.info(
      (await letters.replay(id, operator))
        ? `Job ${id} is back to work.`
        : `Job ${id} is not a dead job.`,
    );
    return 0;
  }
  if (command === 'payload' && id) {
    out.info(
      JSON.stringify(
        await letters.payload(id, operator, rest.join(' ')),
        null,
        2,
      ),
    );
    return 0;
  }
  out.error(DEAD_LETTERS_USAGE);
  return 1;
}
