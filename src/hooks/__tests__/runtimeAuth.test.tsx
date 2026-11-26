/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser clients send a runtime the token as it stands now.
 *
 * Review of 1.8.8: a read made with a caller's token was cached as if the
 * token did not matter, a socket's retry sent the token of the render that
 * opened it, and a token getter was resolved at render. A read is keyed by
 * the token's fingerprint (never the token), a socket and a callback read it
 * when they send, and a guard over the sources fails when a read that sends
 * a token is keyed without it.
 */

import * as React from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NO_AUTH_KEY,
  authKey,
  runtimeQueryKey,
  useRuntimeQuery,
} from '../runtimeAuth';
import { useAcp } from '../useAcp';
import { useA2A } from '../useA2A';
import { useServerToken } from '../../apps/plugins/agents/useSandboxService';

const reactorMock = vi.hoisted(() => ({
  platform: undefined as unknown,
}));
vi.mock('@datalayer/reactor/react', () => ({
  useOptionalReactorPlatform: () => reactorMock.platform,
  useReactorPlatform: () => reactorMock.platform,
}));

const SRC = join(__dirname, '..', '..');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('authKey', () => {
  it('says none for no token, and a fingerprint, never the token, for one', () => {
    expect(authKey(undefined)).toBe(NO_AUTH_KEY);
    expect(authKey(null)).toBe(NO_AUTH_KEY);
    expect(authKey('  ')).toBe(NO_AUTH_KEY);
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.c2lnbmF0dXJl';
    const key = authKey(token);
    expect(key).toMatch(/^auth:[0-9a-f]{16}$/);
    expect(key).not.toContain(token);
    expect(key).not.toContain('eyJ');
    expect(authKey(token)).toBe(key);
    expect(authKey(`${token}x`)).not.toBe(key);
  });

  it('ends a key so that its parts alone still match it as a prefix', () => {
    expect(runtimeQueryKey(['mcp-config', 'http://r'], 'abc')).toEqual([
      'mcp-config',
      'http://r',
      authKey('abc'),
    ]);
  });
});

describe('useRuntimeQuery', () => {
  const wrapper =
    (client: QueryClient) =>
    ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

  it("reads again with a token given after a refused read, and shows no caller another caller's answer", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const seen: Array<string | undefined> = [];
    const queryFn = vi.fn(async (headers: Record<string, string>) => {
      seen.push(headers.Authorization);
      if (!headers.Authorization) {
        throw new Error('401');
      }
      return { owner: headers.Authorization === 'Bearer owner' };
    });
    const { result, rerender } = renderHook(
      ({ token }: { token?: string }) =>
        useRuntimeQuery({
          key: ['agent-spec', 'a1', 'http://runtime'],
          authToken: token,
          queryFn,
        }),
      { wrapper: wrapper(client), initialProps: { token: undefined } },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    rerender({ token: 'owner' });
    await waitFor(() => expect(result.current.data).toEqual({ owner: true }));

    rerender({ token: 'someone' });
    // Not the owner's cached answer, not even while the new read runs.
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toEqual({ owner: false }));
    expect(seen).toEqual([undefined, 'Bearer owner', 'Bearer someone']);
    for (const query of client.getQueryCache().getAll()) {
      expect(JSON.stringify(query.queryKey)).not.toMatch(/owner|someone/);
    }
  });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
  refuse(): void {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

describe('useAcp', () => {
  const tokenOf = (socket: FakeSocket) =>
    new URL(socket.url).searchParams.get('token');

  it('retries a refused socket with the token renewed since it was opened', () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    const { rerender } = renderHook(
      ({ token }: { token: string }) =>
        useAcp({
          wsUrl: 'ws://runtime/api/v1/acp/ws',
          agentId: 'a1',
          authToken: token,
          reconnectDelay: 10,
        }),
      { initialProps: { token: 'old' } },
    );
    expect(FakeSocket.instances.map(tokenOf)).toEqual(['old']);
    // Renewed while the first attempt is still connecting: kept, not doubled.
    rerender({ token: 'new' });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => FakeSocket.instances[0].refuse());
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(FakeSocket.instances.map(tokenOf)).toEqual(['old', 'new']);
  });

  it('connects again when a token is given after the retries were spent', () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    const { rerender } = renderHook(
      ({ token }: { token?: string }) =>
        useAcp({
          wsUrl: 'ws://runtime/api/v1/acp/ws',
          agentId: 'a1',
          authToken: token,
          reconnectAttempts: 0,
        }),
      { initialProps: { token: undefined as string | undefined } },
    );
    act(() => FakeSocket.instances[0].refuse());
    expect(FakeSocket.instances).toHaveLength(1);
    rerender({ token: 'signed-in' });
    expect(FakeSocket.instances.map(tokenOf)).toEqual([null, 'signed-in']);
  });

  it('uses a token given while a socket was connecting once that socket is refused, its retries spent', () => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    const { rerender } = renderHook(
      ({ token }: { token?: string }) =>
        useAcp({
          wsUrl: 'ws://runtime/api/v1/acp/ws',
          agentId: 'a1',
          authToken: token,
          reconnectAttempts: 0,
        }),
      { initialProps: { token: undefined as string | undefined } },
    );
    rerender({ token: 'signed-in' });
    expect(FakeSocket.instances).toHaveLength(1);
    act(() => FakeSocket.instances[0].refuse());
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(FakeSocket.instances.map(tokenOf)).toEqual([null, 'signed-in']);
  });
});

