/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An embedded application's conversation, picked up again after the host's
 * page reloads (LOOP D-13): the session kept under the application and the
 * visit its token names — in the page's storage unless the host opts out,
 * in memory always — asked for again on the server that holds it, drawn
 * again; one gone or refused is forgotten and said once.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyAppspec } from '../apps/appspec';

const seen = vi.hoisted(() => ({
  renderer: [] as Array<Record<string, any>>,
}));

// The workspace is not what is tested: what it is handed is.
vi.mock('../../chat/ChatFloating', () => ({
  ChatFloating: () => <div data-testid="floating" />,
}));
vi.mock('../apps/AppRenderer', () => ({
  AppRenderer: (props: Record<string, any>) => {
    seen.renderer.push(props);
    return <div data-testid="renderer" />;
  },
}));

import {
  AppEmbed,
  useEmbedSession,
  type EmbedSession,
} from '../embed/AppEmbed';
import { EmbedAttributeError, resumeOf } from '../embed/embedConfig';
import {
  embedSessionKey,
  forgetSessionsInMemory,
  messagesOfThread,
  reattachSession,
  sessionGoneSentence,
  sessionKeeper,
  visitOfToken,
} from '../embed/embedSession';

/** An embed token as Spacer issues one: its claims readable, its signature not checked here. */
function tokenFor(claims: Record<string, unknown>): string {
  const part = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.signature`;
}

const TOKEN = tokenFor({ sub: 'owner', app_uid: 'app-1', visit: 'visit-a' });
const RENEWED = tokenFor({
  sub: 'owner',
  app_uid: 'app-1',
  visit: 'visit-a',
  jti: 'renewed',
});
const SERVER = 'https://host.example/agents';
const KEY = embedSessionKey('notes-assistant', 'visit-a');

const app = (() => {
  const spec = emptyAppspec('chat');
  spec.id = 'notes-assistant';
  spec.name = 'Notes assistant';
  return spec;
})();

const THREAD = [
  { id: 'u1', role: 'user', content: 'Hello' },
  {
    id: 'a1',
    role: 'assistant',
    content: 'Hi there.',
    toolCalls: [
      { id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } },
    ],
  },
  { id: 'c1-result', role: 'tool', toolCallId: 'c1', content: '{}' },
  { id: 'a2', role: 'assistant', content: '' },
];

const realFetch = globalThis.fetch;

beforeEach(() => {
  window.localStorage.clear();
  forgetSessionsInMemory();
  seen.renderer.length = 0;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  document.body.innerHTML = '';
});

describe('the visit an embed token names', () => {
  it('is read from its claims', () => {
    expect(visitOfToken(TOKEN)).toBe('visit-a');
  });

  it('is none for a token without one, or that is not a token', () => {
    expect(visitOfToken(tokenFor({ sub: 'owner' }))).toBeUndefined();
    expect(visitOfToken('not-a-token')).toBeUndefined();
    expect(visitOfToken('a.%%%.b')).toBeUndefined();
    expect(visitOfToken(undefined)).toBeUndefined();
  });
});

describe('the session keeper', () => {
  it('keeps the uid in the host’s storage, under a namespaced key', () => {
    const keeper = sessionKeeper({ persist: true });
    keeper.keep(KEY, 'msg_1_abc');
    expect(KEY).toBe('datalayer-app:session:notes-assistant:visit-a');
    expect(window.localStorage.getItem(KEY)).toBe('msg_1_abc');
    forgetSessionsInMemory();
    expect(sessionKeeper({ persist: true }).read(KEY)).toBe('msg_1_abc');
    keeper.forget(KEY);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(keeper.read(KEY)).toBeUndefined();
  });

  it('keeps nothing in storage when the host opts out, and the page’s memory still holds it', () => {
    const keeper = sessionKeeper({ persist: false });
    keeper.keep(KEY, 'msg_1_abc');
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(keeper.read(KEY)).toBe('msg_1_abc');
    // A reload: the page's memory is gone.
    forgetSessionsInMemory();
    expect(keeper.read(KEY)).toBeUndefined();
  });

  it('works without storage', () => {
    const refusing = () => {
      throw new Error('SecurityError');
    };
    const blocked = {
      getItem: refusing,
      setItem: refusing,
      removeItem: refusing,
    } as unknown as Storage;
    for (const storage of [() => blocked, () => undefined, refusing]) {
      const keeper = sessionKeeper({
        persist: true,
        storage: storage as () => Storage | undefined,
      });
      expect(() => keeper.keep(KEY, 'msg_1_abc')).not.toThrow();
      expect(keeper.read(KEY)).toBe('msg_1_abc');
      expect(() => keeper.forget(KEY)).not.toThrow();
      expect(keeper.read(KEY)).toBeUndefined();
    }
  });
});

describe('a session’s conversation', () => {
  it('is drawn in words: what was said and answered', () => {
    const drawn = messagesOfThread(THREAD);
    expect(drawn.map(m => [m.id, m.role, m.content])).toEqual([
      ['u1', 'user', 'Hello'],
      ['a1', 'assistant', 'Hi there.'],
    ]);
    expect(messagesOfThread(null)).toEqual([]);
  });

  it('is asked for on the server that holds it, with the visit’s token', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ uid: 's-1', messages: THREAD })),
    );
    const found = await reattachSession({
      serverUrl: `${SERVER}/`,
      uid: 's 1',
      token: TOKEN,
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${SERVER}/api/v1/apps/sessions/s%201/messages`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    expect(found.kind).toBe('resumed');
    expect(found.kind === 'resumed' && found.messages).toHaveLength(2);
  });

  it('is gone when the runtime let it go, refuses it, or is out of reach', async () => {
    for (const fetcher of [
      async () => new Response('{"detail":"No session"}', { status: 404 }),
      async () => new Response('{}', { status: 401 }),
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ]) {
      expect(
        await reattachSession({
          serverUrl: SERVER,
          uid: 's-1',
          token: TOKEN,
          fetcher: fetcher as unknown as typeof fetch,
        }),
      ).toEqual({ kind: 'gone', uid: 's-1' });
    }
  });
});

