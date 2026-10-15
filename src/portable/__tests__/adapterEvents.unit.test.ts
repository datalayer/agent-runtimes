/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What every protocol adapter says, as the conversation reads it (MOBILE
 * M-030): the normalisation of adapter events and of a conversation read
 * again, and the reducer's own said-whole events — strict, and bounded.
 *
 * @module portable/__tests__/adapterEvents
 */

import { describe, expect, it } from 'vitest';
import {
  conversationEventsOf,
  sanitizeAssistantContent,
  snapshotOfMessages,
  type AdapterEvent,
} from '../adapterEvents';
import type { AgUiEvent } from '../agui';
import {
  BROWSER_LIMITS,
  CUT_MARK,
  DEVICE_LIMITS,
  emptyConversation,
  reduceConversation,
  withoutItems,
  withTurnEnded,
  type ConversationState,
} from '../conversation';
import { presenceOfConversation } from '../presence';

const at = (type: string, fields: Partial<AdapterEvent> = {}): AdapterEvent =>
  ({ type, ...fields }) as AdapterEvent;

function said(
  events: AdapterEvent[],
  state: ConversationState = emptyConversation(BROWSER_LIMITS),
): ConversationState {
  let kept = reduceConversation(state, { type: 'RUN_STARTED' });
  for (const event of events) {
    for (const input of conversationEventsOf(event, kept)) {
      kept = reduceConversation(kept, input);
    }
  }
  return kept;
}

const message = (id: string, content: unknown, role = 'assistant') =>
  at('message', { message: { id, role, content } });
const call = (toolCallId: string, args: unknown, toolName = 'run') =>
  at('tool-call', { toolCall: { toolCallId, toolName, args } });
const result = (
  toolCallId: string,
  value: unknown,
  success = true,
  error?: string,
) =>
  at('tool-result', {
    toolResult: { toolCallId, success, result: value, error },
  });

