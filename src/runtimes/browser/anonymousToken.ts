/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A token for a visitor who has not signed in.
 *
 * The inference service admits members only — a page cannot hold an AWS
 * credential, so completions go through a service that does, and that service
 * has to know who is spending. A public landing page has nobody to name, which
 * is why an in-page agent there answered every request with 401.
 *
 * `POST /anonymous/token` is the service's answer: a token worth about a
 * minute of inference, no user attached, no other route, and no way to renew
 * it. This module is the client for it — mint one, use it, mint another before
 * it dies.
 *
 * Short on purpose, and that shapes the code: a token this brief cannot be
 * fetched once at startup, so the hook keeps a timer rather than a value.
 *
 * @module runtimes/browser/anonymousToken
 */

import { useEffect, useRef, useState } from 'react';

/** What the service hands back. */
type AnonymousTokenResponse = {
  token?: string;
  expires_in?: number;
};

/** A minted token and the moment it stops being worth sending. */
export type AnonymousToken = {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

/**
 * How early to replace one.
 *
 * Renewing exactly at expiry guarantees a race: the request carrying the old
 * token is still in flight when it dies. Ten seconds is longer than any
 * completion takes to *start*, which is the part that authenticates.
 */
const RENEW_MARGIN_MS = 10_000;

/** The floor on the renewal timer, so a misconfigured TTL cannot spin. */
const MIN_RENEW_MS = 5_000;

/** Mint one. Throws if the service refuses. */
export async function fetchAnonymousToken(
  inferenceUrl: string,
  signal?: AbortSignal,
): Promise<AnonymousToken> {
  const base = inferenceUrl.replace(/\/+$/, '');
  const response = await fetch(`${base}/api/ai-inference/v1/anonymous/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  return {
    token: body.token,
    expiresAt: Date.now() + (body.expires_in ?? 60) * 1000,
  };
}

/**
 * Keep an anonymous token current for as long as it is wanted.
 *
 * Returns `undefined` until the first one arrives, which is the honest answer:
 * a caller that sent a request in the meantime would have been refused anyway.
 *
 * @param inferenceUrl Where the service is.
 * @param enabled False when there is a signed-in member, whose own token is
 *   better in every way — it names them, it is metered to them, and it does
 *   not expire in a minute.
 */
export function useAnonymousInferenceToken(
  inferenceUrl: string,
  enabled: boolean,
): string | undefined {
  const [token, setToken] = useState<string>();
  // Read by the timer without making the timer depend on it.
  const failures = useRef(0);

  useEffect(() => {
    if (!enabled || !inferenceUrl) {
      setToken(undefined);
      return undefined;
    }

    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const renew = async () => {
      try {
        const minted = await fetchAnonymousToken(
          inferenceUrl,
          controller.signal,
        );
        if (cancelled) {
          return;
        }
        failures.current = 0;
        setToken(minted.token);
        const lifetime = minted.expiresAt - Date.now() - RENEW_MARGIN_MS;
        timer = window.setTimeout(renew, Math.max(MIN_RENEW_MS, lifetime));
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        /*
         * Backed off rather than retried immediately. The endpoint is rate
         * limited — it is open to anyone, so it has to be — and a page that
         * hammered it after a refusal would earn itself a longer refusal.
         */
        failures.current += 1;
        const backoff = Math.min(30_000, 1_000 * 2 ** failures.current);
        console.warn('[anonymousToken] could not mint a token', error);
        timer = window.setTimeout(renew, backoff);
      }
    };

    void renew();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [inferenceUrl, enabled]);

  return token;
}

export default useAnonymousInferenceToken;
