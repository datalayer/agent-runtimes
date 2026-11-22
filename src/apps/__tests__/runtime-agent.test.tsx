/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent that answers on a runtime, and the session it holds
 * (`apps/runtimeAgent`): what a host asks before it draws an `AIApplication`
 * in runtime mode, nothing guessed.
 */

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OLDER_RUNTIME,
  readRuntimeSessions,
  runtimeAgentAnswering,
  useRuntimeAgent,
} from '../runtimeAgent';

afterEach(() => cleanup());

type Answer = { ok: boolean; status: number; json: () => Promise<unknown> };
const answer = (status: number, body: unknown = {}): Answer => ({
  ok: status === 200,
  status,
  json: async () => body,
});

const runtime = (
  said: Record<string, unknown> | undefined,
  sessions: unknown[] = [],
  heldStatus = 200,
  agents: unknown[] = [{ id: 'default' }],
) => {
  const calls: string[] = [];
  const fetcher = (async (url: string) => {
    calls.push(url);
    if (url.endsWith('/api/v1/agents')) {
      return answer(200, { agents });
    }
    if (url.endsWith('/api/v1/runtime/status')) {
      return said === undefined
        ? answer(503)
        : answer(200, { status: 'ok', ...said });
    }
    return answer(heldStatus, { sessions });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
};

describe('the agent that answers on a runtime', () => {
  it('is the record’s when the runtime lists it, else default, else the first', () => {
    expect(runtimeAgentAnswering(['default'], 'worker-crawler')).toBe(
      'default',
    );
    expect(
      runtimeAgentAnswering(['default', 'worker-crawler'], 'worker-crawler'),
    ).toBe('worker-crawler');
    expect(runtimeAgentAnswering(['a', 'b'], '')).toBe('a');
    expect(runtimeAgentAnswering([], 'worker-crawler')).toBe('');
  });
});

describe('what a runtime says it can do', () => {
  it('asks nothing else of a runtime that does not say it keeps agent sessions', async () => {
    const { calls, fetcher } = runtime({ version: '1.5.128' });
    expect(
      await readRuntimeSessions({
        baseUrl: 'https://x/rt/',
        token: 'ada',
        fetcher,
      }),
    ).toEqual({ version: '1.5.128', capable: false, held: '' });
    expect(calls).toEqual(['https://x/rt/api/v1/runtime/status']);
    // Its version proves nothing.
    expect(
      (
        await readRuntimeSessions({
          baseUrl: 'https://x',
          fetcher: runtime({ version: '9.9.9' }).fetcher,
        })
      ).capable,
    ).toBe(false);
  });

  it('says the agent session it holds, newest first', async () => {
    const { calls, fetcher } = runtime(
      { version: '1.5.120', agent_sessions: true },
      [
        {
          uid: 's-old',
          kind: 'agent',
          state: 'paused',
          started_at: '2026-11-10T00:00:00Z',
        },
        {
          uid: 's-new',
          kind: 'agent',
          state: 'open',
          started_at: '2026-11-11T00:00:00Z',
        },
        {
          uid: 's-app',
          kind: 'application',
          state: 'open',
          started_at: '2026-11-12T00:00:00Z',
        },
        {
          uid: 's-ended',
          kind: 'agent',
          state: 'ended',
          started_at: '2026-11-13T00:00:00Z',
        },
      ],
    );
    expect(
      await readRuntimeSessions({ baseUrl: 'https://x/rt', fetcher }),
    ).toEqual({ version: '1.5.120', capable: true, held: 's-new' });
    expect(calls).toEqual([
      'https://x/rt/api/v1/runtime/status',
      'https://x/rt/api/v1/apps/sessions?held=true',
    ]);
  });

  it('guesses nothing: a runtime that does not answer is an error', async () => {
    await expect(
      readRuntimeSessions({
        baseUrl: 'https://x',
        fetcher: runtime(undefined).fetcher,
      }),
    ).rejects.toThrow('The runtime did not say what it runs (503).');
    await expect(
      readRuntimeSessions({
        baseUrl: 'https://x',
        fetcher: runtime({ agent_sessions: true }, [], 500).fetcher,
      }),
    ).rejects.toThrow('did not say which sessions it holds (500)');
  });
});

describe('useRuntimeAgent', () => {
  it('says the agent and the session it holds', async () => {
    const { fetcher } = runtime(
      { version: '1.7.3', agent_sessions: true },
      [
        {
          uid: 's-1',
          kind: 'agent',
          state: 'open',
          started_at: '2026-11-22T00:00:00Z',
        },
      ],
      200,
      [{ id: 'default' }, { id: 'marketer' }],
    );
    const { result } = renderHook(() =>
      useRuntimeAgent({
        url: 'https://x/rt',
        recordAgentId: 'marketer',
        fetcher,
      }),
    );
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      agentId: 'marketer',
      thread: { id: 's-1', messages: [], fromRuntime: true },
    });
  });

  it('goes on with the session the host kept, in place of the one held', async () => {
    const { fetcher } = runtime({ version: '1.7.3', agent_sessions: true }, [
      { uid: 's-1', kind: 'agent', state: 'open' },
    ]);
    const { result } = renderHook(() =>
      useRuntimeAgent({
        url: 'https://x/rt',
        resumed: () => 's-kept',
        fetcher,
      }),
    );
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toMatchObject({
      agentId: 'default',
      thread: { id: 's-kept' },
    });
  });

  it('says a runtime that keeps no agent session, in the host’s words or its own', async () => {
    const { fetcher } = runtime({ version: '1.5.0' });
    const { result } = renderHook(() =>
      useRuntimeAgent({ url: 'https://x/rt', fetcher }),
    );
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({ error: OLDER_RUNTIME('1.5.0') });
    const own = renderHook(() =>
      useRuntimeAgent({
        url: 'https://x/rt',
        fetcher,
        olderRuntime: version => `old ${version}`,
      }),
    );
    await waitFor(() =>
      expect(own.result.current).toEqual({ error: 'old 1.5.0' }),
    );
  });

  it('asks again while the runtime comes up, then says why', async () => {
    const { fetcher, calls } = runtime(undefined, [], 200, []);
    const { result } = renderHook(() =>
      useRuntimeAgent({
        url: 'https://x/rt',
        fetcher,
        askEveryMs: 1,
        askAtMost: 3,
      }),
    );
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current).toEqual({
      error: 'No agent answers on the runtime yet.',
    });
    expect(calls.filter(url => url.endsWith('/api/v1/agents'))).toHaveLength(3);
  });

  it('asks nothing while the runtime has no address', () => {
    const { fetcher, calls } = runtime({});
    const { result } = renderHook(() => useRuntimeAgent({ url: '', fetcher }));
    expect(result.current).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