describe('an adapter event, as the reducer reads it', () => {
  it('says a message whole, its words written over as they grow', () => {
    const state = said([message('m', 'Hel'), message('m', 'Hello.')]);
    expect(state.items).toEqual([
      {
        kind: 'message',
        id: 'm',
        role: 'assistant',
        text: 'Hello.',
        streaming: true,
      },
    ]);
    const done = said([message('m', 'Hello.'), at('done')]);
    expect(done.items[0]).toMatchObject({ streaming: false });
    expect(done.running).toBe(false);
  });

  it('takes the call markup out of an answer, never out of the person’s words', () => {
    const markup = 'Done.<calls><invoke name="x"></invoke></calls>';
    expect(
      conversationEventsOf(message('m', markup), emptyConversation()),
    ).toEqual([
      {
        type: 'MESSAGE_SAID',
        messageId: 'm',
        role: 'assistant',
        text: 'Done.',
      },
    ]);
    expect(
      conversationEventsOf(message('u', markup, 'user'), emptyConversation()),
    ).toEqual([
      { type: 'MESSAGE_SAID', messageId: 'u', role: 'user', text: markup },
    ]);
    expect(sanitizeAssistantContent('a</>\n\n\n\nb')).toBe('a\n\nb');
    expect(sanitizeAssistantContent('a\n\n\n\nb')).toBe('a\n\n\n\nb');
    expect(sanitizeAssistantContent('plain')).toBe('plain');
  });

  it('keeps a usage-only message, a connection’s change, out of the conversation', () => {
    const empty = emptyConversation();
    expect(conversationEventsOf(at('message'), empty)).toEqual([]);
    expect(conversationEventsOf(at('connected'), empty)).toEqual([]);
    expect(conversationEventsOf(at('disconnected'), empty)).toEqual([]);
  });

  it('refuses a message without its id, its speaker or its words', () => {
    const empty = emptyConversation();
    expect(() => conversationEventsOf(message('', 'x'), empty)).toThrow(
      'A message came without its id.',
    );
    expect(() =>
      conversationEventsOf(message('m', 'x', 'system'), empty),
    ).toThrow('Message m is said by system');
    expect(() =>
      conversationEventsOf(message('m', [{ type: 'text' }]), empty),
    ).toThrow('Message m says no words.');
  });

  it('merges a call’s arguments as they are told, and keeps them whole', () => {
    const state = said([call('c', {}), call('c', { path: 'a.txt' })]);
    expect(state.items[0]).toMatchObject({
      kind: 'tool',
      id: 'c',
      name: 'run',
      args: '{"path":"a.txt"}',
      input: { path: 'a.txt' },
      status: 'running',
      awaiting: null,
    });
    expect(state.turnRows).toBe(1);
  });

  it('refuses a call without its id, its name or object arguments', () => {
    const empty = emptyConversation();
    expect(() => conversationEventsOf(call('', {}), empty)).toThrow(
      'A tool call came without its id and its name.',
    );
    expect(() => conversationEventsOf(call('c', {}, ''), empty)).toThrow(
      'A tool call came without its id and its name.',
    );
    expect(() => conversationEventsOf(call('c', [1]), empty)).toThrow(
      "Tool call c's arguments are not an object.",
    );
    expect(() => conversationEventsOf(at('tool-call'), empty)).toThrow();
  });

  it('reads a result as every client reads it: failed, or still waiting', () => {
    const run = (value: unknown, success = true, args: unknown = {}) =>
      said([call('c', args), result('c', value, success)]).items[0];
    expect(run({ rows: 2 })).toMatchObject({
      status: 'complete',
      awaiting: null,
      value: { rows: 2 },
      result: '{"rows":2}',
    });
    expect(run('ok', false)).toMatchObject({ status: 'error' });
    expect(run({ execution_error: 'sandbox gone' })).toMatchObject({
      status: 'error',
      executionError: 'sandbox gone',
    });
    expect(run({ code_error: {} })).toMatchObject({
      status: 'error',
      codeError: { name: 'Error', value: 'Unknown error', traceback: '' },
    });
    expect(run({ exit_code: 2 })).toMatchObject({
      status: 'error',
      exitCode: 2,
    });
    expect(run({ exit_code: 0 })).toMatchObject({
      status: 'complete',
      exitCode: 0,
    });
    expect(run({ execution_ok: false })).toMatchObject({ status: 'error' });
    expect(run({ pending_approval: true })).toMatchObject({
      status: 'running',
      awaiting: 'approval',
    });
    expect(run({ shown: true }, true, { steps: [] })).toMatchObject({
      status: 'running',
      awaiting: 'person',
    });
    expect(run({ pending_approval: true, exit_code: 1 })).toMatchObject({
      status: 'error',
      awaiting: null,
    });
  });

  it('says a result’s error in its words, and refuses a result it cannot place', () => {
    const state = said([
      call('c', {}),
      result('c', undefined, false, 'denied'),
    ]);
    expect(state.items[0]).toMatchObject({
      status: 'error',
      error: 'denied',
      result: '',
      value: undefined,
    });
    const empty = emptyConversation();
    expect(() => conversationEventsOf(result('', 1), empty)).toThrow(
      'A tool result came without the id of its call.',
    );
    expect(() =>
      conversationEventsOf(
        at('tool-result', { toolResult: { toolCallId: 'c' } }),
        empty,
      ),
    ).toThrow('Tool result of c does not say whether it succeeded.');
    expect(() =>
      conversationEventsOf(
        at('tool-result', {
          toolResult: { toolCallId: 'c', success: false, error: 7 },
        }),
        empty,
      ),
    ).toThrow('Tool result of c says its error in no words.');
    // A result for a call it never saw is kept by name, not drawn.
    const stray = said([result('x', 1)]);
    expect(stray.items).toEqual([]);
    expect(stray.diagnostics).toEqual([{ type: 'TOOL_CALL_DONE', name: '' }]);
  });

  it('completes the newest running call with the shared state it set', () => {
    const state = said([
      call('a', {}),
      call('b', {}),
      at('state-update', { data: { weather: { temp: 21 } } }),
    ]);
    expect(
      state.items.map(item => item.kind === 'tool' && item.status),
    ).toEqual(['running', 'complete']);
    expect(state.items[1]).toMatchObject({ value: { temp: 21 } });
    const picks = (data: unknown) =>
      (
        said([call('a', {}), at('state-update', { data })]).items[0] as {
          value: unknown;
        }
      ).value;
    expect(picks({ result: 1, toolResult: 2 })).toBe(1);
    expect(picks({ toolResult: 2 })).toBe(2);
    expect(picks({ plan: 3 })).toEqual({ plan: 3 });
  });

  it('leaves a call waiting on its approval or on the person to them', () => {
    const update = at('state-update', { data: { x: 1 } });
    const approval = said([
      call('a', {}),
      result('a', { pending_approval: true }),
      update,
    ]);
    expect(approval.items[0]).toMatchObject({ awaiting: 'approval' });
    const steps = said([call('a', { steps: [] }), update]);
    expect(steps.items[0]).toMatchObject({ status: 'running' });
    const confirming = said([
      call('a', { steps: [] }),
      result('a', 'shown'),
      update,
    ]);
    expect(confirming.items[0]).toMatchObject({ awaiting: 'person' });
    expect(said([update]).items).toEqual([]);
    expect(
      conversationEventsOf(at('state-update'), said([call('a', {})])),
    ).toEqual([]);
  });

  it('says an activity as a custom event: a session’s is the session', () => {
    const state = said([
      at('activity', {
        activity: { type: 'loop.session', data: { uid: 's1' } },
      }),
      at('activity', { activity: { type: 'a2ui', data: {} } }),
    ]);
    expect(state.session).toEqual({ uid: 's1' });
    expect(state.diagnostics).toEqual([{ type: 'CUSTOM', name: 'a2ui' }]);
    expect(() =>
      conversationEventsOf(at('activity'), emptyConversation()),
    ).toThrow('An activity came without its type.');
  });

  it('ends a run as finished, or as failed in its words', () => {
    const failed = said([
      message('m', 'Hal'),
      at('error', { error: { message: 'Overloaded' } }),
    ]);
    expect(failed.running).toBe(false);
    expect(failed.items[1]).toMatchObject({
      kind: 'error',
      text: 'Overloaded',
    });
    const unsaid = said([at('error', { error: {} })]);
    expect(unsaid.items[0]).toMatchObject({
      kind: 'error',
      text: 'Run failed',
    });
    expect(() =>
      conversationEventsOf(at('telepathy'), emptyConversation()),
    ).toThrow('An adapter said telepathy, which no client reads.');
  });
});

