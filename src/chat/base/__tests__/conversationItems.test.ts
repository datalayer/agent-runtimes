/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the web chat draws of the shared conversation (M-030): the
 * reducer's rows as the cards and messages `ChatMessageList` renders, with
 * the web's own layer beside them.
 */

import { describe, expect, it } from 'vitest';
import {
  conversationDrawer,
  emptyChatLayer,
  rowIdOf,
  toolCallOf,
  withToolSummaries,
  type ChatLayer,
} from '../conversationItems';
import {
  BROWSER_LIMITS,
  emptyConversation,
  reduceConversation,
  withPrompt,
  withTurnEnded,
} from '../../../portable/conversation';
import type { AgUiEvent } from '../../../portable/agui';
import type { ToolCallMessage } from '../../../types/chat';

const run = (events: AgUiEvent[]) =>
  events.reduce(
    reduceConversation,
    withPrompt(emptyConversation(BROWSER_LIMITS), 'u', 'hi'),
  );

const step = (id: string): ToolCallMessage => ({
  id,
  type: 'tool-call',
  toolCallId: id,
  toolName: 'Step',
  args: {},
  status: 'executing',
});

describe('the conversation drawn', () => {
  it('draws a card per call, its status as the card says it', () => {
    const state = run([
      {
        type: 'TOOL_CALL_SAID',
        toolCallId: 'a',
        toolCallName: 'x',
        args: { q: 1 },
      },
      { type: 'TOOL_CALL_SAID', toolCallId: 'b', toolCallName: 'y', args: {} },
      {
        type: 'TOOL_CALL_DONE',
        toolCallId: 'b',
        success: true,
        result: { pending_approval: true },
      },
      { type: 'TOOL_CALL_SAID', toolCallId: 'c', toolCallName: 'z', args: {} },
      {
        type: 'TOOL_CALL_DONE',
        toolCallId: 'c',
        success: true,
        result: {
          code_error: { name: 'E', value: 'v', traceback: 't' },
          exit_code: 3,
        },
      },
    ]);
    const tools = state.items.filter(item => item.kind === 'tool');
    expect(tools.map(item => item.kind === 'tool' && toolCallOf(item))).toEqual(
      [
        {
          id: 'tool-a',
          type: 'tool-call',
          toolCallId: 'a',
          toolName: 'x',
          args: { q: 1 },
          status: 'executing',
        },
        {
          id: 'tool-b',
          type: 'tool-call',
          toolCallId: 'b',
          toolName: 'y',
          args: {},
          result: { pending_approval: true },
          status: 'inProgress',
        },
        {
          id: 'tool-c',
          type: 'tool-call',
          toolCallId: 'c',
          toolName: 'z',
          args: {},
          result: {
            code_error: { name: 'E', value: 'v', traceback: 't' },
            exit_code: 3,
          },
          status: 'error',
          codeError: { name: 'E', value: 'v', traceback: 't' },
          exitCode: 3,
        },
      ],
    );
  });

  it('draws a result too long to keep as its words, and a failure’s words', () => {
    const limits = { ...BROWSER_LIMITS, toolText: 4 };
    const state = [
      { type: 'TOOL_CALL_SAID', toolCallId: 'a', toolCallName: 'x', args: {} },
      {
        type: 'TOOL_CALL_DONE',
        toolCallId: 'a',
        success: false,
        result: 'abcdef',
        error: 'no',
      },
    ].reduce(reduceConversation, emptyConversation(limits));
    const [card] = state.items.map(
      item => item.kind === 'tool' && toolCallOf(item),
    );
    expect(card).toMatchObject({ status: 'error', error: 'no' });
    expect((card as ToolCallMessage).result).toMatch(/^abcd… \(cut/);
  });

  it('says a failure as the assistant’s words, and draws no turn end', () => {
    const draw = conversationDrawer(text => `Error: ${text}`);
    const stopped = withTurnEnded(
      run([{ type: 'RUN_STARTED' }, { type: 'RUN_ERROR', message: 'down' }]),
      'stopped',
    );
    const items = draw(stopped, emptyChatLayer());
    expect(
      items.map(item => ('content' in item ? item.content : item.id)),
    ).toEqual(['hi', 'Error: down']);
    expect(items[1]).toMatchObject({ role: 'assistant' });
  });

  it('puts what the web holds beside each message, and steps after their row', () => {
    const draw = conversationDrawer(text => text);
    const state = run([
      { type: 'MESSAGE_SAID', messageId: 'm', role: 'assistant', text: 'ok' },
    ]);
    const at = new Date(0);
    const layer: ChatLayer = {
      extras: new Map([['u', { createdAt: at, metadata: { voice: 1 } }]]),
      displays: new Map([['m', [{ id: 'd', type: 'text/plain' } as never]]]),
      speakers: new Map([['m', { id: 's', name: 'Ada' }]]),
      steps: [
        { item: step('s0'), after: null },
        { item: step('s1'), after: 'u' },
        { item: step('s2'), after: 'gone' },
      ],
    };
    const items = draw(state, layer);
    expect(items.map(item => item.id)).toEqual(['s0', 'u', 's1', 'm', 's2']);
    expect(items[1]).toMatchObject({ createdAt: at, metadata: { voice: 1 } });
    expect(items[3]).toMatchObject({
      displays: [{ id: 'd' }],
      speaker: { name: 'Ada' },
    });
  });

  it('draws a row again only when it changed', () => {
    const draw = conversationDrawer(text => text);
    const layer = emptyChatLayer();
    const first = run([
      { type: 'MESSAGE_SAID', messageId: 'm', role: 'assistant', text: 'o' },
      { type: 'TOOL_CALL_SAID', toolCallId: 'c', toolCallName: 'x', args: {} },
    ]);
    const before = draw(first, layer);
    const second = reduceConversation(first, {
      type: 'MESSAGE_SAID',
      messageId: 'm',
      role: 'assistant',
      text: 'ok',
    });
    const after = draw(second, layer);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    const shown = draw(second, {
      ...layer,
      displays: new Map([['m', []]]),
    });
    expect(shown[1]).not.toBe(after[1]);
  });

  it('names the conversation row a drawn item is', () => {
    expect(rowIdOf(step('step-1'))).toBe('step-1');
    expect(rowIdOf({ ...step('x'), id: 'tool-x' })).toBe('x');
    expect(
      rowIdOf({ id: 'm', role: 'user', content: '', createdAt: new Date() }),
    ).toBe('m');
  });
});

describe('withToolSummaries', () => {
  const card = (result?: unknown): ToolCallMessage => ({
    id: 'tool-c1',
    type: 'tool-call',
    toolCallId: 'c1',
    toolName: 'datalayer_insertCell',
    args: { source: 'x' },
    status: result === undefined ? 'executing' : 'complete',
    ...(result === undefined ? {} : { result }),
  });
  const tools = [
    {
      name: 'datalayer_insertCell',
      summaryOf: (_args: unknown, result: unknown) =>
        (result as { editor?: { name?: string } }).editor?.name
          ? `on ${(result as { editor: { name: string } }).editor.name}`
          : undefined,
    },
  ];

  it('says what a returned call ran on', () => {
    const items = [card({ editor: { name: 'analysis.ipynb' } })];
    const [said] = withToolSummaries(items, tools) as ToolCallMessage[];
    expect(said.summary).toBe('on analysis.ipynb');
  });

  it('leaves a running call, another tool and an empty summary as drawn', () => {
    const running = [card()];
    expect(withToolSummaries(running, tools)).toBe(running);
    const other = [{ ...card({ editor: { name: 'a' } }), toolName: 'other' }];
    expect(withToolSummaries(other, tools)).toBe(other);
    const unnamed = [card({ ok: true })];
    expect(withToolSummaries(unnamed, tools)).toBe(unnamed);
    expect(withToolSummaries(unnamed)).toBe(unnamed);
  });
});
