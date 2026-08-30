/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The anonymous key, and the clock read off it.
 *
 * Two rules hold this together. The deadline comes out of the **token**, not
 * from a constant beside it: the service decides how long it will sign a key
 * for, and a page that assumed a number would draw a countdown that disagreed
 * with the 401 ending it. And there is **one key** — no renewal loop, because
 * a clock that resets never reaches the moment the workspace asks the visitor
 * to sign in, which is the only reason to show one.
 *
 * The lifetime is taken as `exp - iat` rather than as `exp` against this
 * machine's clock. Both claims are written by the issuer at the same instant,
 * so their difference is a duration nothing can distort; an absolute `exp` on
 * a laptop running ten minutes fast expires a key before it was issued.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anonymousTimeLeft,
  readJwtClaims,
  tokenLifetimeMs,
  useAnonymousSessionStore,
} from '../anonymousToken';

const URL = 'https://inference.example';

/** The TTL the service is configured with, as it actually answers today. */
const KEY_TTL_S = 60;

let minted = 0;

/** A JWT with the claims this module reads, and a signature nobody checks. */
function jwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

/** The service, answering the way prod does: a JWT plus `expires_in`. */
function respondWithKeys(ttlSeconds = KEY_TTL_S) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const issuedAt = Math.floor(Date.now() / 1000);
      minted += 1;
      return {
        ok: true,
        json: async () => ({
          token: jwt({
            sub: `anonymous:${minted}`,
            iat: issuedAt,
            exp: issuedAt + ttlSeconds,
          }),
          expires_in: ttlSeconds,
          token_type: 'Bearer',
        }),
      };
    }),
  );
}

