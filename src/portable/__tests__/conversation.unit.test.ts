/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The portable conversation (MOBILE M-030): a run stream read the way every
 * client reads it, into the conversation a native client draws — bounded.
 * The run of `agent_runtimes/tests/fixtures/app_session_ops.json`, which the
 * runtime's own test holds the session to, is the shared fixture.
 *
 * @module portable/__tests__/conversation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AGUI_NAME } from '@datalayer/reactor/ui';
import {
  AgUiFrames,
  eventsOfStream,
  NOT_STREAMING,
  REACTOR_UI_NAME,
  readRunStream,
  RUN_CUT_SHORT,
  toolResultOf,
  UI_ON_RUN,
  type AgUiEvent,
} from '../agui';
import {
  CUT_MARK,
  emptyConversation,
  formFieldsOf,
  ITEM_LIMIT,
  questionOf,
  reduceConversation,
  TOOL_TEXT_LIMIT,
  withPrompt,
  withTurnEnded,
  type ConversationState,
} from '../conversation';
import {
  agentRunClient,
  agentRuntimesUrlOf,
  appSessionsClient,
  RuntimeRefusal,
} from '../sessions';
import { messagesOfThread, snapshotOfStream } from '../thread';

const FIXTURE = JSON.parse(
  readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'agent_runtimes',
      'tests',
      'fixtures',
      'app_session_ops.json',
    ),
    'utf8',
  ),
) as { run: AgUiEvent[] };

const sse = (...events: unknown[]): string =>
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');

const replay = (
  events: AgUiEvent[],
  state: ConversationState = emptyConversation(),
) => events.reduce(reduceConversation, state);

/** A response whose body streams `chunks`, one read each. */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('a run stream, read', () => {
  it('names reactor.ui as Reactor does, without importing it', () => {
    expect(REACTOR_UI_NAME).toBe(AGUI_NAME);
  });

  it('reads frames split anywhere, a character split across chunks kept whole', async () => {
    const text = sse(
      { type: 'RUN_STARTED' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'Café ☕' },
      { type: 'RUN_FINISHED' },
    );
    const bytes = new TextEncoder().encode(text);
    // Cut inside the multi-byte ☕.
    const cutAt = bytes.indexOf(0xe2) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cutAt));
        controller.enqueue(bytes.slice(cutAt));
        controller.close();
      },
    });
    const seen: AgUiEvent[] = [];
    await readRunStream(new Response(body), event => seen.push(event));
    expect(seen.map(event => event.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ]);
    expect(seen[1].delta).toBe('Café ☕');
  });

  it('says a stream that closes before the run said how it ended was cut short', async () => {
    await expect(
      readRunStream(streamed([sse({ type: 'RUN_STARTED' })]), () => {}),
    ).rejects.toThrow(RUN_CUT_SHORT);
  });

  it('refuses a fetch that cannot stream', async () => {
    await expect(readRunStream({ body: null }, () => {})).rejects.toThrow(
      NOT_STREAMING,
    );
  });

  it('hands a frame that is not JSON to its listener, never guessed at', () => {
    const malformed = vi.fn();
    const frames = new AgUiFrames(malformed);
    expect(
      frames.push('data: {nope\n\ndata: {"type":"RUN_STARTED"}\n'),
    ).toEqual([]);
    expect(frames.end()).toEqual([{ type: 'RUN_STARTED' }]);
    expect(malformed).toHaveBeenCalledWith('{nope');
  });

  it('finds a resume snapshot in a whole stream', () => {
    const text = sse(
      { type: 'RUN_STARTED' },
      {
        type: 'MESSAGES_SNAPSHOT',
        messages: [{ id: 'u', role: 'user', content: 'Hi' }],
      },
    );
    expect(eventsOfStream(text)).toHaveLength(2);
    expect(snapshotOfStream(text)).toEqual([
      { id: 'u', role: 'user', content: 'Hi' },
    ]);
  });

  it('reads a tool result as the chat does', () => {
    expect(
      toolResultOf('{"execution_ok": false, "execution_error": "boom"}'),
    ).toEqual({
      result: { execution_ok: false, execution_error: 'boom' },
      success: false,
      error: 'boom',
    });
    expect(toolResultOf('plain words')).toEqual({
      result: 'plain words',
      success: true,
    });
  });
});