describe('the reducer’s said-whole events', () => {
  const run = (events: AgUiEvent[], limits = DEVICE_LIMITS) =>
    events.reduce(reduceConversation, emptyConversation(limits));

  it('refuses one without what it needs', () => {
    expect(() =>
      run([{ type: 'MESSAGE_SAID', text: 'x', role: 'assistant' }]),
    ).toThrow('MESSAGE_SAID carries no messageId.');
    expect(() =>
      run([{ type: 'MESSAGE_SAID', messageId: 'm', role: 'assistant' }]),
    ).toThrow('MESSAGE_SAID of m carries no text.');
    expect(() =>
      run([{ type: 'MESSAGE_SAID', messageId: 'm', text: '', role: 'tool' }]),
    ).toThrow('MESSAGE_SAID of m is said by tool');
    expect(() =>
      run([
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: 'c',
          toolCallName: 'x',
          args: 'no',
        },
      ]),
    ).toThrow('TOOL_CALL_SAID of c carries arguments that are not an object.');
    expect(() =>
      run([{ type: 'TOOL_CALL_DONE', toolCallId: 'c', success: 'yes' }]),
    ).toThrow('TOOL_CALL_DONE of c does not say whether it succeeded.');
    expect(() =>
      run([
        { type: 'TOOL_CALL_DONE', toolCallId: 'c', success: false, error: 1 },
      ]),
    ).toThrow('TOOL_CALL_DONE of c says its error in no words.');
    // One row's id is not another kind's.
    expect(() =>
      run([
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: 'x',
          toolCallName: 'x',
          args: {},
        },
        { type: 'MESSAGE_SAID', messageId: 'x', text: '', role: 'assistant' },
      ]),
    ).toThrow('MESSAGE_SAID of x names a tool row.');
    expect(() =>
      run([
        { type: 'MESSAGE_SAID', messageId: 'x', text: '', role: 'assistant' },
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: 'x',
          toolCallName: 'x',
          args: {},
        },
      ]),
    ).toThrow('TOOL_CALL_SAID of x names a message row.');
  });

  it('keeps the person’s words said whole as not streaming', () => {
    const state = run([
      { type: 'MESSAGE_SAID', messageId: 'u', text: 'hi', role: 'user' },
      {
        type: 'MESSAGE_SAID',
        messageId: 'a',
        text: '',
        role: 'assistant',
        streaming: false,
      },
    ]);
    expect(
      state.items.map(item => item.kind === 'message' && item.streaming),
    ).toEqual([false, false]);
  });

  it('is bounded: words cut, values kept only whole', () => {
    const limits = { ...DEVICE_LIMITS, messageText: 5, toolText: 10 };
    const state = run(
      [
        {
          type: 'MESSAGE_SAID',
          messageId: 'm',
          text: '123456789',
          role: 'assistant',
        },
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: 'c',
          toolCallName: 'x',
          args: { long: 'abcdefghij' },
        },
        {
          type: 'TOOL_CALL_DONE',
          toolCallId: 'c',
          success: true,
          result: 'abcdefghijk',
        },
        {
          type: 'TOOL_CALL_SAID',
          toolCallId: 'd',
          toolCallName: 'x',
          args: { a: 1 },
        },
        {
          type: 'TOOL_CALL_DONE',
          toolCallId: 'd',
          success: true,
          result: '0123456789',
        },
      ],
      limits,
    );
    expect(state.items[0]).toMatchObject({ text: `12345${CUT_MARK}` });
    expect(state.items[1]).toMatchObject({
      args: `{"long":"a${CUT_MARK}`,
      input: null,
      result: `abcdefghij${CUT_MARK}`,
      value: undefined,
    });
    expect(state.items[2]).toMatchObject({
      input: { a: 1 },
      value: '0123456789',
    });
  });

  it('refuses bounds that keep nothing', () => {
    expect(() => emptyConversation({ ...DEVICE_LIMITS, items: 0 })).toThrow(
      "A conversation's items bound is 0",
    );
    expect(() =>
      emptyConversation({ ...DEVICE_LIMITS, toolText: 1.5 }),
    ).toThrow('toolText bound is 1.5');
    expect(emptyConversation().limits).toBe(DEVICE_LIMITS);
    expect(BROWSER_LIMITS.items).toBeGreaterThan(DEVICE_LIMITS.items);
  });

  it('reads an AG-UI call’s arguments whole at its end, and says them malformed', () => {
    const state = run([
      { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'x' },
      { type: 'TOOL_CALL_END', toolCallId: 'a' },
      { type: 'TOOL_CALL_START', toolCallId: 'b', toolCallName: 'x' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'b', delta: '[1]' },
      { type: 'TOOL_CALL_END', toolCallId: 'b' },
      { type: 'TOOL_CALL_START', toolCallId: 'c', toolCallName: 'x' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'c', delta: '{"a":' },
      { type: 'TOOL_CALL_END', toolCallId: 'c' },
    ]);
    expect(state.items[0]).toMatchObject({ input: {}, status: 'running' });
    expect(state.items[1]).toMatchObject({
      input: null,
      status: 'error',
      error: 'Its arguments are not a JSON object.',
    });
    expect(state.items[2]).toMatchObject({ status: 'error' });
    const cut = run(
      [
        { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'x' },
        {
          type: 'TOOL_CALL_ARGS',
          toolCallId: 'a',
          delta: '{"a":"0123456789"}',
        },
        { type: 'TOOL_CALL_END', toolCallId: 'a' },
      ],
      { ...DEVICE_LIMITS, toolText: 5 },
    );
    expect(cut.items[0]).toMatchObject({ input: null, status: 'running' });
  });

  it('takes rows away, and stops a waiting call', () => {
    const state = run([
      { type: 'MESSAGE_SAID', messageId: 'm', text: 'x', role: 'assistant' },
      { type: 'TOOL_CALL_SAID', toolCallId: 'c', toolCallName: 'x', args: {} },
      {
        type: 'TOOL_CALL_DONE',
        toolCallId: 'c',
        success: true,
        result: { pending_approval: true },
      },
    ]);
    expect(presenceOfConversation({ ...state, running: true })).toBe('waiting');
    expect(withoutItems(state, ['m']).items.map(item => item.id)).toEqual([
      'c',
    ]);
    const stopped = withTurnEnded(state, 'stopped');
    expect(stopped.items[1]).toMatchObject({
      status: 'error',
      awaiting: null,
      error: 'Stopped',
    });
  });
});

