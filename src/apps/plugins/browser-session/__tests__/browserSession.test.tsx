/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser-session plugin (the user, 15 November 2026): *Sign in to
 * LinkedIn* in the chat when the runtime's agents use the linkedin server and
 * hold no live session, the runtime's browser drawn and driven from a dialog,
 * *Done* keeping the session; never for an anonymous visitor.
 */

// @vitest-environment jsdom
import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import {
  BROWSER_SESSION_PLUGIN_NAME,
  BrowserSessionButton,
  offersSignIn,
  pagePoint,
  stepSession,
  type BrowserSessionStatus,
} from '..';
import { BROWSER_SESSION_DIALOG_SX } from '../BrowserSessionButton';
import { loopPlugins } from '../../../presets';

afterEach(cleanup);

const status = (
  over: Partial<BrowserSessionStatus> = {},
): BrowserSessionStatus => ({
  provider: 'linkedin',
  name: 'LinkedIn',
  server: 'linkedin',
  offered: true,
  state: 'none',
  signingIn: false,
  ...over,
});

const answer = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('the session the chat asks for', () => {
  it('offers Sign in while the server is used and no live session is held', () => {
    expect(offersSignIn(status(), false)).toBe(true);
    expect(offersSignIn(status({ state: 'expired' }), false)).toBe(true);
    expect(offersSignIn(status({ state: 'signed-in' }), false)).toBe(false);
    expect(offersSignIn(status({ offered: false }), false)).toBe(false);
    expect(offersSignIn(status(), true)).toBe(false);
    expect(offersSignIn(undefined, false)).toBe(false);
  });

  it('lands a click on the drawn page where it is on the runtime’s page', () => {
    expect(pagePoint({ x: 320, y: 200 }, { width: 640, height: 400 })).toEqual({
      x: 640,
      y: 400,
    });
  });

  it('asks the runtime’s route with the person’s token', async () => {
    const fetcher = vi.fn(async () => answer({ page: {} }));
    await stepSession(
      {
        serverUrl: 'https://r1.example/runtime/',
        token: 'T',
        fetcher: fetcher as never,
      },
      'linkedin',
      { kind: 'type', text: 'me@example.com' },
    );
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://r1.example/runtime/api/v1/configure/browser-sessions/linkedin/type',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'me@example.com' });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer T',
    );
  });

  it('is in the preset, in the chat’s title bar', () => {
    const names = loopPlugins().map(
      plugin => (plugin as unknown as { name?: string }).name,
    );
    expect(names).toContain(BROWSER_SESSION_PLUGIN_NAME);
  });
});

function draw(
  given: BrowserSessionStatus,
): ReturnType<typeof vi.fn> & { calls?: unknown } {
  const fetcher = vi.fn(async (url: string) =>
    url.endsWith('/start')
      ? answer({ page: { url: 'https://www.linkedin.com/login' } })
      : url.endsWith('/screenshot')
        ? new Response(new Blob(['png']), { status: 200 })
        : answer(given),
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <ThemeProvider>
      <BaseStyles>
        <BrowserSessionButton
          place={{ serverUrl: 'https://r1.example/runtime', token: 'T' }}
        />
      </BaseStyles>
    </ThemeProvider>,
  );
  return fetcher;
}

describe('the sign-in dialog', () => {
  it('is nearly as wide as the window, not xlarge’s 960 pixels, so the page is read at close to its size (the user, 15 November 2026)', () => {
    expect(BROWSER_SESSION_DIALOG_SX['&&&'].width).toBe(
      'min(1400px, calc(100vw - 32px))',
    );
    expect(BROWSER_SESSION_DIALOG_SX['&&&'].maxHeight).toBe(
      'calc(100vh - 32px)',
    );
  });
});

describe('Sign in to LinkedIn', () => {
  it('is drawn while no session is held, and opens the runtime’s browser at the login', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:page');
    globalThis.URL.revokeObjectURL = vi.fn();
    const fetcher = draw(status());
    const button = await screen.findByRole('button', {
      name: 'Sign in to LinkedIn',
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([url]) => String(url).endsWith('/start')),
      ).toBe(true),
    );
    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('says sign in again when the session ended', async () => {
    draw(status({ state: 'expired' }));
    expect(
      await screen.findByRole('button', { name: 'Sign in to LinkedIn again' }),
    ).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('says signed in once signed in, and Sign in is no longer offered', async () => {
    const fetcher = draw(status({ state: 'signed-in' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'LinkedIn: signed in' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Sign in to LinkedIn' }),
    ).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('the session pasted in Settings › LinkedIn (the user, 15 November 2026)', () => {
  it('says where the session came from, and Sign out forgets the runtime’s copy alone', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const fetcher = draw(status({ state: 'signed-in', settings: 'used' }));
    const button = await screen.findByRole('button', {
      name: 'LinkedIn: signed in',
    });
    expect(button.getAttribute('title')).toBe(
      'Signed in with your LinkedIn session from Settings › LinkedIn.',
    );
    fireEvent.click(button);
    expect(
      await screen.findByText(/stays there, for your next runtime/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith('/browser-sessions/linkedin') &&
            (init as RequestInit | undefined)?.method === 'DELETE',
        ),
      ).toBe(true),
    );
    vi.unstubAllGlobals();
  });

  it('says it no longer works when LinkedIn refused it, and keeps Sign in', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:page');
    globalThis.URL.revokeObjectURL = vi.fn();
    const notice =
      'Your LinkedIn session in Settings no longer works: paste a new one.';
    draw(status({ settings: 'refused', notice }));
    const button = await screen.findByRole('button', {
      name: 'Sign in to LinkedIn',
    });
    expect(button.getAttribute('title')).toBe(notice);
    expect(button.getAttribute('data-browser-session-settings')).toBe(
      'refused',
    );
    fireEvent.click(button);
    expect(await screen.findByText(new RegExp(notice))).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
