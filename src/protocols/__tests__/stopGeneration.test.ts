/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Stopping a turn stops every stream it opened.
 *
 * A turn is rarely one request: each tool result starts a continuation, so by
 * the time somebody reaches for Stop there can be several streams open at
 * once. Each adapter used to keep a single `abortController` field that every
 * request overwrote and every request's `finally` cleared — so a request
 * finishing just after a newer one began would null the newer one's handle,
 * and Stop then had nothing to abort. The visible symptom was a transcript
 * that went on typing itself after the reader had asked it to stop.
 *
 * These tests hold the fix at the level that matters: after `stopGeneration`,
 * no signal belonging to the turn is still unaborted.
 *
 * @module protocols/__tests__/stopGeneration
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AGUIAdapter } from '../AGUIAdapter';
import { A2AAdapter } from '../A2AAdapter';

/**
 * A `fetch` that never finishes, and remembers every signal handed to it.
 *
 * The streams have to still be open when Stop arrives — a request that has
 * already completed proves nothing about aborting one that has not.
 */
function hangingFetch(): {
  signals: AbortSignal[];
  fetch: typeof globalThis.fetch;
} {
  const signals: AbortSignal[] = [];
  const fetch = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
    if (init?.signal) {
      signals.push(init.signal);
    }
    // Never resolves, and never rejects on its own: only the abort ends it.
    return new Promise<Response>(() => {});
  });
  return { signals, fetch: fetch as unknown as typeof globalThis.fetch };
}

describe('stopGeneration aborts every in-flight request', () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('aborts overlapping AG-UI streams, not just the newest', async () => {
    const { signals, fetch } = hangingFetch();
    globalThis.fetch = fetch;

    const adapter = new AGUIAdapter({
      type: 'ag-ui',
      baseUrl: 'http://localhost:9999/api/v1/ag-ui/default',
    } as never);

    // Two overlapping requests — a turn and the continuation a tool result
    // would start. Deliberately not awaited: both must still be open.
    void adapter.sendMessage('first').catch(() => {});
    void adapter.sendMessage('second').catch(() => {});
    await Promise.resolve();

    expect(signals).toHaveLength(2);
    expect(signals.some(signal => signal.aborted)).toBe(false);

    adapter.stopGeneration();

    // Both, which is the whole point: before the fix the first was orphaned
    // the moment the second replaced it in the single field.
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });

  it('gives A2A a stopGeneration at all', async () => {
    const { signals, fetch } = hangingFetch();
    globalThis.fetch = fetch;

    const adapter = new A2AAdapter({
      type: 'a2a',
      baseUrl: 'http://localhost:9999',
    } as never);

    // This adapter had no `stopGeneration`, so `ChatBase` — which looks for it
    // by name — fell through to asking the backend to cancel and left the
    // client's own stream running.
    expect(typeof adapter.stopGeneration).toBe('function');

    void adapter.sendMessage('first').catch(() => {});
    void adapter.sendMessage('second').catch(() => {});
    await Promise.resolve();

    expect(signals.length).toBeGreaterThan(0);
    adapter.stopGeneration();
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
});
