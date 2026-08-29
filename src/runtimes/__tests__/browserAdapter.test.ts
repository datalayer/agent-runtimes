/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The browser harness, seen through the protocol interface.
 *
 * A chat component subscribes to an adapter and renders what it emits. That is
 * the whole contract, and it is what lets `<ChatFloating>` show an agent whose
 * loop runs in the page without knowing that it does — so the events have to
 * be the ones the other adapters emit, in the same shapes.
 *
 * The model is a stub here. What is under test is the translation from the
 * SDK's stream to protocol events, not the SDK.
 */

import { describe, expect, it, vi } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { BrowserAgentAdapter } from '../../protocols/BrowserAgentAdapter';
import type { ChatMessage } from '../../types/messages';
import type { FrontendToolDefinition } from '../../types/tools';

/** A user message, as the chat would hand one over. */
function userMessage(content: string): ChatMessage {
  return {
    id: 'user-1',
    role: 'user',
    content,
    createdAt: new Date(0),
  };
}

/**
 * A model that replays a fixed stream, a different one per step.
 *
 * Per step, because the loop calls the model again after a tool runs: a stub
 * that replayed one tool call every time would be asked for it twenty-four
 * times and stop only at the step ceiling.
 */
function modelStreaming(...steps: unknown[][]) {
  let step = 0;
  return new MockLanguageModelV4({
    doStream: async () => {
      const chunks = steps[Math.min(step, steps.length - 1)];
      step += 1;
      return { stream: simulateReadableStream({ chunks: chunks as never[] }) };
    },
  });
}

/** The provider-level usage shape, which is nested rather than flat. */
const FINISH = {
  type: 'finish',
  finishReason: 'stop',
  usage: {
    inputTokens: { total: 7, noCache: 7, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 3 },
    totalTokens: 10,
  },
};

/** Run one turn and collect everything the adapter emitted. */
async function turn(
  model: ReturnType<typeof modelStreaming>,
  frontendTools: FrontendToolDefinition[] = [],
  message = 'compact it',
) {
  const adapter = new BrowserAgentAdapter({
    protocol: 'browser-vercel-ai',
    baseUrl: '',
    languageModel: model,
    instructions: 'You shorten notebooks.',
    frontendTools,
  });
  const events: any[] = [];
  adapter.subscribe(event => events.push(event));
  await adapter.connect();
  await adapter.sendMessage(userMessage(message), {
    messages: [userMessage(message)],
  });
  return events;
}

describe('the browser adapter as a protocol adapter', () => {
  it('reports connected without dialling anything', async () => {
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      languageModel: modelStreaming([FINISH]),
    });
    const events: any[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.connect();

    expect(adapter.connectionState).toBe('connected');
    expect(events.map(event => event.type)).toEqual(['connected']);
  });

  it('streams text as a growing assistant message under one id', async () => {
    // The accumulate-and-re-emit shape the other adapters use: the chat
    // replaces the message rather than appending deltas to it.
    const events = await turn(
      modelStreaming([
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: 'Down ' },
        { type: 'text-delta', id: 't', delta: 'to 18 cells.' },
        { type: 'text-end', id: 't' },
        FINISH,
      ]),
    );

    const messages = events.filter(event => event.type === 'message');
    expect(messages.map(event => event.message.content)).toEqual([
      'Down ',
      'Down to 18 cells.',
    ]);
    expect(new Set(messages.map(event => event.message.id)).size).toBe(1);
  });

  it('finishes with a done event carrying the usage', async () => {
    const events = await turn(modelStreaming([FINISH]));
    const done = events.find(event => event.type === 'done');
    expect(done).toBeDefined();
    expect(done.usage).toEqual({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
    });
  });

  it('runs a frontend tool in the page and reports the call and its result', async () => {
    // The claim the whole harness rests on: the notebook tools work here, and
    // the chat sees the same tool-call / tool-result pair it would from a
    // runtime.
    const handler = vi.fn(async () => ({ cells: 31 }));
    const tools: FrontendToolDefinition[] = [
      {
        name: 'readAllCells',
        description: 'Read the notebook.',
        parameters: { type: 'object', properties: {} },
        handler,
      },
    ];

    const events = await turn(
      modelStreaming(
        [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'readAllCells',
            input: '{}',
          },
          { ...FINISH, finishReason: 'tool-calls' },
        ],
        // The step after the tool ran: the model says what it found and stops.
        [
          { type: 'text-start', id: 't' },
          { type: 'text-delta', id: 't', delta: '31 cells.' },
          { type: 'text-end', id: 't' },
          FINISH,
        ],
      ),
      tools,
    );

    expect(handler).toHaveBeenCalledOnce();

    const call = events.find(event => event.type === 'tool-call');
    expect(call.toolCall).toMatchObject({
      toolCallId: 'call-1',
      toolName: 'readAllCells',
      // Terminal, unlike AG-UI's streamed arguments — the chat must not wait
      // for more before rendering it.
      argsComplete: true,
    });

    const result = events.find(event => event.type === 'tool-result');
    expect(result.toolResult).toMatchObject({
      toolCallId: 'call-1',
      success: true,
      result: { cells: 31 },
    });
  });

  it('does not ask to be sent a tool result — the tool already ran', async () => {
    // `sendToolResult` exists because the interface has it. A host that calls
    // it must not break, and must not cause a second execution.
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      languageModel: modelStreaming([FINISH]),
    });
    await expect(adapter.sendToolResult()).resolves.toBeUndefined();
  });

  it('says what went wrong instead of throwing at the chat', async () => {
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      // Neither a model nor an inference endpoint: a misconfiguration a host
      // should see in the chat, not as an unhandled rejection.
    });
    const events: any[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(userMessage('hello'), { messages: [] });

    const error = events.find(event => event.type === 'error');
    expect(error.error.message).toMatch(/inference/i);
    // And the chat is told the turn is over, so it stops showing a spinner.
    expect(events.some(event => event.type === 'done')).toBe(true);
  });
});
