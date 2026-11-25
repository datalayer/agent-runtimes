/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a page says of itself to the server it asks.
 *
 * A runtime's routes read their caller from a token: a bearer on a request,
 * the `token` query of a websocket, a browser being unable to set a header
 * there. A page that holds one sends it; a page on the server's own machine
 * holds none and sends nothing, exactly as before.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteConversationCheckpoint,
  listConversationCheckpoints,
  saveConversationCheckpoint,
} from '../../api/checkpoints';
import {
  createServerSandboxService,
  serverTokenOf,
} from '../plugins/agents/service';
import { ensureServerAgent } from '../plugins/agents/switchable';
import { ACPAdapter } from '../../protocols/ACPAdapter';

const SERVER = 'http://127.0.0.1:8765';

/** Every websocket opened, by its address; none of them ever connects. */
function sockets(): string[] {
  const opened: string[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen: unknown = null;
    onmessage: unknown = null;
    onclose: unknown = null;
    onerror: unknown = null;
    constructor(url: string) {
      opened.push(url);
    }
    close() {}
    send() {}
  }
  vi.stubGlobal('WebSocket', Socket);
  return opened;
}

type Call = { url: string; init?: RequestInit };

/** Every request made, each answered with `body`. */
function requests(body: unknown = {}, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('the token a host gives for its server', () => {
  it('is read as it stands when it is sent', () => {
    let held: string | undefined = 'first';
    const token = () => held;
    expect(serverTokenOf(token)).toBe('first');
    held = 'renewed';
    expect(serverTokenOf(token)).toBe('renewed');
    expect(serverTokenOf('given')).toBe('given');
    expect(serverTokenOf()).toBeUndefined();
  });
});

describe('the sandbox of the host’s server', () => {
  it('opens its status socket as before without a token', () => {
    const opened = sockets();
    createServerSandboxService(SERVER).connect('desk')();
    createServerSandboxService(SERVER).connect()();
    expect(opened).toEqual([
      'ws://127.0.0.1:8765/api/v1/configure/sandbox/ws?agent_id=desk',
      'ws://127.0.0.1:8765/api/v1/configure/sandbox/ws',
    ]);
  });

  it('names its token in the socket’s query when the host gave one', () => {
    const opened = sockets();
    createServerSandboxService(SERVER, 'a-token').connect('desk')();
    createServerSandboxService(SERVER, () => 'b-token').connect()();
    expect(opened).toEqual([
      'ws://127.0.0.1:8765/api/v1/configure/sandbox/ws?agent_id=desk&token=a-token',
      'ws://127.0.0.1:8765/api/v1/configure/sandbox/ws?token=b-token',
    ]);
  });

  it('runs code as its caller, or as before without a token', async () => {
    const calls = requests({ stdout: 'out' });
    await createServerSandboxService(SERVER).execute('1');
    await createServerSandboxService(SERVER, 'a-token').execute('1');
    expect(calls.map(call => call.url)).toEqual([
      `${SERVER}/api/v1/sandbox/execute`,
      `${SERVER}/api/v1/sandbox/execute`,
    ]);
    expect(calls[0].init?.headers).toEqual({
      'content-type': 'application/json',
    });
    expect(calls[1].init?.headers).toEqual({
      'content-type': 'application/json',
      Authorization: 'Bearer a-token',
    });
  });

  it('tolerates a status that names no Jupyter token', () => {
    const service = createServerSandboxService(SERVER);
    service.report({
      variant: 'jupyter-server',
      jupyter_connected: true,
      jupyter_url: 'http://127.0.0.1:8888',
      kernel_id: 'k1',
    });
    expect(service.snapshot.value).toMatchObject({
      state: 'running',
      jupyterUrl: 'http://127.0.0.1:8888',
      kernelId: 'k1',
    });
    expect(service.snapshot.value.jupyterToken).toBeUndefined();
  });
});

describe('the Local agent on the host’s server', () => {
  it('is asked for as its caller on every call', async () => {
    const calls = requests({});
    await ensureServerAgent(SERVER, 'desk', {}, 'a-token');
    expect(calls.map(call => call.url)).toEqual([
      `${SERVER}/api/v1/agents/desk`,
      `${SERVER}/api/v1/agents/desk/sandbox/ensure`,
    ]);
    for (const call of calls) {
      expect(call.init?.headers).toMatchObject({
        Authorization: 'Bearer a-token',
      });
    }
  });

  it('is asked for as before without a token', async () => {
    const calls = requests({});
    await ensureServerAgent(SERVER, 'desk', {});
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.init?.headers ?? {}).not.toHaveProperty('Authorization');
    }
  });
});

describe('an agent’s checkpoints', () => {
  const listing = { agent_id: 'desk', enabled: true, checkpoints: [] };

  it('are read, taken and dropped as their caller', async () => {
    const calls = requests(listing);
    await listConversationCheckpoints(SERVER, 'desk', 'a-token');
    await saveConversationCheckpoint(SERVER, 'desk', 'baseline', 'a-token');
    await deleteConversationCheckpoint(SERVER, 'desk', 'cp-1', 'a-token');
    expect(calls.map(call => call.init?.method ?? 'GET')).toEqual([
      'GET',
      'POST',
      'DELETE',
    ]);
    for (const call of calls) {
      expect(call.init?.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer a-token',
      });
    }
  });

  it('are read as before without a token', async () => {
    const calls = requests(listing);
    await listConversationCheckpoints(SERVER, 'desk');
    expect(calls[0].url).toBe(`${SERVER}/api/v1/agents/desk/checkpoints`);
    expect(calls[0].init?.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });
});

describe('the ACP socket', () => {
  const WS = 'ws://127.0.0.1:8765/api/v1/acp/ws';

  it('names the chat’s token in its query, and nothing without one', () => {
    const opened = sockets();
    void new ACPAdapter({
      protocol: 'acp',
      baseUrl: WS,
      agentId: 'desk',
      authToken: 'a-token',
    } as never)
      .connect()
      .catch(() => undefined);
    void new ACPAdapter({
      protocol: 'acp',
      baseUrl: WS,
      agentId: 'desk',
    } as never)
      .connect()
      .catch(() => undefined);
    expect(opened).toEqual([`${WS}/desk?token=a-token`, `${WS}/desk`]);
  });
});
