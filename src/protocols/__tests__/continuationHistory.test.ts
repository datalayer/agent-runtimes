/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The run a page tool's result starts carries what the model already did.
 *
 * It carried the page's calls alone: the server's calls of the same run —
 * a quote, a catalogue read — and what they answered were dropped, so the
 * model, not seeing its quote, priced the basket again and called the page
 * again, run after run. The continuation now carries the run's calls of the
 * server's tools and their results, as the run streamed them, before the
 * page's.
 *
 * @module protocols/__tests__/continuationHistory
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGUIAdapter } from '../AGUIAdapter';

const QUOTED = '{"items":["pan","knife"],"total":"$39.98"}';

const RUN = [
  { type: 'RUN_STARTED', threadId: 't', runId: 'r1' },
  {
    type: 'TOOL_CALL_START',
    toolCallId: 'quote-1',
    toolCallName: 'quote_basket',
  },
  {
    type: 'TOOL_CALL_ARGS',
    toolCallId: 'quote-1',
    delta: '{"items":["pan","knife"]}',
  },
  { type: 'TOOL_CALL_END', toolCallId: 'quote-1' },
  {
    type: 'TOOL_CALL_RESULT',
    messageId: 'm-quote',
    toolCallId: 'quote-1',
    content: QUOTED,
    role: 'tool',
  },
  {
    type: 'TOOL_CALL_START',
    toolCallId: 'header-1',
    toolCallName: 'set_shop_header',
  },
  {
    type: 'TOOL_CALL_ARGS',
    toolCallId: 'header-1',
    delta: '{"basket":{"value":2}}',
  },
  { type: 'TOOL_CALL_END', toolCallId: 'header-1' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r1' },
];

const DONE = [
  { type: 'RUN_STARTED', threadId: 't', runId: 'r2' },
  { type: 'RUN_FINISHED', threadId: 't', runId: 'r2' },
];

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

type Sent = {
  role: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};

describe('the run a page tool’s result starts', () => {
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('carries the run’s server calls and their results before the page’s', async () => {
    const sent: Array<{ messages: Sent[] }> = [];
    globalThis.fetch = runs([RUN, DONE], sent);
    const adapter = new AGUIAdapter({
      type: 'ag-ui',
      baseUrl: 'http://localhost:9999/api/v1/ag-ui/default',
    } as never);
    await adapter.sendMessage('Put a pan and a knife in a basket.');
    await adapter.sendToolResult('header-1', {
      toolCallId: 'header-1',
      success: true,
      result: { set: ['basket'] },
    });
    expect(sent).toHaveLength(2);
    const messages = sent[1].messages;
    const assistant = messages.filter(message => message.tool_calls?.length);
    expect(assistant).toHaveLength(1);
    expect(assistant[0].tool_calls?.map(call => call.id)).toEqual([
      'quote-1',
      'header-1',
    ]);
    expect(assistant[0].tool_calls?.[0].function).toEqual({
      name: 'quote_basket',
      arguments: '{"items":["pan","knife"]}',
    });
    const tools = messages.filter(message => message.role === 'tool');
    expect(tools.map(message => message.tool_call_id)).toEqual([
      'quote-1',
      'header-1',
    ]);
    // As the run streamed it, word for word: the runtime checks it.
    expect(tools[0].content).toBe(QUOTED);
    expect(tools[1].content).toBe('{"set":["basket"]}');
    // The page's call comes last, after the server's results.
    expect(messages[messages.length - 1].tool_call_id).toBe('header-1');
  });
});
