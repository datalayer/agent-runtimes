/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Every protocol adapter, read by the one conversation reducer (MOBILE
 * M-030): the real adapters fed their wire as their servers send it, what
 * they emit normalised (`conversationEventsOf`) and reduced
 * (`reduceConversation`) — the web chat's message state, whatever protocol
 * its agent speaks.
 *
 * @module protocols/__tests__/adapterConversation
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { AGUIAdapter } from '../AGUIAdapter';
import { A2AAdapter } from '../A2AAdapter';
import { ACPAdapter } from '../ACPAdapter';
import { VercelAIAdapter } from '../VercelAIAdapter';
import { BrowserAgentAdapter } from '../BrowserAgentAdapter';
import {
  BROWSER_LIMITS,
  conversationEventsOf,
  emptyConversation,
  reduceConversation,
  withPrompt,
  type ConversationState,
} from '../../portable';
import { createUserMessage } from '../../types/messages';
import type { ProtocolEvent } from '../../types/protocol';

type Adapter = {
  subscribe: (handler: (event: ProtocolEvent) => void) => () => void;
};

/** The conversation an adapter's events build, after the person's prompt. */
function conversationOf(events: ProtocolEvent[]): ConversationState {
  let state = reduceConversation(
    withPrompt(emptyConversation(BROWSER_LIMITS), 'p', 'hi'),
    { type: 'RUN_STARTED' },
  );
  for (const event of events) {
    for (const input of conversationEventsOf(event, state)) {
      state = reduceConversation(state, input);
    }
  }
  return state;
}

function collect(adapter: Adapter): ProtocolEvent[] {
  const events: ProtocolEvent[] = [];
  adapter.subscribe(event => events.push(event));
  return events;
}

const sse = (events: object[], done = false): string =>
  events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') +
  (done ? 'data: [DONE]\n\n' : '');

