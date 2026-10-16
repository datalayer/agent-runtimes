/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Liveness and readiness (SLACK §10, S-101; DISCORD §10): `/healthz` says the
 * process answers; `/readyz` says it can take durable work now — its store
 * and its queue answer — and never asks the host or Datalayer, so a
 * transient outage of either does not take the pods out of service: accepted
 * work waits in the queue instead. And the window a signed host request's
 * timestamp must fall in. Moved from the Slack service (plans/DISCORD.md
 * DC-004).
 *
 * @module portable/hosts/health
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

export type ReadinessChecks = Readonly<Record<string, () => Promise<boolean>>>;

/** Each check, at most `timeoutMs`: a check that throws or is late is not ready. */
export async function readiness(
  checks: ReadinessChecks,
  timeoutMs = 2_000,
): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};
  await Promise.all(
    Object.entries(checks).map(async ([name, check]) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        results[name] = await Promise.race([
          check(),
          new Promise<boolean>(resolve => {
            timer = setTimeout(() => resolve(false), timeoutMs);
          }),
        ]);
      } catch {
        results[name] = false;
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }),
  );
  return {
    checks: results,
    ready: Object.values(results).every(Boolean),
  };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

/** The health paths, and what each answers. */
export const HEALTH_PATHS = ['/healthz', '/readyz'] as const;

/**
 * Answer `GET /healthz` or `GET /readyz`; `false` for any other request,
 * which the caller answers.
 */
export function answerHealth(
  checks: ReadinessChecks,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const path = (request.url ?? '').split('?')[0];
  if (request.method !== 'GET') {
    return false;
  }
  if (path === '/healthz') {
    json(response, 200, { status: 'ok' });
    return true;
  }
  if (path === '/readyz') {
    void readiness(checks).then(answer =>
      json(response, answer.ready ? 200 : 503, answer),
    );
    return true;
  }
  return false;
}

/** A worker's own server: its health and readiness only (no host route). */
export function healthServer(checks: ReadinessChecks): Server {
  return createServer((request, response) => {
    if (!answerHealth(checks, request, response)) {
      response.writeHead(404);
      response.end();
    }
  });
}

/** How far a signed host request's timestamp may be from now, either way (SLACK §7.1, 1; DISCORD §7.1, 1). */
export const REQUEST_WINDOW_SECONDS = 5 * 60;

/**
 * Whether a request's timestamp header (Slack's `X-Slack-Request-Timestamp`,
 * Discord's `X-Signature-Timestamp`) is within five minutes of now, in the
 * past or the future: a replay with a skewed clock is refused too.
 */
export function timestampWithinWindow(
  header: string | string[] | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const value = Number(Array.isArray(header) ? header[0] : header);
  return (
    Number.isInteger(value) &&
    Math.abs(nowSeconds - value) <= REQUEST_WINDOW_SECONDS
  );
}