describe('resume, as the host writes it', () => {
  it('is on unless the host writes false', () => {
    expect(resumeOf(null)).toBe(true);
    expect(resumeOf('')).toBe(true);
    expect(resumeOf('true')).toBe(true);
    expect(resumeOf('false')).toBe(false);
  });

  it('refuses what is neither, in a sentence', () => {
    expect(() => resumeOf('no')).toThrow(EmbedAttributeError);
    expect(() => resumeOf('no')).toThrow(/true or false/);
  });
});

/** The hook, mounted; its newest answer in `seen`. */
async function mountSession(props: Parameters<typeof useEmbedSession>[0]) {
  const seen: EmbedSession[] = [];
  function Probe(given: Parameters<typeof useEmbedSession>[0]) {
    seen.push(useEmbedSession(given));
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe {...props} />);
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return {
    seen,
    last: () => seen[seen.length - 1],
    rerender: (next: Parameters<typeof useEmbedSession>[0]) =>
      act(async () => {
        root.render(<Probe {...next} />);
        await new Promise(resolve => setTimeout(resolve, 0));
      }),
    unmount: () => act(async () => root.unmount()),
  };
}

describe('useEmbedSession', () => {
  it('keeps nothing off the host’s server or without a token', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    for (const props of [
      { app, embedToken: TOKEN },
      { app, serverUrl: SERVER },
      { app, serverUrl: SERVER, embedToken: tokenFor({ sub: 'owner' }) },
    ]) {
      const mounted = await mountSession(props);
      expect(mounted.last()).toEqual({ ready: true });
      await mounted.unmount();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('starts a new thread, kept once a message is sent on it', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const mounted = await mountSession({
      app,
      serverUrl: SERVER,
      embedToken: TOKEN,
    });
    const { thread } = mounted.last();
    expect(mounted.last().ready).toBe(true);
    expect(thread?.messages).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await act(async () => thread?.onStarted?.(thread.id));
    expect(window.localStorage.getItem(KEY)).toBe(thread?.id);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await mounted.unmount();
  });

  it('picks the kept session up again after a reload, its conversation drawn again', async () => {
    window.localStorage.setItem(KEY, 'msg_kept');
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ uid: 'msg_kept', messages: THREAD })),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const mounted = await mountSession({
      app,
      serverUrl: SERVER,
      embedToken: TOKEN,
    });
    // Nothing is drawn before the session is asked for.
    expect(mounted.seen[0]).toEqual({ ready: false });
    const { thread, said } = mounted.last();
    expect(thread?.id).toBe('msg_kept');
    expect(thread?.messages.map(m => m.content)).toEqual([
      'Hello',
      'Hi there.',
    ]);
    expect(said).toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      `${SERVER}/api/v1/apps/sessions/msg_kept/messages`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );
    await mounted.unmount();
  });

  it('asks again with a token renewed for the visit, and goes on with the session', async () => {
    window.localStorage.setItem(KEY, 'msg_kept');
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ uid: 'msg_kept', messages: THREAD })),
    );
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const props = { app, serverUrl: SERVER, embedToken: TOKEN };
    const mounted = await mountSession(props);
    await mounted.rerender({ ...props, embedToken: RENEWED });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mounted.last().thread?.id).toBe('msg_kept');
    await mounted.unmount();
  });

  it('starts fresh when the kept session is gone: the key cleared, said once', async () => {
    window.localStorage.setItem(KEY, 'msg_gone');
    globalThis.fetch = vi.fn(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch;
    const mounted = await mountSession({
      app,
      serverUrl: SERVER,
      embedToken: TOKEN,
    });
    const { thread, said } = mounted.last();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(said).toBe(sessionGoneSentence('Notes assistant'));
    expect(thread?.id).not.toBe('msg_gone');
    expect(thread?.messages).toEqual([]);
    // Said until the new conversation starts, and not again.
    await act(async () => thread?.onStarted?.(thread.id));
    expect(mounted.last().said).toBeUndefined();
    expect(window.localStorage.getItem(KEY)).toBe(thread?.id);
    await mounted.unmount();
  });

  it('keeps the session in memory only when the host opts out', async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    const mounted = await mountSession({
      app,
      serverUrl: SERVER,
      embedToken: TOKEN,
      resume: false,
    });
    const { thread } = mounted.last();
    await act(async () => thread?.onStarted?.(thread.id));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(sessionKeeper({ persist: false }).read(KEY)).toBe(thread?.id);
    await mounted.unmount();
  });
});

