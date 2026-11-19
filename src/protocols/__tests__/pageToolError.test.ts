/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A page tool's failure reaches the runtime as AG-UI says it: the tool
 * message's `error`.
 *
 * The continuation a page tool's result starts carries one tool message per
 * call; a failed one has `error` set (the runtime ends a turn whose page tool
 * failed twice), a successful one has none.
 *
 * @module protocols/__tests__/pageToolError
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGUIAdapter } from '../AGUIAdapter';

const RUN = [
  { type: 'RUN_STARTED', threadId: 't', runId: 'r1' },
  {
    type: 'TOOL_CALL_START',
    toolCallId: 'call-1',
    toolCallName: 'set_shop_header',
  },
  {
    type: 'TOOL_CALL_ARGS',
    toolCallId: 'call-1',
    delta: '{"basket":{"value":2}}',
  },
  { type: 'TOOL_CALL_END', toolCallId: 'call-1' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r1' },
];

const DONE = [
  { type: 'RUN_STARTED', threadId: 't', runId: 'r2' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r2' },
];

/** A `fetch` answering each run with the next stream, keeping what was sent. */
function runs(streams: Record<string, unknown>[][], sent: unknown[]) {
  return vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')));
    const events = streams.shift() ?? DONE;
    const body = events
      .map(event => `data: ${JSON.stringify(event)}\n\n`)
      .join('');
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
  }) as unknown as typeof globalThis.fetch;
}

type ToolMessage = {
  role: string;
  tool_call_id?: string;
  content?: unknown;
  error?: string;
};

async function continuationOf(result: {
  success: boolean;
  result?: unknown;
  error?: string;
}): Promise<ToolMessage[]> {
  const sent: Array<{ messages: ToolMessage[] }> = [];
  globalThis.fetch = runs([RUN, DONE], sent);
  const adapter = new AGUIAdapter({
    type: 'ag-ui',
    baseUrl: 'http://localhost:9999/api/v1/ag-ui/default',
  } as never);
  await adapter.sendMessage('Show the basket in the title bar.');
  await adapter.sendToolResult('call-1', { toolCallId: 'call-1', ...result });
  expect(sent).toHaveLength(2);
  return sent[1].messages.filter(message => message.role === 'tool');
}

describe("a page tool's result, sent back", () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('carries the failure as the tool message error', async () => {
    const tools = await continuationOf({
      success: false,
      error: 'set_shop_header failed: Nothing to set.',
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].tool_call_id).toBe('call-1');
    expect(tools[0].error).toBe('set_shop_header failed: Nothing to set.');
    expect(tools[0].content).toBe('set_shop_header failed: Nothing to set.');
  });

  it('carries no error for a tool that answered', async () => {
    const tools = await continuationOf({
      success: true,
      result: { set: ['basket'] },
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].error).toBeUndefined();
    expect(tools[0].content).toBe('{"set":["basket"]}');
  });
});
