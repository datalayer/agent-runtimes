/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Window messages (P-25): what an application's code tells the page it
 * sits in, handed to whoever listens, and what the page posts to its code,
 * answered on the turn's stream.
 */

import { describe, expect, it } from 'vitest';
import type { WindowOp } from '@datalayer/reactor/ui';
import {
  onLoopWindowMessage,
  tellLoopWindow,
  windowMessageOf,
  windowTurnErrorOf,
} from '../loopWindow';
import {
  WINDOW_NOT_YET,
  postWindowMessage,
} from '../../../apps/embed/embedSession';

const sse = (...events: unknown[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');

/** A window op, as the session API sends one (RU-3). */
const windowOp = (name: string, args?: Record<string, unknown>): WindowOp => ({
  v: 1,
  op: 'window',
  scope: 's',
  id: null,
  body: { name, ...(args ? { args } : {}) },
});

const told = (data: unknown) => ({
  type: 'CUSTOM',
  name: 'reactor.ui',
  value: windowOp('message', { data }),
});

describe('window messages', () => {
  it('are read from a window op named message, and refused otherwise', () => {
    expect(
      windowMessageOf(windowOp('message', { data: { open: 'cart' } })),
    ).toEqual({ open: 'cart' });
    expect(windowMessageOf(windowOp('message', { data: null }))).toBeNull();
    expect(() => windowMessageOf(windowOp('message', {}))).toThrow(/no data/);
    expect(() => windowMessageOf(windowOp('message'))).toThrow(/no data/);
    expect(() => windowMessageOf(windowOp('focus', { data: 1 }))).toThrow(
      /not one this page acts on/,
    );
  });

  it('are handed to whoever listens, until they stop', () => {
    const heard: unknown[] = [];
    const stop = onLoopWindowMessage(data => heard.push(data));
    tellLoopWindow({ open: 'cart' });
    stop();
    tellLoopWindow({ open: 'never' });
    expect(heard).toEqual([{ open: 'cart' }]);
  });

  it('say why the turn a page’s message ran failed, and refuse an op on the run', () => {
    const stream = sse(
      { type: 'CUSTOM', name: 'loop.session', value: { uid: 's' } },
      { type: 'RUN_STARTED' },
      { type: 'RUN_FINISHED' },
    );
    expect(windowTurnErrorOf(stream)).toBeNull();
    expect(
      windowTurnErrorOf(
        sse({ type: 'RUN_ERROR', message: 'The turn failed: no.' }),
      ),
    ).toBe('The turn failed: no.');
    expect(windowTurnErrorOf('data: not json\n\n')).toBeNull();
    // What the code tells the page back comes on the ui socket (RU-W).
    expect(() => windowTurnErrorOf(sse(told({ seen: '/cart' })))).toThrow(
      /ui socket/,
    );
  });

  it('are posted to the session, with the visit’s token, and refused in the runtime’s sentence', async () => {
    const asked: Array<{ url: string; init: RequestInit }> = [];
    const answer =
      (response: Response): typeof fetch =>
      async (url, init) => {
        asked.push({ url: String(url), init: init ?? {} });
        return response;
      };
    const said = await postWindowMessage({
      serverUrl: 'https://shop.example/assistant/',
      uid: 'session 1',
      token: 'visit-token',
      data: { page: '/checkout' },
      fetcher: answer(
        new Response(sse({ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' })),
      ),
    });
    // What its code answers comes on the ui socket, not in the response.
    expect(said).toBeUndefined();
    expect(asked[0].url).toBe(
      'https://shop.example/assistant/api/v1/apps/sessions/session%201/window',
    );
    expect(asked[0].init.method).toBe('POST');
    expect(asked[0].init.headers).toEqual({
      'content-type': 'application/json',
      Authorization: 'Bearer visit-token',
    });
    expect(JSON.parse(String(asked[0].init.body))).toEqual({
      data: { page: '/checkout' },
    });
    await expect(
      postWindowMessage({
        serverUrl: 'https://shop.example/assistant',
        uid: 's',
        data: 1,
        fetcher: answer(
          new Response(
            JSON.stringify({
              detail:
                'Help Desk reads no window message: its code has no @app.window.',
            }),
            { status: 422 },
          ),
        ),
      }),
    ).rejects.toThrow(
      'Help Desk reads no window message: its code has no @app.window.',
    );
    await expect(
      postWindowMessage({
        serverUrl: 'https://shop.example/assistant',
        uid: 's',
        data: 1,
        fetcher: answer(
          new Response(sse({ type: 'RUN_ERROR', message: 'It broke.' })),
        ),
      }),
    ).rejects.toThrow('It broke.');
    expect(WINDOW_NOT_YET).toContain('once its conversation has started');
  });
});