describe('a conversation read again', () => {
  it('restores its words, its calls and their results', () => {
    const snapshot = snapshotOfMessages([
      { id: 'u', role: 'user', content: 'Find it' },
      {
        id: 'a',
        role: 'assistant',
        content: 'Looking.<calls></calls>',
        toolCalls: [
          {
            toolCallId: 'c1',
            toolName: 'search',
            args: { q: 'x' },
            status: 'completed',
          },
          {
            toolCallId: 'c2',
            toolName: 'open',
            status: 'completed',
            result: { page: 1 },
          },
          { toolCallId: 'c3', toolName: 'fail', args: {}, status: 'failed' },
        ],
      },
      {
        id: 'r1',
        role: 'tool',
        content: '{"hits": 4}',
        metadata: { toolCallId: 'c1' },
      },
      { id: 'b', role: 'assistant', content: 'Four.' },
    ]);
    const state = reduceConversation(
      emptyConversation(BROWSER_LIMITS),
      snapshot,
    );
    expect(state.items).toMatchObject([
      { kind: 'message', id: 'u', text: 'Find it' },
      { kind: 'message', id: 'a', text: 'Looking.' },
      {
        kind: 'tool',
        id: 'c1',
        name: 'search',
        input: { q: 'x' },
        status: 'complete',
        value: { hits: 4 },
      },
      {
        kind: 'tool',
        id: 'c2',
        input: {},
        status: 'complete',
        value: { page: 1 },
      },
      { kind: 'tool', id: 'c3', status: 'error', error: 'failed' },
      { kind: 'message', id: 'b', text: 'Four.' },
    ]);
  });

  it('never waits on what its past said', () => {
    const state = reduceConversation(
      emptyConversation(),
      snapshotOfMessages([
        {
          id: 'a',
          role: 'assistant',
          content: '',
          toolCalls: [{ toolCallId: 'c', toolName: 'x', args: { steps: [] } }],
        },
        {
          id: 'r',
          role: 'tool',
          content: '{"pending_approval": true}',
          metadata: { toolCallId: 'c' },
        },
      ]),
    );
    expect(state.items).toMatchObject([
      { kind: 'tool', status: 'complete', awaiting: null },
    ]);
  });

  it('refuses a message by anyone else, a result for no call, a call under way', () => {
    expect(() =>
      snapshotOfMessages([{ id: 's', role: 'system', content: 'x' }]),
    ).toThrow('Message s is said by system');
    expect(() =>
      snapshotOfMessages([{ id: 't', role: 'tool', content: 'x' }]),
    ).toThrow('Tool result t does not say which call it answers.');
    expect(() =>
      snapshotOfMessages([
        {
          id: 'a',
          role: 'assistant',
          content: '',
          toolCalls: [{ toolCallId: 'c', toolName: 'x', status: 'executing' }],
        },
      ]),
    ).toThrow('Tool call c is read again executing');
    expect(() =>
      snapshotOfMessages([
        {
          id: 'a',
          role: 'assistant',
          content: '',
          toolCalls: [{ toolCallId: '', toolName: 'x' }],
        },
      ]),
    ).toThrow('Message a holds a tool call without its id.');
  });

  it('refuses a snapshot whose calls are malformed, and keeps a stray result by name', () => {
    const snap = (messages: unknown) =>
      reduceConversation(emptyConversation(), {
        type: 'MESSAGES_SNAPSHOT',
        messages,
      });
    expect(() => snap('no')).toThrow(
      'A messages snapshot carries no list of messages.',
    );
    expect(() =>
      snap([{ id: 'a', role: 'assistant', toolCalls: 'x' }]),
    ).toThrow("Message a's tool calls are not a list.");
    expect(() =>
      snap([{ id: 'a', role: 'assistant', toolCalls: [{ id: 'c' }] }]),
    ).toThrow('Message a holds a tool call without its id and function.');
    expect(() =>
      snap([
        {
          id: 'a',
          role: 'assistant',
          toolCalls: [{ id: 'c', function: { name: 'x', arguments: '[1]' } }],
        },
      ]),
    ).toThrow("Tool call c's arguments are not a JSON object.");
    expect(() =>
      snap([
        {
          id: 'a',
          role: 'assistant',
          toolCalls: [{ id: 'c', function: { name: 'x', arguments: '{' } }],
        },
      ]),
    ).toThrow("Tool call c's arguments are not a JSON object.");
    const stray = snap([
      { id: 't', role: 'tool', toolCallId: 'z', content: 'x' },
    ]);
    expect(stray.items).toEqual([]);
    expect(stray.diagnostics).toEqual([
      { type: 'TOOL_CALL_RESULT', name: 'z (no call)' },
    ]);
  });
});