function streaming(body: string): typeof fetch {
  return vi.fn(
    async () =>
      new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  ) as unknown as typeof fetch;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('AG-UI', () => {
  it('builds an answer, a tool call with its result, and the answer after it', async () => {
    globalThis.fetch = streaming(
      sse([
        { type: 'RUN_STARTED', threadId: 'th', runId: 'r1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Let me ' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'look.' },
        { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
        { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'search' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"q":"orders"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'c1' },
        {
          type: 'TOOL_CALL_RESULT',
          toolCallId: 'c1',
          content: '{"found": 3}',
        },
        { type: 'TEXT_MESSAGE_START', messageId: 'm2', role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm2', delta: 'Three.' },
        { type: 'TEXT_MESSAGE_END', messageId: 'm2' },
        { type: 'RUN_FINISHED', threadId: 'th', runId: 'r1' },
      ]),
    );
    const adapter = new AGUIAdapter({
      protocol: 'ag-ui',
      baseUrl: 'http://127.0.0.1:1/api/v1/ag-ui/a',
    });
    const events = collect(adapter);
    await adapter.sendMessage(createUserMessage('hi'));
    const state = conversationOf(events);
    expect(state.running).toBe(false);
    expect(state.items).toMatchObject([
      { kind: 'message', role: 'user', text: 'hi' },
      { kind: 'message', id: 'm1', text: 'Let me look.', streaming: false },
      {
        kind: 'tool',
        id: 'c1',
        name: 'search',
        input: { q: 'orders' },
        status: 'complete',
        value: { found: 3 },
      },
      { kind: 'message', id: 'm2', text: 'Three.', streaming: false },
    ]);
  });

  it('keeps a failed run said, and a code error on its call', async () => {
    globalThis.fetch = streaming(
      sse([
        { type: 'RUN_STARTED', threadId: 'th', runId: 'r1' },
        { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'run' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{}' },
        { type: 'TOOL_CALL_END', toolCallId: 'c1' },
        {
          type: 'TOOL_CALL_RESULT',
          toolCallId: 'c1',
          content: JSON.stringify({
            code_error: { name: 'ValueError', value: 'bad', traceback: 'tb' },
          }),
        },
        { type: 'RUN_ERROR', message: 'Model overloaded' },
      ]),
    );
    const adapter = new AGUIAdapter({
      protocol: 'ag-ui',
      baseUrl: 'http://127.0.0.1:1/api/v1/ag-ui/a',
    });
    const events = collect(adapter);
    await adapter.sendMessage(createUserMessage('hi'));
    const state = conversationOf(events);
    expect(state.items.slice(1)).toMatchObject([
      {
        kind: 'tool',
        status: 'error',
        codeError: { name: 'ValueError', value: 'bad', traceback: 'tb' },
      },
      { kind: 'error', text: 'Model overloaded' },
    ]);
  });
});

describe('Vercel AI', () => {
  it('builds the answer and a call waiting for approval', async () => {
    globalThis.fetch = streaming(
      sse(
        [
          { type: 'start', messageId: 'm1' },
          { type: 'start-step' },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Deleting ' },
          { type: 'text-delta', id: 't1', delta: 'it.' },
          { type: 'text-end', id: 't1' },
          {
            type: 'tool-input-start',
            toolCallId: 'c1',
            toolName: 'delete_file',
          },
          {
            type: 'tool-input-available',
            toolCallId: 'c1',
            toolName: 'delete_file',
            input: { path: 'a.txt' },
          },
          {
            type: 'tool-approval-request',
            toolCallId: 'c1',
            approvalId: 'ap1',
          },
          { type: 'finish-step' },
          { type: 'finish', finishReason: 'tool-calls' },
        ],
        true,
      ),
    );
    const adapter = new VercelAIAdapter({
      protocol: 'vercel-ai',
      baseUrl: 'http://127.0.0.1:1/api/v1/vercel-ai/a',
    });
    const events = collect(adapter);
    await adapter.sendMessage(createUserMessage('hi'));
    const state = conversationOf(events);
    expect(state.items.slice(1)).toMatchObject([
      { kind: 'message', role: 'assistant', text: 'Deleting it.' },
      {
        kind: 'tool',
        id: 'c1',
        name: 'delete_file',
        input: { path: 'a.txt' },
        status: 'running',
        awaiting: 'approval',
        value: { pending_approval: true, approval_id: 'ap1' },
      },
    ]);
    expect(state.running).toBe(false);
  });

  it('says a tool that failed on the server', async () => {
    globalThis.fetch = streaming(
      sse(
        [
          {
            type: 'tool-input-available',
            toolCallId: 'c1',
            toolName: 'fetch_page',
            input: { url: 'x' },
          },
          { type: 'tool-output-error', toolCallId: 'c1', errorText: '404' },
          { type: 'finish' },
        ],
        true,
      ),
    );
    const adapter = new VercelAIAdapter({
      protocol: 'vercel-ai',
      baseUrl: 'http://127.0.0.1:1/api/v1/vercel-ai/a',
    });
    const events = collect(adapter);
    await adapter.sendMessage(createUserMessage('hi'));
    expect(conversationOf(events).items[1]).toMatchObject({
      kind: 'tool',
      status: 'error',
      error: '404',
    });
  });
});

describe('A2A', () => {
  it('builds the reply a fasta2a worker sends', async () => {
    const taskId = 'task-1';
    const contextId = 'ctx-1';
    const card = {
      name: 'worker',
      supportedInterfaces: [
        {
          protocolBinding: 'JSONRPC',
          url: 'http://localhost:8000',
          protocolVersion: '1.0',
        },
      ],
      skills: [],
      defaultInputModes: ['application/json'],
      defaultOutputModes: ['application/json'],
      capabilities: { streaming: true, pushNotifications: false },
    };
    const body = [
      {
        jsonrpc: '2.0',
        id: '1',
        result: {
          task: {
            id: taskId,
            contextId,
            status: { state: 'submitted' },
            history: [
              {
                role: 'user',
                parts: [{ text: 'hi' }],
                messageId: 'u1',
                taskId,
                contextId,
              },
            ],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: '1',
        result: {
          task: {
            id: taskId,
            contextId,
            status: { state: 'completed' },
            history: [
              {
                role: 'user',
                parts: [{ kind: 'text', text: 'hi' }],
                messageId: 'u1',
                taskId,
                contextId,
              },
              {
                role: 'agent',
                parts: [{ kind: 'text', text: 'echo: hi' }],
                messageId: 'a1',
                taskId,
                contextId,
              },
            ],
          },
        },
      },
    ]
      .map(e => `data: ${JSON.stringify(e)}\n\n`)
      .join('');
    globalThis.fetch = vi.fn(async (url: unknown) =>
      String(url).includes('.well-known')
        ? new Response(JSON.stringify(card), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(body, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          }),
    ) as unknown as typeof fetch;
    const adapter = new A2AAdapter({
      protocol: 'a2a',
      baseUrl: 'http://localhost:9999',
    });
    await adapter.connect();
    const events = collect(adapter);
    await adapter.sendMessage(createUserMessage('hi'));
    const state = conversationOf(events);
    const said = state.items.filter(
      item => item.kind === 'message' && item.role === 'assistant',
    );
    expect(said).toMatchObject([{ text: 'echo: hi' }]);
    // A task's final state answers no call: there is none.
    expect(state.items.some(item => item.kind === 'tool')).toBe(false);
  });
});

describe('ACP', () => {
  it('builds the streamed answer, a call and its result from session updates', () => {
    const adapter = new ACPAdapter({
      protocol: 'acp',
      baseUrl: 'ws://127.0.0.1:1/acp',
    } as never);
    const events = collect(adapter);
    // As `sendMessage` leaves it: the turn's answer has its id.
    (adapter as unknown as { streamingMessageId: string }).streamingMessageId =
      'm1';
    const receive = (frame: object) =>
      (
        adapter as unknown as { handleMessage: (e: { data: string }) => void }
      ).handleMessage({ data: JSON.stringify(frame) });
    const update = (body: object) =>
      receive({
        jsonrpc: '2.0',
        method: 'session/update',
        params: { sessionId: 's', update: body },
      });
    update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Reading ' },
    });
    update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'it.' },
    });
    update({
      sessionUpdate: 'tool_call',
      toolCallId: 'c1',
      title: 'read_file',
      rawInput: { path: 'a.txt' },
    });
    update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'c1',
      status: 'in_progress',
    });
    update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'c1',
      status: 'completed',
      rawOutput: 'contents',
    });
    const state = conversationOf(events);
    expect(state.items.slice(1)).toMatchObject([
      { kind: 'message', id: 'm1', role: 'assistant', text: 'Reading it.' },
      {
        kind: 'tool',
        id: 'c1',
        name: 'read_file',
        input: { path: 'a.txt' },
        status: 'complete',
        value: 'contents',
      },
    ]);
  });
});

