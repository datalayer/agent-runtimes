/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A run's stream that closes before the run said how it ended is an error.
 *
 * A Preview run on Datalayer (PAP browser pass, 2026-10-12) gave no answer
 * for minutes: the page waited for an end the stream was never going to
 * carry. A stream that closes without `RUN_FINISHED` or `RUN_ERROR` now ends
 * the turn with an error the page shows; one that says how it ended does not.
 *
 * @module protocols/__tests__/runCutShort
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AGUIAdapter, RUN_CUT_SHORT } from '../AGUIAdapter';

/** A `fetch` answering one SSE stream made of `events`, then closing. */
function streamingFetch(events: Record<string, unknown>[]) {
  const body = events
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');
  return vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
  ) as unknown as typeof globalThis.fetch;
}

async function errorsOf(events: Record<string, unknown>[]): Promise<string[]> {
  globalThis.fetch = streamingFetch(events);
  const adapter = new AGUIAdapter({
    type: 'ag-ui',
    baseUrl: 'http://localhost:9999/api/v1/ag-ui/default',
  } as never);
  const errors: string[] = [];
  adapter.subscribe(event => {
    if (event.type === 'error') {
      errors.push(event.error?.message ?? '');
    }
  });
  await adapter.sendMessage('Has my Ridge Jacket arrived?').catch(() => {});
  return errors;
}

describe('a run that does not say how it ended', () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('ends the turn with an error when the stream closes after RUN_STARTED alone', async () => {
    expect(
      await errorsOf([{ type: 'RUN_STARTED', threadId: 't', runId: 'r' }]),
    ).toEqual([RUN_CUT_SHORT]);
  });

  it('says nothing more when the run finished', async () => {
    expect(
      await errorsOf([
        { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
        { type: 'RUN_FINISHED', threadId: 't', runId: 'r' },
      ]),
    ).toEqual([]);
  });

  it("shows the run's own error once, not a second one", async () => {
    expect(
      await errorsOf([
        { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
        { type: 'RUN_ERROR', message: 'The MCP server `pap_x` did not open' },
      ]),
    ).toEqual(['The MCP server `pap_x` did not open']);
  });
});