describe('useA2A', () => {
  it("keeps the card a token's request read when an earlier request is refused after it", async () => {
    const answers: Array<(response: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            answers.push(resolve);
          }),
      ),
    );
    const { result, rerender } = renderHook(
      ({ token }: { token?: string }) =>
        useA2A({ baseUrl: 'http://runtime', agentId: 'a1', authToken: token }),
      { initialProps: { token: undefined as string | undefined } },
    );
    rerender({ token: 'signed-in' });
    await waitFor(() => expect(answers).toHaveLength(2));
    await act(async () => {
      answers[1](new Response(JSON.stringify({ name: 'a1' }), { status: 200 }));
    });
    await waitFor(() => expect(result.current.isConnected).toBe(true));
    await act(async () => {
      answers[0](new Response('', { status: 401, statusText: 'Unauthorized' }));
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });
});

describe('useServerToken', () => {
  it('gives a new getter when the token the host gives changes, and reads it when called', () => {
    const config: { serverToken?: string | (() => string | undefined) } = {};
    reactorMock.platform = { getConfig: () => config };
    const { result, rerender } = renderHook(() => useServerToken());
    const before = result.current;
    expect(before()).toBeUndefined();
    rerender();
    expect(result.current).toBe(before);
    config.serverToken = 'host';
    rerender();
    expect(result.current).not.toBe(before);
    expect(result.current()).toBe('host');
    // A getter the host renews without drawing again is read at the call.
    let renewed = 'one';
    config.serverToken = () => renewed;
    rerender();
    const getter = result.current;
    renewed = 'two';
    expect(getter()).toBe('two');
  });
});

/* ---- a guard over the sources ---------------------------------------- */

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' || name === 'node_modules'
        ? []
        : sources(path);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

/** Each `useQuery(...)` call's text, by balanced parentheses. */
const queryCallsIn = (text: string): string[] => {
  const calls: string[] = [];
  const pattern = /\buseQuery\s*(<[^(]*?>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      if (text[end] === ')' && --depth === 0) break;
    }
    calls.push(text.slice(match.index, end + 1));
  }
  return calls;
};

describe('the sources', () => {
  it('key every read that sends a token by that token', () => {
    const unkeyed: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const call of queryCallsIn(text)) {
        const sendsToken = /runtimeAuthHeaders\(|Authorization|authToken/.test(
          call,
        );
        if (sendsToken && !/runtimeQueryKey\(|authKey\(/.test(call)) {
          unkeyed.push(relative(SRC, file));
        }
      }
    }
    // A read that sends a caller's token takes `useRuntimeQuery`, or keys
    // itself with `runtimeQueryKey`.
    expect(unkeyed).toEqual([]);
  });

  it('read the node configuration again for each caller, and save nothing unread', () => {
    const node = readFileSync(join(SRC, 'AgentNode.tsx'), 'utf8');
    const load = node.slice(
      node.indexOf('/api/v1/agent-node/configuration'),
      node.indexOf('/api/v1/configure/inference/provider'),
    );
    expect(load).toMatch(/signal: controller\.signal/);
    expect(load).toMatch(/\}, \[token, nodeAuthHeaders\]\);/);
    // Loaded only on a read that answered.
    expect(load).not.toMatch(/finally\s*\{\s*setConfigurationLoaded\(true\)/);
    expect(load).not.toMatch(
      /if \(!response\.ok\) \{\s*setConfigurationLoaded\(true\)/,
    );
    const save = node.slice(node.indexOf('const saveConfiguration'));
    expect(save.slice(0, 400)).toMatch(/if \(!configurationLoaded\)/);
    expect(node).toMatch(/disabled=\{isSaving \|\| !configurationLoaded\}/);
    const models = node.slice(node.indexOf('const loadInferenceModels'));
    expect(models.slice(0, 2000)).toMatch(
      /\}, \[inferenceProvider, token, nodeAuthHeaders\]\);/,
    );
  });

  it("send a Local or Jupyter workspace's chat with the host's token, and the approvals stream the person's alone", () => {
    const view = readFileSync(
      join(SRC, 'apps/plugins/chat/ChatView.tsx'),
      'utf8',
    );
    expect(view).toMatch(
      /\.\.\.\(agentServerToken \? \{ authToken: agentServerToken \} : \{\}\),\s*aiAgentsToken: personToken \?\? null,/,
    );
    // Its model catalogue too.
    expect(view).toMatch(
      /protocol\.configEndpoint : undefined,\s*agentServerToken,\s*agentId,/,
    );
    const base = readFileSync(join(SRC, 'chat/base/ChatBase.tsx'), 'utf8');
    expect(base).toMatch(
      /protocolConfig && protocolConfig\.aiAgentsToken !== undefined\s*\? protocolConfig\.aiAgentsToken \|\| undefined\s*: protocolConfig\?\.authToken;/,
    );
  });

  it('give the details panel the token a full transport configuration carries', () => {
    const chat = readFileSync(join(SRC, 'chat/Chat.tsx'), 'utf8');
    expect(chat).toMatch(
      /const runtimeToken =\s*authTokenProp \?\?\s*\(typeof transport === 'object' && transport !== null\s*\? transport\.authToken/,
    );
    expect(chat).toMatch(/authToken=\{runtimeToken\}/);
  });

  it('resolve a server token getter when they send, not at render', () => {
    const hook = readFileSync(
      join(SRC, 'apps/plugins/agents/useSandboxService.ts'),
      'utf8',
    );
    expect(hook).toMatch(
      /export function useServerToken\(\): \(\) => string \| undefined/,
    );
  });
});
