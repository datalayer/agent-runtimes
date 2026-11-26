/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * How a client keeps the token it sends a runtime current.
 *
 * A runtime answers some of its routes differently to a caller it knows (the
 * agent's spec names its sandbox's Jupyter token to its owner alone) and, in
 * `enforce` mode, refuses them to one it does not. So a token is part of what
 * a read is, and three things go wrong when it is treated as a detail:
 *
 * - a cached read made with one token is shown to another caller, or kept
 *   after the token is gone: the token belongs in the read's identity
 *   ({@link runtimeQueryKey}, {@link useRuntimeQuery});
 * - a callback or a socket's retry made with the token of the render that
 *   created it sends a token since renewed or removed: read it when sending
 *   ({@link useLatestRef});
 * - a token given as a getter, resolved once at render, is frozen there:
 *   keep the getter and call it at each request.
 *
 * The token never enters a key as itself: a key is printed by devtools and
 * may be persisted by a cache plugin. A short fingerprint stands for it
 * ({@link authKey}), the same for the same token and different for another.
 *
 * @module hooks/runtimeAuth
 */

import { useRef, type MutableRefObject } from 'react';
import {
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { runtimeAuthHeaders } from './ownRoutes';

/** What a key says for a read made with no token. */
export const NO_AUTH_KEY = 'auth:none';

/**
 * A short, non-reversible fingerprint of a token, for a query key: two
 * 32-bit FNV-1a hashes of it (with different offsets), never the token.
 */
export function authKey(token?: string | null): string {
  const held = token?.trim();
  if (!held) {
    return NO_AUTH_KEY;
  }
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ held.length;
  for (let i = 0; i < held.length; i += 1) {
    const c = held.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `auth:${a.toString(16).padStart(8, '0')}${b
    .toString(16)
    .padStart(8, '0')}`;
}

/**
 * A query key whose last part is the token's fingerprint. A prefix of it (the
 * parts alone) still matches it, so invalidating `['mcp-config', baseUrl]`
 * reaches every caller's read.
 */
export function runtimeQueryKey<P extends readonly unknown[]>(
  parts: P,
  token: string | null | undefined,
): [...P, string] {
  return [...parts, authKey(token)];
}

/**
 * A ref that always holds the latest value given: what a callback, a timer or
 * a socket's handler reads when it runs, instead of what it closed over.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** What {@link useRuntimeQuery} takes. */
export type RuntimeQueryOptions<T> = Omit<
  UseQueryOptions<T, Error, T, QueryKey>,
  'queryKey' | 'queryFn'
> & {
  /** The read's identity without the caller: the key's parts. */
  key: readonly unknown[];
  /**
   * The token the read is made with: required, so that a read that sends one
   * cannot forget to say so. `undefined` or `null` is a read with none.
   */
  authToken: string | null | undefined;
  /** The read, given the headers that carry the token (none without one). */
  queryFn: (headers: Record<string, string>) => Promise<T>;
};

/**
 * A read of a runtime made with a caller's token: keyed by that token's
 * fingerprint and sent with it. A token given after a refused read reads
 * again; one caller's answer is never another's.
 */
export function useRuntimeQuery<T>(
  options: RuntimeQueryOptions<T>,
): UseQueryResult<T, Error> {
  const { key, authToken, queryFn, ...rest } = options;
  return useQuery<T, Error, T, QueryKey>({
    ...rest,
    queryKey: runtimeQueryKey(key, authToken),
    queryFn: () => queryFn(runtimeAuthHeaders(authToken)),
  });
}