/** Let the pending mint settle without advancing the clock. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  minted = 0;
  vi.useFakeTimers();
  respondWithKeys();
  useAnonymousSessionStore.getState().clear();
});

afterEach(() => {
  useAnonymousSessionStore.getState().clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('reading the token', () => {
  it('takes the lifetime from the claims, not from the response beside them', () => {
    // `exp` is what the service enforces. `expires_in` is a second opinion,
    // and when they disagree the token is the one that decides the 401.
    const token = jwt({ iat: 1_000_000, exp: 1_000_300 });
    expect(tokenLifetimeMs(token, 60)).toBe(300_000);
  });

  it('is unmoved by a wrong clock on this machine', () => {
    // The regression an absolute `exp` would cause: the token was issued a
    // moment ago and is good for five minutes, but this laptop believes it is
    // an hour earlier than the issuer does. A duration cannot express that
    // confusion; a timestamp difference can, and would have said the key was
    // already dead.
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const issuedAt = 1_800_000_000;
    const token = jwt({ iat: issuedAt, exp: issuedAt + 300 });
    expect(tokenLifetimeMs(token)).toBe(300_000);
  });

  it('falls back to expires_in for a token that is not one', () => {
    // An opaque token should degrade to the number beside it rather than
    // throwing inside a header.
    expect(tokenLifetimeMs('not-a-jwt', 45)).toBe(45_000);
    expect(readJwtClaims('not-a-jwt')).toBeUndefined();
    expect(readJwtClaims('a.b.c')).toBeUndefined();
  });

  it('falls back again when nothing says anything', () => {
    expect(tokenLifetimeMs('not-a-jwt')).toBe(60_000);
    // Claims that make no sense are not claims: an `exp` at or before `iat`
    // would otherwise produce a key that is born expired.
    expect(tokenLifetimeMs(jwt({ iat: 100, exp: 100 }), 30)).toBe(30_000);
  });
});

describe('starting a session', () => {
  it('counts down to what the token itself declares', async () => {
    const startedAt = Date.now();
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    const session = useAnonymousSessionStore.getState();
    expect(session.status).toBe('active');
    expect(session.token).toBeTruthy();
    expect(session.expiresAt).toBe(startedAt + KEY_TTL_S * 1000);
    expect(session.grantedMs).toBe(KEY_TTL_S * 1000);
  });

  it('follows the service when it signs for longer', async () => {
    // The one knob that matters is server-side —
    // `DATALAYER_ANONYMOUS_TOKEN_TTL_SECONDS` — and raising it must be the
    // whole change. Nothing in the page should need editing to agree.
    respondWithKeys(600);
    const startedAt = Date.now();
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    expect(useAnonymousSessionStore.getState().expiresAt).toBe(
      startedAt + 600_000,
    );
  });

  it('gives a visitor one key however many times it is asked for', async () => {
    // Every consumer may call `start` — the chat does it in an effect that
    // re-runs — and a second key on the next render is a trial that never
    // ends.
    const store = useAnonymousSessionStore.getState();
    store.start(URL);
    store.start(URL);
    await settle();
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    expect(minted).toBe(1);
  });

  it('does not ask a host with nowhere to ask', () => {
    useAnonymousSessionStore.getState().start('');
    expect(useAnonymousSessionStore.getState().status).toBe('idle');
    expect(minted).toBe(0);
  });
});

describe('when the key expires', () => {
  it('stops, and gives the key up', async () => {
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    await vi.advanceTimersByTimeAsync(KEY_TTL_S * 1000 + 1000);

    const session = useAnonymousSessionStore.getState();
    expect(session.status).toBe('expired');
    // Handing the token back afterwards would let the chat keep sending it —
    // the service would refuse, and the refusal reads as a broken agent rather
    // than as the trial being over.
    expect(session.token).toBeUndefined();
  });

  it('does not quietly mint another', async () => {
    useAnonymousSessionStore.getState().start(URL);
    await settle();
    await vi.advanceTimersByTimeAsync(KEY_TTL_S * 1000 + 1000);

    useAnonymousSessionStore.getState().start(URL);
    await settle();

    expect(minted).toBe(1);
    expect(useAnonymousSessionStore.getState().status).toBe('expired');
  });

  it('can be ended early by whoever notices first', async () => {
    // A backgrounded tab throttles `setTimeout`; the countdown on screen
    // recomputes from the wall clock and gets there first. Either may call it,
    // and the second call must be a no-op.
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    useAnonymousSessionStore.getState().expire();
    useAnonymousSessionStore.getState().expire();

    expect(useAnonymousSessionStore.getState().status).toBe('expired');
  });
});

describe('when somebody signs in', () => {
  it('drops the key and cancels its timer', async () => {
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    useAnonymousSessionStore.getState().clear();
    expect(useAnonymousSessionStore.getState().status).toBe('idle');
    expect(useAnonymousSessionStore.getState().token).toBeUndefined();

    // A member who signed in must not find their session marked expired a
    // minute later by a timer nobody cancelled.
    await vi.advanceTimersByTimeAsync(5 * KEY_TTL_S * 1000);
    expect(useAnonymousSessionStore.getState().status).toBe('idle');
  });
});

describe('when the service refuses', () => {
  it('tries once more, backed off, and then stops', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })),
    );
    useAnonymousSessionStore.getState().start(URL);
    await settle();

    expect(useAnonymousSessionStore.getState().status).toBe('failed');
    expect(useAnonymousSessionStore.getState().error).toMatch(/429/);
    // Not retried at once: the endpoint is open to anyone and therefore rate
    // limited, and hammering it earns a longer refusal.
    const attempts = () =>
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(attempts()).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(attempts()).toBe(2);

    // And no third: one retry covers a service that was briefly unreachable
    // without turning a refusal into a loop.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts()).toBe(2);
  });

  it('recovers when the retry lands', async () => {
    const refuse = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    vi.stubGlobal('fetch', refuse);
    useAnonymousSessionStore.getState().start(URL);
    await settle();
    expect(useAnonymousSessionStore.getState().status).toBe('failed');

    respondWithKeys();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(useAnonymousSessionStore.getState().status).toBe('active');
  });
});

describe('reading the clock', () => {
  it('never reports a negative remainder', () => {
    const now = 1_000_000;
    expect(anonymousTimeLeft({ expiresAt: now + 5_000 }, now)).toBe(5_000);
    expect(anonymousTimeLeft({ expiresAt: now - 5_000 }, now)).toBe(0);
    // Nothing to count is nothing left, not `NaN` in a header.
    expect(anonymousTimeLeft({}, now)).toBe(0);
  });
});