describe('the edges the mutation pass found', () => {
  it('says a result without an error as nothing more', () => {
    expect(
      conversationEventsOf(result('c', 1), emptyConversation()),
    ).toStrictEqual([
      { type: 'TOOL_CALL_DONE', toolCallId: 'c', success: true, result: 1 },
    ]);
  });

  it('reads the shared state by its first key that answers, else whole', () => {
    const value = (data: unknown) =>
      (
        said([call('a', {}), at('state-update', { data })]).items[0] as {
          value: unknown;
        }
      ).value;
    expect(value({ weather: 1, result: 2 })).toBe(1);
    expect(value('done')).toBe('done');
    // A call that waits on its steps is not answered by the state.
    const steps = said([
      call('a', { steps: [] }),
      at('state-update', { data: { x: 1 } }),
    ]);
    expect(steps.items[0]).toMatchObject({
      status: 'running',
      value: undefined,
    });
  });

  it('refuses an activity whose type is not words', () => {
    expect(() =>
      conversationEventsOf(
        at('activity', { activity: { type: 7 as never, data: {} } }),
        emptyConversation(),
      ),
    ).toThrow('An activity came without its type.');
  });

  it('refuses a tool result read again whose call id is empty', () => {
    expect(() =>
      snapshotOfMessages([
        { id: 't', role: 'tool', content: 'x', metadata: { toolCallId: '' } },
      ]),
    ).toThrow('Tool result t does not say which call it answers.');
  });

  it('reads no tool call off the person’s words, and says absent arguments as {}', () => {
    const event = snapshotOfMessages([
      {
        id: 'u',
        role: 'user',
        content: 'x',
        toolCalls: [{ toolCallId: 'c', toolName: 'x' }],
      },
      {
        id: 'a',
        role: 'assistant',
        content: '',
        toolCalls: [{ toolCallId: 'd', toolName: 'y' }],
      },
    ]);
    expect(event.messages).toEqual([
      { id: 'u', role: 'user', content: 'x' },
      {
        id: 'a',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'd',
            type: 'function',
            function: { name: 'y', arguments: '{}' },
          },
        ],
      },
    ]);
  });

  it('keeps arguments exactly at the bound whole, and merges what is told later', () => {
    const limits = { ...DEVICE_LIMITS, toolText: 13 };
    const state = [
      {
        type: 'TOOL_CALL_SAID',
        toolCallId: 'c',
        toolCallName: 'x',
        args: { a: '12345' },
      },
      {
        type: 'TOOL_CALL_SAID',
        toolCallId: 'd',
        toolCallName: 'x',
        args: { a: 1 },
      },
      {
        type: 'TOOL_CALL_SAID',
        toolCallId: 'd',
        toolCallName: 'x',
        args: { b: 2 },
      },
    ].reduce(reduceConversation, emptyConversation(limits));
    expect(state.items[0]).toMatchObject({ input: { a: '12345' } });
    expect((state.items[1] as { input: unknown }).input).toEqual({
      a: 1,
      b: 2,
    });
  });

  it('asks the person only for steps that are a list, and waits only on a true approval', () => {
    const first = (args: unknown, value: unknown) =>
      said([call('c', args), result('c', value)]).items[0];
    expect(first({ steps: 'x' }, 'ok')).toMatchObject({ status: 'complete' });
    expect(first({}, { pending_approval: 'yes' })).toMatchObject({
      status: 'complete',
      awaiting: null,
    });
  });

  it('reads a past call’s arguments: none as {}, too long as not whole', () => {
    const snap = (args: string, toolText = 100) =>
      reduceConversation(emptyConversation({ ...DEVICE_LIMITS, toolText }), {
        type: 'MESSAGES_SNAPSHOT',
        messages: [
          {
            id: 'a',
            role: 'assistant',
            toolCalls: [{ id: 'c', function: { name: 'x', arguments: args } }],
          },
        ],
      }).items[0] as { input: unknown };
    expect(snap('').input).toEqual({});
    expect(snap('{"a":"0123456789"}', 5).input).toBeNull();
    expect(snap('{"a":1}').input).toEqual({ a: 1 });
  });

  it('reads an AG-UI call that said no arguments as {}', () => {
    const state = [
      { type: 'TOOL_CALL_START', toolCallId: 'a', toolCallName: 'x' },
      { type: 'TOOL_CALL_END', toolCallId: 'a' },
    ].reduce(reduceConversation, emptyConversation());
    expect((state.items[0] as { input: unknown }).input).toEqual({});
  });
});