describe('the conversation a run builds', () => {
  it('draws the shared session fixture: two answers and a finished step', () => {
    const state = replay([
      { type: 'RUN_STARTED' },
      ...FIXTURE.run,
      { type: 'RUN_FINISHED' },
    ]);
    expect(state.running).toBe(false);
    expect(
      state.items.map(item => [
        item.kind,
        'text' in item ? item.text : item.kind === 'step' ? item.status : '',
      ]),
    ).toEqual([
      ['message', 'Searching…'],
      ['message', 'Found 3.'],
      ['step', 'complete'],
    ]);
  });

  it('streams an answer into one message, then stops streaming it', () => {
    let state = replay([
      { type: 'RUN_STARTED' },
      { type: 'TEXT_MESSAGE_START', messageId: 'a', role: 'assistant' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'Hel' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'a', delta: 'lo' },
    ]);
    expect(state.items).toEqual([
      {
        kind: 'message',
        id: 'a',
        role: 'assistant',
        text: 'Hello',
        streaming: true,
      },
    ]);
    expect(state.running).toBe(true);
    state = replay(
      [{ type: 'TEXT_MESSAGE_END', messageId: 'a' }, { type: 'RUN_FINISHED' }],
      state,
    );
    expect(state.items[0]).toMatchObject({ text: 'Hello', streaming: false });
  });

  it('keeps a tool call collapsed with its arguments and result, and a failure said', () => {
    const state = replay([
      { type: 'RUN_STARTED' },
      { type: 'TOOL_CALL_START', toolCallId: 't1', toolCallName: 'search' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 't1', delta: '{"q":' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 't1', delta: '"x"}' },
      { type: 'TOOL_CALL_END', toolCallId: 't1' },
      {
        type: 'TOOL_CALL_RESULT',
        toolCallId: 't1',
        content: '{"error": "denied"}',
      },
      { type: 'RUN_FINISHED' },
    ]);
    expect(state.items[0]).toEqual({
      kind: 'tool',
      id: 't1',
      name: 'search',
      args: '{"q":"x"}',
      input: { q: 'x' },
      status: 'error',
      awaiting: null,
      result: '{"error":"denied"}',
      value: { error: 'denied' },
      error: 'denied',
      executionError: '',
      codeError: null,
      exitCode: null,
      display: null,
    });
  });

  it('says a turn that ended without a word by how it ended', () => {
    const answered = replay([
      { type: 'RUN_STARTED' },
      { type: 'RUN_FINISHED' },
    ]);
    expect(answered.items).toEqual([
      expect.objectContaining({
        kind: 'end',
        end: 'answered',
        words: 'Answered',
      }),
    ]);
    const stopped = withTurnEnded(
      replay([
        { type: 'RUN_STARTED' },
        { type: 'TOOL_CALL_START', toolCallId: 't', toolCallName: 'x' },
      ]),
      'stopped',
    );
    expect(stopped.running).toBe(false);
    expect(stopped.items[0]).toMatchObject({
      kind: 'tool',
      status: 'error',
      error: 'Stopped',
    });
    expect(stopped.items[1]).toMatchObject({
      kind: 'end',
      end: 'stopped',
      words: 'Stopped',
    });
  });

  it('waits on what the application asks, from RUN_FINISHED or loop.session', () => {
    const asked = replay([
      { type: 'RUN_STARTED' },
      { type: 'TEXT_MESSAGE_START', messageId: 'q' },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'q',
        delta: 'Which plan? (Free or Pro)',
      },
      { type: 'TEXT_MESSAGE_END', messageId: 'q' },
      {
        type: 'RUN_FINISHED',
        result: {
          asking: {
            kind: 'choice',
            prompt: 'Which plan?',
            options: ['Free', 'Pro'],
          },
        },
      },
    ]);
    expect(asked.asking).toEqual({
      kind: 'choice',
      prompt: 'Which plan?',
      options: ['Free', 'Pro'],
      schema: null,
      accept: [],
    });
    expect(asked.items.some(item => item.kind === 'end')).toBe(false);
    const reopened = reduceConversation(emptyConversation(), {
      type: 'CUSTOM',
      name: 'loop.session',
      value: {
        uid: 's',
        state: 'waiting',
        asking: { kind: 'text', prompt: 'Your name?' },
      },
    });
    expect(reopened.session).toMatchObject({ uid: 's', state: 'waiting' });
    expect(reopened.asking?.prompt).toBe('Your name?');
    // Answered: the person's words clear the question.
    expect(withPrompt(asked, 'p', 'Pro').asking).toBeNull();
    expect(() => questionOf({ kind: 'dance' })).toThrow(/no client knows/);
  });

  it('reads a form question into its fields', () => {
    expect(
      formFieldsOf({
        properties: {
          tone: { type: 'string', title: 'Tone', enum: ['Plain', 'Warm'] },
          seats: { type: 'integer' },
        },
        required: ['tone'],
      }),
    ).toEqual([
      {
        name: 'tone',
        title: 'Tone',
        type: 'string',
        options: ['Plain', 'Warm'],
        required: true,
      },
      {
        name: 'seats',
        title: 'seats',
        type: 'integer',
        options: [],
        required: false,
      },
    ]);
  });

  it('restores a snapshot without the runtime-only asked-for preamble', () => {
    const state = reduceConversation(
      withPrompt(emptyConversation(), 'old', 'gone'),
      {
        type: 'MESSAGES_SNAPSHOT',
        messages: [
          {
            id: 'u',
            role: 'user',
            content: '<asked-for>PAP: Ada via Acme</asked-for>\nMy order?',
          },
          { id: 'a', role: 'assistant', content: 'On its way.' },
          { id: 't', role: 'tool', content: 'ignored' },
        ],
      },
    );
    expect(state.items.map(item => ('text' in item ? item.text : ''))).toEqual([
      'My order?',
      'On its way.',
    ]);
  });

  it('says nothing more of a resume than the conversation it restores', () => {
    const state = replay([
      { type: 'RUN_STARTED' },
      {
        type: 'MESSAGES_SNAPSHOT',
        messages: [{ id: 'u', role: 'user', content: 'Before' }],
      },
      { type: 'RUN_FINISHED' },
    ]);
    expect(state.items).toEqual([
      {
        kind: 'message',
        id: 'u',
        role: 'user',
        text: 'Before',
        streaming: false,
      },
    ]);
  });

  it('refuses a reactor.ui op on the run', () => {
    const state = replay([
      { type: 'RUN_STARTED' },
      { type: 'CUSTOM', name: REACTOR_UI_NAME, value: {} },
    ]);
    expect(state.running).toBe(false);
    expect(state.items).toEqual([
      expect.objectContaining({ kind: 'error', text: UI_ON_RUN }),
    ]);
  });

  it('keeps an unknown event by its name only, the last fifty', () => {
    let state = emptyConversation();
    for (let i = 0; i < 60; i += 1) {
      state = reduceConversation(state, {
        type: 'CUSTOM',
        name: `x${i}`,
        value: { secret: 'never kept' },
      });
    }
    expect(state.diagnostics).toHaveLength(50);
    expect(state.diagnostics[0]).toEqual({ type: 'CUSTOM', name: 'x10' });
    expect(JSON.stringify(state)).not.toContain('never kept');
  });

  it('is bounded through a long tool run', () => {
    let state = replay([{ type: 'RUN_STARTED' }]);
    for (let i = 0; i < ITEM_LIMIT + 100; i += 1) {
      state = reduceConversation(state, {
        type: 'TOOL_CALL_START',
        toolCallId: `t${i}`,
        toolCallName: 'read',
      });
      state = reduceConversation(state, {
        type: 'TOOL_CALL_RESULT',
        toolCallId: `t${i}`,
        content: 'x'.repeat(TOOL_TEXT_LIMIT * 3),
      });
    }
    expect(state.items).toHaveLength(ITEM_LIMIT);
    expect(state.dropped).toBe(100);
    const last = state.items[state.items.length - 1];
    expect(last.kind === 'tool' && last.result.endsWith(CUT_MARK)).toBe(true);
    expect(last.kind === 'tool' && last.result.length).toBe(
      TOOL_TEXT_LIMIT + CUT_MARK.length,
    );
  });

  it('reads a thread from what the runtime holds', () => {
    expect(
      messagesOfThread([{ id: 'a', role: 'assistant', content: 'Hi' }]),
    ).toHaveLength(1);
  });
});

