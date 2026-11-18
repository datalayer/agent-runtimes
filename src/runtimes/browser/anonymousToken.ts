/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A key for a visitor who has not signed in, and the clock on it.
 *
 * The inference service admits members only — a page cannot hold an AWS
 * credential, so completions go through a service that does, and that service
 * has to know who is spending. A public landing page has nobody to name, which
 * is why an in-page agent there answered every request with 401.
 *
 * `POST /anonymous/token` is the service's answer: a short-lived token, no user
 * attached, no other route, and no way to renew it. This module is the client
 * for it.
 *
 * **One key, and the key says when it dies.** No renewal loop: renewing on a
 * timer would give an anonymous visitor unmetered access to a members-only
 * service with nothing on screen admitting it, and a clock that resets never
 * reaches the moment where the workspace asks them to sign in — which is the
 * whole point of showing one.
 *
 * **The deadline is read out of the token, not calculated beside it.** The JWT
 * carries `exp`, and that claim is what the service will actually enforce; an
 * `expires_in` counted against this machine's clock is a second opinion, and
 * the two disagree whenever anything sits between them. What is taken from the
 * token is its *lifetime* — `exp - iat`, both from the same issuer at the same
 * instant — and that is added to the local clock. A duration is immune to the
 * skew an absolute timestamp is not: a visitor whose laptop is ten minutes
 * fast would otherwise be told their key expired before it was issued.
 *
 * The trial is an offer, not a boundary. It lives in a page, so a reload or a
 * switch of target gets another key, and nothing here pretends otherwise:
 * what actually limits anonymous use is the service, which rate limits the
 * mint endpoint precisely because it is open to anyone. Spending effort making
 * this side harder to reset would buy nothing the server does not already own.
 *
 * How long a key lives is the service's to decide —
 * `DATALAYER_ANONYMOUS_TOKEN_TTL_SECONDS`, sixty seconds by default. Nothing
 * here assumes a number; whatever is signed is what is counted.
 *
 * A shared session rather than a hook's private state, because three things
 * need the same answer: the chat, which sends the token; the timer in the
 * chat header, which draws what is left of it; and the panel that takes over
 * when it is gone. Three hooks would have minted three keys.
 *
 * @module runtimes/browser/anonymousToken
 */

import { useEffect } from 'react';
import { create } from 'zustand';

/** What the service hands back. */
type AnonymousTokenResponse = {
  token?: string;
  expires_in?: number;
};

/** A minted token and the moment it stops being worth sending. */
export type AnonymousToken = {
  token: string;
  /** Epoch milliseconds, from the token's own lifetime plus the local clock. */
  expiresAt: number;
  /** How long the service signed it for, as the token itself declares. */
  lifetimeMs: number;
};

/** Where an anonymous visitor's access has got to. */
export type AnonymousSessionStatus =
  /** Nobody has asked for a key — the usual case, because somebody is signed in. */
  | 'idle'
  /** Asked for, not yet answered. */
  | 'minting'
  /** Held, and still worth sending. */
  | 'active'
  /** Spent. The agent will be refused from here on. */
  | 'expired'
  /** The service would not issue one. */
  | 'failed';

export type AnonymousSession = {
  status: AnonymousSessionStatus;
  /** The key, while it is worth sending. */
  token?: string;
  /**
   * Epoch milliseconds at which the key stops being honoured.
   *
   * Read out of the token — see {@link tokenLifetimeMs} — rather than assumed,
   * so a service that signs keys for five minutes is counted for five minutes
   * without anything here being changed.
   */
  expiresAt?: number;
  /** How long the key was signed for, so a countdown can draw a proportion. */
  grantedMs?: number;
  /** Why there is no key, when the service refused. */
  error?: string;
};

