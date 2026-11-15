/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's browser session for an MCP server, as the chat asks the runtime
 * for it (the user, 15 November 2026: "for linkedin, we need to use the
 * embedded browser with the mcp server to allow full access").
 *
 * The runtime's routes (`agent_runtimes.routes.browser_sessions`): the
 * session's state, the runtime's own browser opened at the provider's login,
 * its screenshot, the person's clicks, typing and keys, then *Done*, which
 * keeps the session for the server and starts it again. Pure but for the
 * requests, given or `fetch`.
 *
 * @module apps/plugins/browser-session/browserSession
 */

/** The providers a session is made for. */
export const BROWSER_SESSION_PROVIDERS = ['linkedin'] as const;

export type BrowserSessionProvider = (typeof BROWSER_SESSION_PROVIDERS)[number];

/** The page's size in the runtime's browser, in CSS pixels (`apps/browser.py`). */
export const BROWSER_PAGE = { width: 1280, height: 800 } as const;

/** What the runtime says of a session. */
export type BrowserSessionStatus = {
  provider: string;
  name: string;
  server: string;
  /** Whether the runtime's agents use the provider's server. */
  offered: boolean;
  state: 'signed-in' | 'expired' | 'none';
  /** Why the server cannot run on this runtime, when it cannot: no button then. */
  unavailable?: string;
  /** Whether a sign-in is open in the runtime's browser. */
  signingIn: boolean;
  /** After *Done*: whether the server runs again. */
  restarted?: boolean;
  /**
   * The person's session pasted in Settings › LinkedIn (the user, 15 November
   * 2026), never its value: `used` (the server was started with it),
   * `refused` (LinkedIn deleted it, or sent it to its login), `none`.
   */
  settings?: 'used' | 'refused' | 'none';
  /** What the chat says of it, when it says something: the refused session's words. */
  notice?: string;
};

/** Where the runtime is, and who asks. */
export type BrowserSessionPlace = {
  serverUrl: string;
  token?: string;
  fetcher?: typeof fetch;
};

/** The chat's words for it. */
export const BROWSER_SESSION_WORDS = {
  signIn: (name: string) => `Sign in to ${name}`,
  signInAgain: (name: string) => `Sign in to ${name} again`,
  signedIn: (name: string) => `${name}: signed in`,
  why: (name: string) =>
    `${name}'s tools read and act through your own ${name} session. Sign in on ${name}'s page below, in your runtime's own browser: the session is kept on this runtime alone, never shared, and gone when it ends.`,
  expired: (name: string) =>
    `Your ${name} session has ended: sign in again to read ${name}.`,
  typeHere: 'Type here, then press Send text',
  sendText: 'Send text',
  enter: 'Enter',
  tab: 'Tab',
  back: 'Backspace',
  done: 'Done',
  cancel: 'Cancel',
  signOut: 'Sign out',
  opening: (name: string) => `Opening ${name}…`,
  keeping: 'Keeping your session…',
  kept: (name: string) =>
    `Signed in: the ${name} tools read and act through your session now.`,
  keptNotStarted: (name: string) =>
    `Signed in, and your session is kept; the ${name} server did not start again. Ask again in a moment.`,
  fromSettings: (name: string) =>
    `Signed in with your ${name} session from Settings › ${name}.`,
  signedInHere: (name: string) =>
    `Signed in to ${name} on this runtime: its tools read and act through your session.`,
  settingsRefused: (name: string) =>
    `Your ${name} session in Settings no longer works: paste a new one.`,
  orSignInHere: (name: string) =>
    `Paste a new one in Settings › ${name}, or sign in to ${name} below.`,
  signOutWhat: (name: string) =>
    `Sign out forgets this runtime's copy of your ${name} session and stops the ${name} server. A session you saved in Settings › ${name} stays there, for your next runtime.`,
  close: 'Close',
} as const;

const base = (serverUrl: string) =>
  `${serverUrl.replace(/\/+$/, '')}/api/v1/configure/browser-sessions`;

async function ask(
  place: BrowserSessionPlace,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await (place.fetcher ?? fetch)(
    `${base(place.serverUrl)}${path}`,
    {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(place.token ? { Authorization: `Bearer ${place.token}` } : {}),
        ...(init.headers ?? {}),
      },
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
    };
    throw new Error(
      typeof body.detail === 'string' && body.detail
        ? body.detail
        : `The runtime answered ${response.status}.`,
    );
  }
  return response;
}

async function json<T>(
  place: BrowserSessionPlace,
  path: string,
  init?: RequestInit,
): Promise<T> {
  return (await (await ask(place, path, init)).json()) as T;
}

/** The session's state on the runtime. */
export const sessionStatus = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<BrowserSessionStatus> => json(place, `/${provider}`);

/** Open the provider's login in the runtime's browser. */
export const startSession = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<unknown> => json(place, `/${provider}/start`, { method: 'POST' });

/** The login page as it shows, as an object URL the caller revokes. */
export async function sessionScreenshot(
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<Blob> {
  return (await ask(place, `/${provider}/screenshot`)).blob();
}

/** One of the person's steps on the login page. */
export type BrowserSessionStep =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'type'; text: string }
  | { kind: 'key'; key: string }
  | { kind: 'scroll'; dy: number };

export const stepSession = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
  step: BrowserSessionStep,
): Promise<unknown> => {
  const { kind, ...body } = step;
  return json(place, `/${provider}/${kind}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/** Keep the session, close the browser, start the server again. */
export const finishSession = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<BrowserSessionStatus> =>
  json(place, `/${provider}/finish`, { method: 'POST' });

/** Close the sign-in, keeping nothing. */
export const cancelSession = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<BrowserSessionStatus> =>
  json(place, `/${provider}/cancel`, { method: 'POST' });

/** Forget the session. */
export const forgetSession = (
  place: BrowserSessionPlace,
  provider: BrowserSessionProvider,
): Promise<BrowserSessionStatus> =>
  json(place, `/${provider}`, { method: 'DELETE' });

/**
 * Where a click on the drawn screenshot lands on the runtime's page: scaled
 * from the image's drawn size to the page's.
 */
export function pagePoint(
  click: { x: number; y: number },
  drawn: { width: number; height: number },
): { x: number; y: number } {
  const sx = drawn.width > 0 ? BROWSER_PAGE.width / drawn.width : 1;
  const sy = drawn.height > 0 ? BROWSER_PAGE.height / drawn.height : 1;
  return { x: Math.round(click.x * sx), y: Math.round(click.y * sy) };
}

/** Whether the chat says *signed in*: the server used, a live session, nobody anonymous. */
export function showsSignedIn(
  status: BrowserSessionStatus | undefined,
  anonymous: boolean,
): boolean {
  return Boolean(!anonymous && status?.offered && status.state === 'signed-in');
}

/** Whether the chat offers *Sign in*: the server used, no live session, nobody anonymous. */
export function offersSignIn(
  status: BrowserSessionStatus | undefined,
  anonymous: boolean,
): boolean {
  return Boolean(!anonymous && status?.offered && status.state !== 'signed-in');
}
