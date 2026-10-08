/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Window messages (LOOP P-25): what an application's code tells the page it
 * sits in, handed to whoever listens, and what the page posts to its code,
 * answered on the turn's stream.
 */

import { describe, expect, it } from 'vitest';
import {
  LOOP_WINDOW,
  loopWindowMessage,
  onLoopWindowMessage,
  tellLoopWindow,
  windowTurnOf,
} from '../loopWindow';
import {
  WINDOW_NOT_YET,
  postWindowMessage,
} from '../../../apps/embed/embedSession';

const sse = (...events: unknown[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');

describe('window messages', () => {
  it('are read from the loop.window activity, and nothing else', () => {
    expect(
      loopWindowMessage({
        type: LOOP_WINDOW,
        data: { data: { open: 'cart' } },
      }),
    ).toEqual({ data: { open: 'cart' } });
    expect(
      loopWindowMessage({ type: LOOP_WINDOW, data: { data: null } }),
    ).toEqual({ data: null });
    expect(loopWindowMessage({ type: LOOP_WINDOW, data: {} })).toBeNull();
    expect(
      loopWindowMessage({ type: 'loop.element', data: { data: 1 } }),
    ).toBeNull();
    expect(loopWindowMessage(undefined)).toBeNull();
  });

  it('are handed to whoever listens, until they stop', () => {
    const heard: unknown[] = [];
    const stop = onLoopWindowMessage(data => heard.push(data));
    tellLoopWindow({ open: 'cart' });
    stop();
    tellLoopWindow({ open: 'never' });
    expect(heard).toEqual([{ open: 'cart' }]);
  });

  it('say what a turn told the page, and why it failed', () => {
    const stream = sse(
      { type: 'CUSTOM', name: 'loop.session', value: { uid: 's' } },
      { type: 'RUN_STARTED' },
      { type: 'CUSTOM', name: LOOP_WINDOW, value: { data: { seen: '/cart' } } },
      { type: 'RUN_FINISHED' },
    );
    expect(windowTurnOf(stream)).toEqual({
      said: [{ seen: '/cart' }],
      error: null,
    });
    expect(
      windowTurnOf(sse({ type: 'RUN_ERROR', message: 'The turn failed: no.' })),
    ).toEqual({ said: [], error: 'The turn failed: no.' });
    expect(windowTurnOf('data: not json\n\n')).toEqual({
      said: [],
      error: null,
    });
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
        new Response(
          sse({
            type: 'CUSTOM',
            name: LOOP_WINDOW,
            value: { data: { seen: '/checkout' } },
          }),
        ),
      ),
    });
    expect(said).toEqual([{ seen: '/checkout' }]);
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