type AnonymousSessionStore = {
  /**
   * The keys this page holds, one per thing it runs (`visitorFor`): a team,
   * a scene, an application, a Battle. Each is minted, counted down and
   * spent apart, since ai-inference serves a key the models of what it names.
   */
  sessions: Record<string, KeyedSession>;
  /**
   * Get a key for `visitorFor`, if this visitor has not had one for it.
   *
   * Idempotent by design: every consumer may call it, and a session already
   * under way — or already spent — is left exactly as it is. Spent in
   * particular: minting again on the next render is how a trial that is
   * supposed to end becomes one that never does. Nothing is asked for
   * nothing: a key always names what it is for.
   */
  start: (inferenceUrl: string, visitorFor: string) => void;
  /**
   * Declare the key for `visitorFor` spent, now.
   *
   * Called by the store's own timer, and by anything that can see the clock
   * has passed — a countdown on screen recomputes from the wall clock every
   * tick, where a `setTimeout` in a background tab is only ever late.
   */
  expire: (visitorFor: string) => void;
  /** Give the keys up — `visitorFor`'s, or every one. Called when a member signs in, whose token is better. */
  clear: (visitorFor?: string) => void;
};

/** One key's session, and whether its one retry has been spent, so a refusal cannot loop. */
type KeyedSession = AnonymousSession & { retried?: boolean };

/** A key nobody has asked for. */
const IDLE: AnonymousSession = { status: 'idle' };

/**
 * What to assume when a token says nothing about its own life.
 *
 * Matches the service's default, and is kept in step with it. Only reached for
 * a token that is neither a JWT with the claims to read nor accompanied by an
 * `expires_in` — which the service has never sent, so this is a floor under a
 * bug rather than a policy.
 */
const DEFAULT_TTL_MS = 300_000;

/** How long to wait before trying again when the service refuses. */
const RETRY_MS = 3_000;

/**
 * The expiry timers, one per key, module-scoped because the store is.
 *
 * Held outside the state so that clearing a session can cancel its timer — a
 * timer left running would mark a signed-in member's session expired a
 * minute after they signed in.
 */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelTimer(visitorFor: string): void {
  clearTimeout(pendingTimers.get(visitorFor));
  pendingTimers.delete(visitorFor);
}

/** The claims this module reads. Everything else in the token is the service's. */
type JwtClaims = {
  /** Seconds since the epoch, issuer's clock. */
  exp?: number;
  iat?: number;
};

/**
 * Read a JWT's claims without verifying it.
 *
 * Deliberately unverified, and safe to be: this is the page reading the
 * expiry off a key it was just handed, so it can draw a countdown. Nothing is
 * authorised on the strength of it — the service verifies the signature on
 * every request, and a visitor who forged a longer `exp` would only be lying
 * to their own clock.
 *
 * Returns nothing for anything that is not a three-part JWT with a JSON
 * payload, so an opaque token degrades to the `expires_in` beside it rather
 * than throwing in a header.
 */
