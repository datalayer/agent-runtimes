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

  it('keeps what the model says after a tool call in its own message', async () => {
    /*
     * A tool-using turn is several text blocks: what the model is about to do,
     * the tool, then what it found. The chat keys on the message id — the same
     * id replaces in place, a new one appends — so carrying one id across the
     * whole turn folded the second half back into the first sentence and
     * pushed the tool cards to the end of the conversation.
     */
    const events = await turn(
      modelStreaming(
        [
          { type: 'text-start', id: 'a' },
          { type: 'text-delta', id: 'a', delta: 'Let me look.' },
          { type: 'text-end', id: 'a' },
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'readAllCells',
            input: '{}',
          },
          { ...FINISH, finishReason: 'tool-calls' },
        ],
        [
          { type: 'text-start', id: 'b' },
          { type: 'text-delta', id: 'b', delta: 'There are 31 cells.' },
          { type: 'text-end', id: 'b' },
          FINISH,
        ],
      ),
      [
        {
          name: 'readAllCells',
          description: 'Read the notebook.',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ cells: 31 }),
        },
      ],
    );

    const messages = events.filter(event => event.type === 'message');
    const ids = [...new Set(messages.map(event => event.message.id))];
    expect(ids).toHaveLength(2);

    // Each block holds only its own text — the second does not carry the first.
    const byId = new Map<string, string>();
    for (const event of messages) {
      byId.set(event.message.id, event.message.content);
    }
    expect([...byId.values()]).toEqual(['Let me look.', 'There are 31 cells.']);

    // And the tool call sits between them, which is what puts its card there.
    const order = events
      .filter(event =>
        ['message', 'tool-call', 'tool-result'].includes(event.type),
      )
      .map(event =>
        event.type === 'message' ? `message:${event.message.id}` : event.type,
      );
    expect(order.indexOf('tool-call')).toBeGreaterThan(
      order.indexOf(`message:${ids[0]}`),
    );
    expect(order.indexOf(`message:${ids[1]}`)).toBeGreaterThan(
      order.indexOf('tool-call'),
    );
  });

  it('gives each turn its own message ids, whatever the provider reuses', async () => {
    /*
     * `text-start` carries a block id unique only *within* a response —
     * commonly "0". Passing it through as the chat's message id meant the
     * second turn replaced the first turn's message instead of appending, so
     * the answer appeared above the question that prompted it.
     */
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      languageModel: modelStreaming([
        // The same block id every time, as a provider is entitled to send.
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: 'An answer.' },
        { type: 'text-end', id: '0' },
        FINISH,
      ]),
    });
    const events: any[] = [];
    adapter.subscribe(event => events.push(event));

    await adapter.sendMessage(userMessage('first'), {
      messages: [userMessage('first')],
    });
    await adapter.sendMessage(userMessage('second'), {
      messages: [userMessage('second')],
    });

    const ids = new Set(
      events
        .filter(event => event.type === 'message')
        .map(event => event.message.id),
    );
    expect(ids.size).toBe(2);
    expect(ids.has('0')).toBe(false);
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

  it('names the host when the inference service cannot be reached', async () => {
    /*
     * The failure a browser agent is most likely to hit, and the one the SDK
     * describes worst: a wrong host fails CORS preflight and surfaces as
     * `TypeError: Failed to fetch` from several libraries deep, naming
     * nothing. The service runs with the control plane; pointed at the
     * runtimes plane it 404s the route before CORS is even considered.
     */
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      inference: {
        inferenceUrl: 'https://wrong-host.example',
        token: 'tok',
        fetch: async () => {
          throw new TypeError('Failed to fetch');
        },
      },
      model: 'bedrock:us.anthropic.claude-sonnet-4-6',
    });
    const events: any[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.sendMessage(userMessage('hello'), { messages: [] });

    const error = events.find(event => event.type === 'error');
    expect(error.error.message).toContain(
      'https://wrong-host.example/api/ai-inference/v1',
    );
    expect(error.error.message).toMatch(/control plane/);
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

describe('stopping a run in flight', () => {
  it('cuts the model call when the chat says stop, and stays connected', async () => {
    // A model that streams nothing and never finishes — until the run is
    // aborted, when it fails the way a cancelled fetch does.
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            abortSignal?.addEventListener('abort', () =>
              controller.error(new DOMException('aborted', 'AbortError')),
            );
          },
        }),
      }),
    });
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      languageModel: model,
    });
    const events: any[] = [];
    adapter.subscribe(event => events.push(event));
    await adapter.connect();
    const run = adapter.sendMessage(userMessage('go'), {
      messages: [userMessage('go')],
    });
    // Let the run reach the model before stopping it.
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(typeof adapter.stopGeneration).toBe('function');
    adapter.stopGeneration();
    await run;
    // Stopped is not failed: no error is reported, and the adapter is still
    // connected for the next message.
    expect(events.some(event => event.type === 'error')).toBe(false);
    expect(adapter.connectionState).toBe('connected');
  });
});
