/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Stop, in an application's chat, is its session's (PAP_DATALAYER's release
 * gates, round 19): `POST /api/v1/apps/sessions/{thread}/stop`, with the
 * person's token. A deployment's runtime answers only the application's own
 * routes (OwnRoutesOnly, f111c5ec): the generic `/ag-ui/terminate` is a 404
 * there, and never knew a session's thread anyway. A page going away is not
 * the person's Stop: the session waits for them.
 *
 * @module protocols/__tests__/appSessionStop
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGUIAdapter } from '../AGUIAdapter';
import { createProtocolAdapter } from '../../utils/utils';

const SERVER = 'https://runtime.example/agent-runtimes/r1';
const SESSIONS = `${SERVER}/api/v1/apps/sessions`;

type Call = { url: string; init?: RequestInit };

function recording(status = 200): {
  calls: Call[];
  fetch: typeof globalThis.fetch;
} {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('{}', { status });
  });
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('Stop in an application’s chat', () => {
  let realFetch: typeof globalThis.fetch;
  beforeEach(() => {
    realFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('stops the thread’s session on the application’s own route, with the token', async () => {
    const { calls, fetch } = recording();
    globalThis.fetch = fetch;
    const adapter = createProtocolAdapter({
      type: 'ag-ui',
      endpoint: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
      authToken: 'tok',
      agentId: 'my-app',
      appSessions: SESSIONS,
      ownRoutesOnly: true,
    }) as AGUIAdapter;
    await adapter.terminateAgent('msg_thread 1');
    expect(calls.map(call => call.url)).toEqual([
      `${SESSIONS}/msg_thread%201/stop`,
    ]);
    expect(calls[0].init?.method).toBe('POST');
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer tok');
  });

  it('stops the thread it last ran when Stop names none', async () => {
    const { calls, fetch } = recording();
    globalThis.fetch = fetch;
    const adapter = new AGUIAdapter({
      protocol: 'ag-ui',
      baseUrl: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
      appSessions: SESSIONS,
    });
    (adapter as unknown as { currentThreadId: string }).currentThreadId =
      'msg_t';
    await adapter.terminateAgent();
    expect(calls.map(call => call.url)).toEqual([`${SESSIONS}/msg_t/stop`]);
  });

  it('says so when the session is not stopped', async () => {
    const { fetch } = recording(404);
    globalThis.fetch = fetch;
    const adapter = new AGUIAdapter({
      protocol: 'ag-ui',
      baseUrl: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
      appSessions: SESSIONS,
    });
    await expect(adapter.terminateAgent('msg_t')).rejects.toThrow(
      'The session msg_t could not be stopped (404).',
    );
  });

  it('calls nothing when the chat goes away: the session waits', async () => {
    const { calls, fetch } = recording();
    globalThis.fetch = fetch;
    const adapter = new AGUIAdapter({
      protocol: 'ag-ui',
      baseUrl: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
      appSessions: SESSIONS,
    });
    (adapter as unknown as { currentThreadId: string }).currentThreadId =
      'msg_t';
    adapter.disconnect();
    await Promise.resolve();
    expect(calls).toEqual([]);
  });

  it('is refused without its sessions when the runtime answers only its own routes', () => {
    expect(() =>
      createProtocolAdapter({
        type: 'ag-ui',
        endpoint: `${SERVER}/api/v1/apps/agents/my-app/ag-ui/`,
        ownRoutesOnly: true,
      }),
    ).toThrow(/needs its sessions/);
  });

  it('leaves an agent’s chat (no application) on the runtime’s AG-UI terminate', async () => {
    const { calls, fetch } = recording();
    globalThis.fetch = fetch;
    const adapter = createProtocolAdapter({
      type: 'ag-ui',
      endpoint: 'http://localhost:8765/api/v1/ag-ui/default/',
    }) as AGUIAdapter;
    await adapter.terminateAgent('t1');
    expect(calls.map(call => call.url)).toEqual([
      'http://localhost:8765/api/v1/ag-ui/terminate',
    ]);
  });
});
