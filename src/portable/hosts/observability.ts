/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createHash } from 'node:crypto';

/**
 * Logs, audit events and traces without secrets or words (SLACK §9, §12.2;
 * DISCORD §9, §12.2): every routine line is JSON whose fields pass `redact`;
 * host and Datalayer ids are pseudonymous (`pseudonym`), so a trace can be
 * followed `host event → job → installation hash → session → host message`
 * without naming an installation, a person or what they wrote. Moved from
 * the Slack service (plans/DISCORD.md DC-004).
 *
 * @module portable/hosts/observability
 */

/** Field names whose values are never logged: credentials, codes and words. */
const SECRET_NAME =
  /(token|secret|password|authorization|cookie|signature|^code$|_code$|host_?key|api_?key|private|^text$|^body$|prompt|message|markdown|arguments|payload|value)/i;

/**
 * Credentials by their shape, for every host at once (redacting another
 * host's shape too is never wrong): Slack's bot, user and app tokens,
 * Discord's bot tokens (`<base64 id>.<6>.<27+>`), Datalayer's host keys,
 * link and handoff codes, JWTs (which a Discord interaction token is not, so
 * it is named by its field), and bearer credentials.
 */
export const TOKEN_PATTERNS: readonly RegExp[] = [
  /xox[abprse]-[A-Za-z0-9-]{8,}/,
  /xapp-[A-Za-z0-9-]{8,}/,
  /[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}/,
  /dlh[kco]_[A-Za-z0-9_-]{8,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/,
];

/** Values that look like credentials wherever they appear. */
const SECRET_VALUE = new RegExp(
  `\\b(${TOKEN_PATTERNS.map(pattern => pattern.source).join('|')})`,
  'g',
);

export const REDACTED = '[redacted]';

/** A copy of a value with every secret field and credential-like string redacted. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === 'string') return value.replace(SECRET_VALUE, REDACTED);
  if (Array.isArray(value)) return value.map(one => redact(one, depth + 1));
  if (value instanceof Error)
    return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [name, one] of Object.entries(value))
      out[name] = SECRET_NAME.test(name) ? REDACTED : redact(one, depth + 1);
    return out;
  }
  return value;
}

/** Field names of credentials only: what even a privileged reader never sees. */
const CREDENTIAL_NAME =
  /(token|secret|password|authorization|cookie|signature|host_?key|api_?key|private_?key)/i;

/**
 * A copy with credentials redacted but words kept: what an audited,
 * privileged payload read shows (S-405).
 */
export function redactCredentials(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') return value.replace(SECRET_VALUE, REDACTED);
  if (Array.isArray(value))
    return value.map(one => redactCredentials(one, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [name, one] of Object.entries(value))
      out[name] = CREDENTIAL_NAME.test(name)
        ? REDACTED
        : redactCredentials(one, depth + 1);
    return out;
  }
  return value;
}

/**
 * A stable pseudonym of an id: the same id and salt, the same 16 hex
 * characters; never reversible. Each host salts with its own name.
 */
export function pseudonym(value: string, salt: string): string {
  return createHash('sha256')
    .update(`${salt}:${value}`)
    .digest('hex')
    .slice(0, 16);
}

export type LogSink = (line: string) => void;

/** A JSON logger whose every field is redacted. */
export class Logger {
  constructor(
    readonly sink: LogSink = line => process.stdout.write(`${line}\n`),
    readonly clock: () => Date = () => new Date(),
    /** What the audit's pseudonyms are salted with: the host's own. */
    readonly salt = 'datalayer-host',
  ) {}

  #write(level: string, event: string, fields: Record<string, unknown>): void {
    this.sink(
      JSON.stringify({
        at: this.clock().toISOString(),
        level,
        event,
        ...(redact(fields) as Record<string, unknown>),
      }),
    );
  }

  info(event: string, fields: Record<string, unknown> = {}): void {
    this.#write('info', event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}): void {
    this.#write('warn', event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    this.#write('error', event, fields);
  }

  /**
   * An identity audit event (SLACK S-103): who (pseudonymous), which installation
   * (its hash), what happened, why. Never a code, a token or a principal's
   * name.
   */
  audit(
    event:
      | 'identity.linked'
      | 'identity.unlinked'
      | 'identity.refused'
      | 'admin.changed'
      | 'payload.read',
    fields: {
      installation: string;
      /** The host user it is about. */
      user?: string;
      reason?: string;
      by?: string;
      [name: string]: unknown;
    },
  ): void {
    const { installation, user, by, ...rest } = fields;
    this.#write('audit', event, {
      ...rest,
      installation: pseudonym(installation, this.salt),
      ...(user ? { user: pseudonym(user, this.salt) } : {}),
      ...(by ? { by: pseudonym(by, this.salt) } : {}),
    });
  }
}

/** Tracing: one span per job, named by what it is, its ids pseudonymous. */
export interface Tracer {
  span<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    work: () => Promise<T>,
  ): Promise<T>;
}

/** No tracing: what tests and development use. */
export const noTracer: Tracer = {
  span: async (_name, _attributes, work) => work(),
};

/**
 * Spans as log lines with their duration and outcome, until the service runs
 * beside the plane's OTEL collector (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
 * the Datalayer convention); each host names its attributes
 * (`datalayer.slack.*`, `datalayer.discord.*`), pseudonymous by construction.
 */
export class LogTracer implements Tracer {
  constructor(
    readonly logger: Logger,
    readonly now: () => number = () => performance.now(),
  ) {}

  async span<T>(
    name: string,
    attributes: Record<string, string | number | boolean>,
    work: () => Promise<T>,
  ): Promise<T> {
    const started = this.now();
    try {
      const result = await work();
      this.logger.info('span', {
        name,
        ...attributes,
        duration_ms: Math.round(this.now() - started),
        outcome: 'ok',
      });
      return result;
    } catch (error) {
      this.logger.info('span', {
        name,
        ...attributes,
        duration_ms: Math.round(this.now() - started),
        outcome: 'error',
        error_name: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }
}