export function readJwtClaims(token: string): JwtClaims | undefined {
  const payload = token.split('.')[1];
  if (!payload) {
    return undefined;
  }
  try {
    // base64url → base64, then padded: `atob` accepts neither `-`/`_` nor a
    // missing tail, and JWTs are written with both.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const claims = JSON.parse(atob(padded)) as unknown;
    return claims && typeof claims === 'object'
      ? (claims as JwtClaims)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * How long a freshly issued token is good for, in milliseconds.
 *
 * `exp - iat` first: both claims come from the issuer, at the same instant, so
 * their difference is a duration that no clock anywhere can distort. It is
 * also the only source that is certainly the truth, because `exp` is the claim
 * the service enforces.
 *
 * `expires_in` is the fallback, for a token that is not a JWT or carries no
 * `iat`. An absolute `exp` against the local clock is deliberately *not* in
 * this chain: on a machine whose clock is minutes out it produces a key that
 * appears to expire before it was issued, which is worse than either.
 */
export function tokenLifetimeMs(
  token: string,
  expiresInSeconds?: number,
): number {
  const claims = readJwtClaims(token);
  if (claims?.exp && claims?.iat && claims.exp > claims.iat) {
    return (claims.exp - claims.iat) * 1000;
  }
  if (expiresInSeconds && expiresInSeconds > 0) {
    return expiresInSeconds * 1000;
  }
  return DEFAULT_TTL_MS;
}

/**
 * What a key is asked for with (18 November 2026): what it is for. A team, a
 * scene, an application — an example's id, `at:<slug>`, `library:<uid>` —
 * is the service's `app`; `battle:<id>` is the catalogue Battle it is played
 * for, its `battle`.
 */
export function anonymousTokenRequest(visitorFor: string): {
  app?: string;
  battle?: string;
} {
  return visitorFor.startsWith(BATTLE_PREFIX)
    ? { battle: visitorFor.slice(BATTLE_PREFIX.length) }
    : { app: visitorFor };
}

/** What `visitorFor` says to name a Battle. */
const BATTLE_PREFIX = 'battle:';

/**
 * Mint one for `visitorFor`. Throws if the service refuses, or for nothing.
 *
 * The moment it dies is read off the token itself; see {@link tokenLifetimeMs}.
 */
export async function fetchAnonymousToken(
  inferenceUrl: string,
  visitorFor: string,
  signal?: AbortSignal,
): Promise<AnonymousToken> {
  if (!visitorFor) {
    throw new Error("A visitor's key names what it is for.");
  }
  const base = inferenceUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/ai-inference/v1/anonymous/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(anonymousTokenRequest(visitorFor)),
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Anonymous inference token refused by ${base} (HTTP ${response.status})`,
    );
  }
  const body = (await response.json()) as AnonymousTokenResponse;
  if (!body.token) {
    throw new Error(`No token in the reply from ${base}`);
  }
  const lifetimeMs = tokenLifetimeMs(body.token, body.expires_in);
  return {
    token: body.token,
    lifetimeMs,
    expiresAt: Date.now() + lifetimeMs,
  };
}

/** The session the store holds for `visitorFor`: `idle` when none was asked for. */
export function anonymousSessionOf(
  state: Pick<AnonymousSessionStore, 'sessions'>,
  visitorFor: string,
): AnonymousSession {
  return state.sessions[visitorFor] ?? IDLE;
}

export const useAnonymousSessionStore = create<AnonymousSessionStore>(
  (set, get) => {
    const of = (visitorFor: string): KeyedSession =>
      get().sessions[visitorFor] ?? IDLE;
    const put = (visitorFor: string, session: KeyedSession) =>
      set(state => ({
        sessions: { ...state.sessions, [visitorFor]: session },
      }));

    /** Ask for a key, and arrange for the end of it. */
    const mint = (inferenceUrl: string, visitorFor: string) => {
      put(visitorFor, {
        ...of(visitorFor),
        status: 'minting',
        error: undefined,
      });
      void fetchAnonymousToken(inferenceUrl, visitorFor)
        .then(minted => {
          // Somebody signed in while the request was in flight; their token is
          // the better one and this session was already cleared.
          if (of(visitorFor).status !== 'minting') {
            return;
          }
          put(visitorFor, {
            ...of(visitorFor),
            status: 'active',
            token: minted.token,
            // Both straight from the token: when it dies, and how long it was
            // given — which is what a countdown needs to draw a proportion
            // rather than just a number.
            expiresAt: minted.expiresAt,
            grantedMs: minted.lifetimeMs,
            error: undefined,
          });

          cancelTimer(visitorFor);
          /*
           * The store expires itself rather than waiting to be told.
           *
           * The countdown in the header would do it, but only while it is
           * mounted — and a workspace whose chat header is hidden would then
           * go on sending a dead key and reading the 401 as the agent being
           * broken.
           */
          pendingTimers.set(
            visitorFor,
            setTimeout(
              () => get().expire(visitorFor),
              Math.max(0, minted.expiresAt - Date.now()),
            ),
          );
        })
        .catch((error: unknown) => {
          if (of(visitorFor).status !== 'minting') {
            return;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn('[anonymousToken] could not mint a token', error);
          /*
           * One more attempt, backed off.
           *
           * The endpoint is open to anyone and therefore rate limited, and a
           * page that hammered it after a refusal would earn itself a longer
           * one. A single retry covers the case worth covering — a service
           * that was briefly unreachable — without turning a refusal into a
           * loop.
           */
          const firstFailure = !of(visitorFor).retried;
          put(visitorFor, {
            ...of(visitorFor),
            status: 'failed',
            error: message,
            retried: true,
          });
          if (firstFailure) {
            cancelTimer(visitorFor);
            pendingTimers.set(
              visitorFor,
              setTimeout(() => {
                if (of(visitorFor).status === 'failed') {
                  mint(inferenceUrl, visitorFor);
                }
              }, RETRY_MS),
            );
          }
        });
    };

    return {
      sessions: {},

      start: (inferenceUrl: string, visitorFor: string) => {
        // Minting, live, retrying, or spent: all four already have their
        // answer. Only a visitor who has never asked gets a key, which is what
        // stops one being handed out again on the next render.
        if (!inferenceUrl || !visitorFor || of(visitorFor).status !== 'idle') {
          return;
        }
        mint(inferenceUrl, visitorFor);
      },

      expire: (visitorFor: string) => {
        const { status } = of(visitorFor);
        if (status === 'idle' || status === 'expired') {
          return;
        }
        cancelTimer(visitorFor);
        // The token goes with the status: anything still holding a reference
        // to this session must not be able to send a key the service will
        // refuse.
        put(visitorFor, {
          ...of(visitorFor),
          status: 'expired',
          token: undefined,
        });
      },

      clear: (visitorFor?: string) => {
        if (visitorFor === undefined) {
          for (const key of pendingTimers.keys()) {
            cancelTimer(key);
          }
          set({ sessions: {} });
          return;
        }
        if (!get().sessions[visitorFor]) {
          return;
        }
        cancelTimer(visitorFor);
        set(state => {
          const { [visitorFor]: _dropped, ...rest } = state.sessions;
          return { sessions: rest };
        });
      },
    };
  },
);

/** Read the session for `visitorFor` without touching it. For anything that only draws it. */
export function useAnonymousSession(visitorFor: string): AnonymousSession {
  // The session object itself, stable until it changes: a selector building a
  // new object each render is a loop under `useSyncExternalStore`.
  return useAnonymousSessionStore(state => state.sessions[visitorFor] ?? IDLE);
}

/**
 * Hold an anonymous key for as long as one is wanted.
 *
 * The driving half: exactly one component per thing a page runs should call
 * this — the chat that would send the token — and everything else that needs
 * to know reads {@link useAnonymousSession} with the same `visitorFor`.
 *
 * @param inferenceUrl Where the service is.
 * @param enabled False when there is a signed-in member, whose own token is
 *   better in every way — it names them, it is metered to them, and it does
 *   not expire. Also false where no in-page agent will ask for inference at
 *   all, so a workspace on a server-backed agent does not burn a trial nobody
 *   is using.
 * @param visitorFor What the key is for (18 November 2026): `team:<id>`,
 *   `scene:<id>`, an application (an example's id, `at:<slug>`,
 *   `library:<uid>`) or `battle:<id>`. ai-inference serves a key the models of
 *   what it names, and mints none for nothing: empty, no key is asked for.
 */
export function useAnonymousInferenceSession(
  inferenceUrl: string,
  enabled: boolean,
  visitorFor: string,
): AnonymousSession {
  const session = useAnonymousSession(visitorFor);

  useEffect(() => {
    const { start, clear } = useAnonymousSessionStore.getState();
    if (enabled && inferenceUrl && visitorFor) {
      start(inferenceUrl, visitorFor);
      return undefined;
    }
    // Somebody signed in, or the workspace moved to an agent that does its own
    // authenticating: the key is not ours to keep holding.
    if (visitorFor) {
      clear(visitorFor);
    }
    return undefined;
  }, [inferenceUrl, enabled, visitorFor]);

  return session;
}

/** How much of the key's life is left, in milliseconds. Never negative. */
export function anonymousTimeLeft(
  session: Pick<AnonymousSession, 'expiresAt'>,
  now = Date.now(),
): number {
  return Math.max(0, (session.expiresAt ?? now) - now);
}

export default useAnonymousInferenceSession;
