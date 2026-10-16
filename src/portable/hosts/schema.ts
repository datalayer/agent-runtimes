/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The tables every host service keeps the same way, under its own prefix:
 * ingress claims and the work queue (`<prefix>_event_claims`,
 * `<prefix>_jobs`), quota counts (`<prefix>_usage`), privileged payload reads
 * (`<prefix>_payload_access`) and dead-job replays (`<prefix>_job_replays`).
 * Their final shapes, as idempotent statements: a service applies them
 * before its own migrations, every time. TypeScript strings, since the npm
 * tarball ships no `.sql`. Moved from the Slack service's migrations 001,
 * 004 and 007 (DC-004).
 *
 * @module portable/hosts/schema
 */

import { tablePrefixOf, type Queryable } from './queue';

/** The shared tables of one host, as one idempotent script. */
export function hostSchemaSql(tablePrefix: string): string {
  const p = tablePrefixOf(tablePrefix);
  return `BEGIN;

CREATE TABLE IF NOT EXISTS ${p}_event_claims (
  event_id text PRIMARY KEY,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ${p}_event_claims_claimed_at ON ${p}_event_claims (claimed_at);

CREATE TABLE IF NOT EXISTS ${p}_jobs (
  id bigserial PRIMARY KEY,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'processing', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ${p}_jobs_ready ON ${p}_jobs (state, available_at, id);

CREATE TABLE IF NOT EXISTS ${p}_usage (
  usage_key text NOT NULL,
  usage_window text NOT NULL,
  used integer NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_key, usage_window)
);

CREATE TABLE IF NOT EXISTS ${p}_payload_access (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL,
  operator text NOT NULL,
  reason text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ${p}_job_replays (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL,
  operator text NOT NULL,
  replayed boolean NOT NULL,
  replayed_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
`;
}

/** The tables `hostSchemaSql` makes, by name: what a test and an operator check. */
export function hostTables(tablePrefix: string): string[] {
  const p = tablePrefixOf(tablePrefix);
  return [
    `${p}_event_claims`,
    `${p}_jobs`,
    `${p}_usage`,
    `${p}_payload_access`,
    `${p}_job_replays`,
  ];
}

/** Apply the shared tables of one host: idempotent, before the service's own migrations. */
export async function applyHostSchema(
  database: Queryable,
  tablePrefix: string,
): Promise<void> {
  await database.query(hostSchemaSql(tablePrefix));
}