describe('the in-page agent', () => {
  it('builds a frontend tool run in the page and what it said after', async () => {
    let step = 0;
    const steps: unknown[][] = [
      [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'readAllCells',
          input: '{}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage: {
            inputTokens: { total: 1 },
            outputTokens: { total: 1 },
            totalTokens: 2,
          },
        },
      ],
      [
        { type: 'text-start', id: 't' },
        { type: 'text-delta', id: 't', delta: '31 cells.' },
        { type: 'text-end', id: 't' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 1 },
            outputTokens: { total: 1 },
            totalTokens: 2,
          },
        },
      ],
    ];
    const model = new MockLanguageModelV4({
      doStream: async () => {
        const chunks = steps[Math.min(step, steps.length - 1)];
        step += 1;
        return {
          stream: simulateReadableStream({ chunks: chunks as never[] }),
        };
      },
    });
    const adapter = new BrowserAgentAdapter({
      protocol: 'browser-vercel-ai',
      baseUrl: '',
      languageModel: model,
      frontendTools: [
        {
          name: 'readAllCells',
          description: 'Read the notebook.',
          parameters: { type: 'object', properties: {} },
          handler: async () => ({ cells: 31 }),
        },
      ],
    });
    const events = collect(adapter);
    await adapter.connect();
    await adapter.sendMessage(createUserMessage('hi'), {
      messages: [createUserMessage('hi')],
    });
    const state = conversationOf(events);
    expect(state.items.slice(1)).toMatchObject([
      {
        kind: 'tool',
        id: 'call-1',
        name: 'readAllCells',
        input: {},
        status: 'complete',
        value: { cells: 31 },
      },
      { kind: 'message', role: 'assistant', text: '31 cells.' },
    ]);
    expect(state.running).toBe(false);
  });
});