describe('the runtime clients', () => {
  it('starts a session on the application agent and streams its turn', async () => {
    const fetcher = vi.fn(async () =>
      streamed([sse({ type: 'RUN_STARTED' }, { type: 'RUN_FINISHED' })]),
    );
    const client = appSessionsClient({
      baseUrl: 'https://r/agent-runtimes/rt/',
      getAccessToken: () => 'tok',
      fetch: fetcher as never,
    });
    const seen: string[] = [];
    await client.start(
      {
        agent: 'desk',
        deploymentUid: 'd1',
        appUid: 'a1',
        version: 3,
        opener: 'Hello',
      },
      { onEvent: event => seen.push(event.type) },
    );
    expect(seen).toEqual(['RUN_STARTED', 'RUN_FINISHED']);
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://r/agent-runtimes/rt/api/v1/apps/sessions');
    expect(JSON.parse(String(init.body))).toEqual({
      agent: 'desk',
      deployment_uid: 'd1',
      app_uid: 'a1',
      version: 3,
      opener: 'Hello',
    });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );
  });

  it('answers a form with a settings change, and says a refusal in the runtime sentence', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ detail: 'Session s is stopped, not open.' }),
          { status: 409 },
        ),
    );
    const client = appSessionsClient({
      baseUrl: 'https://r',
      getAccessToken: () => undefined,
      fetch: fetcher as never,
    });
    const refused = await client
      .changeSettings('s/1', { tone: 'Warm' }, { onEvent: () => {} })
      .catch(error => error);
    expect(refused).toBeInstanceOf(RuntimeRefusal);
    expect(refused).toMatchObject({
      status: 409,
      message: 'Session s is stopped, not open.',
    });
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://r/api/v1/apps/sessions/s%2F1/settings');
    expect(init.method).toBe('PUT');
  });

  it('runs a standalone agent with the conversation, and terminates its thread', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/terminate')
        ? new Response('{}')
        : streamed([
            sse({ type: 'RUN_STARTED' }, { type: 'RUN_ERROR', message: 'no' }),
          ]),
    );
    const client = agentRunClient({
      baseUrl: 'https://r',
      agent: 'my agent',
      getAccessToken: () => 't',
      fetch: fetcher as never,
    });
    await client.run('th', 'run', [{ id: 'u', role: 'user', content: 'Hi' }], {
      onEvent: () => {},
    });
    await client.terminate('th');
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      'https://r/api/v1/ag-ui/my%20agent/',
      'https://r/api/v1/ag-ui/terminate',
    ]);
    expect(
      JSON.parse(
        String(
          (fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body,
        ),
      ),
    ).toEqual({ thread_id: 'th' });
  });

  it('reaches a runtime agents from its ingress, and refuses none', () => {
    expect(agentRuntimesUrlOf('https://h/jupyter/server/rt-1/')).toBe(
      'https://h/agent-runtimes/rt-1',
    );
    expect(() => agentRuntimesUrlOf('')).toThrow(/no address/);
  });
});
