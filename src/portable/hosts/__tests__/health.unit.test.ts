/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/** Liveness, readiness and the request window (plans/DISCORD.md DC-004). */

import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  healthServer,
  readiness,
  REQUEST_WINDOW_SECONDS,
  timestampWithinWindow,
} from '../health';

describe('readiness', () => {
  it('is ready only when every check answers true in time', async () => {
    expect(await readiness({ a: async () => true })).toEqual({
      checks: { a: true },
      ready: true,
    });
    const answer = await readiness(
      {
        late: () => new Promise(resolve => setTimeout(() => resolve(true), 50)),
        throws: async () => {
          throw new Error('down');
        },
        up: async () => true,
      },
      10,
    );
    expect(answer).toEqual({
      checks: { late: false, throws: false, up: true },
      ready: false,
    });
  });
});

describe('healthServer', () => {
  let server: ReturnType<typeof healthServer> | undefined;
  afterEach(async () => {
    const running = server;
    server = undefined;
    if (running) await new Promise(resolve => running.close(resolve));
  });

  it('answers /healthz, /readyz, and nothing else', async () => {
    let ready = true;
    server = healthServer({ store: async () => ready });
    await new Promise<void>(resolve => server?.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const get = (path: string) => fetch(`http://127.0.0.1:${port}${path}`);
    expect((await get('/healthz')).status).toBe(200);
    expect((await get('/readyz')).status).toBe(200);
    ready = false;
    const notReady = await get('/readyz');
    expect(notReady.status).toBe(503);
    expect(await notReady.json()).toEqual({
      checks: { store: false },
      ready: false,
    });
    expect((await get('/discord/interactions')).status).toBe(404);
  });
});

describe('timestampWithinWindow', () => {
  it('takes five minutes either way, and nothing else', () => {
    const now = 1_700_000_000;
    expect(REQUEST_WINDOW_SECONDS).toBe(300);
    expect(timestampWithinWindow(String(now - 300), now)).toBe(true);
    expect(timestampWithinWindow(String(now + 300), now)).toBe(true);
    expect(timestampWithinWindow(String(now - 301), now)).toBe(false);
    expect(timestampWithinWindow(String(now + 301), now)).toBe(false);
    expect(timestampWithinWindow([String(now)], now)).toBe(true);
    expect(timestampWithinWindow(undefined, now)).toBe(false);
    expect(timestampWithinWindow('soon', now)).toBe(false);
  });
});