describe('AppEmbed', () => {
  it('draws nothing before the kept session is asked for, then hands its thread to the conversation', async () => {
    window.localStorage.setItem(KEY, 'msg_kept');
    let answer: (response: Response) => void = () => {};
    globalThis.fetch = vi.fn(
      () => new Promise<Response>(resolve => (answer = resolve)),
    ) as unknown as typeof fetch;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AppEmbed
          app={app}
          mode="inline"
          serverUrl={SERVER}
          embedToken={TOKEN}
        />,
      );
    });
    expect(seen.renderer).toHaveLength(0);
    await act(async () => {
      answer(new Response(JSON.stringify({ messages: THREAD })));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const props = seen.renderer[seen.renderer.length - 1];
    expect(props.thread.id).toBe('msg_kept');
    expect(props.thread.messages).toHaveLength(2);
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('says once that the kept session is gone, above a new conversation', async () => {
    window.localStorage.setItem(KEY, 'msg_gone');
    globalThis.fetch = vi.fn(
      async () => new Response('{}', { status: 404 }),
    ) as unknown as typeof fetch;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <AppEmbed
          app={app}
          mode="inline"
          serverUrl={SERVER}
          embedToken={TOKEN}
        />,
      );
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      sessionGoneSentence('Notes assistant'),
    );
    const props = seen.renderer[seen.renderer.length - 1];
    expect(props.thread.id).not.toBe('msg_gone');
    await act(async () => root.unmount());
  });
});
