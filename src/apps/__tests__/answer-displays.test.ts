/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a message shows arrives as a `reactor.ui` display and is kept on the
 * message (REACTOR_UI RU-2), from the conversation's ui socket (RU-W); a
 * thread's snapshot is its text, and refuses a display.
 */

import { describe, expect, it } from 'vitest';
import {
  AGUI_NAME,
  AguiUiDecoder,
  type Display,
  type UiOp,
} from '@datalayer/reactor/ui';
import { withUiOp } from '../../chat/base/uiOps';
import { messagesOfThread } from '../../portable/thread';
import type { ChatMessage } from '../../types/messages';

const display = (
  id: string,
  messageId: string,
  text = 'Bot showed Table runs',
): Display => ({
  type: 'application/vnd.datalayer.loop.answer+json',
  version: 1,
  id,
  text,
  data: { message_id: messageId, title: 'Bot', summary: text, rows: [] },
  actions: [],
});

const said = (id: string, content: string): ChatMessage => ({
  id,
  role: 'assistant',
  content,
  createdAt: new Date(0),
});

describe('displays under messages', () => {
  it('keeps a display on its message, changes it in place, takes it away', () => {
    const decoder = new AguiUiDecoder();
    const shown = decoder.decode({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: 'm1-shows',
      activityType: AGUI_NAME,
      content: { scope: 's', display: display('m1-shows', 'm1') },
    }) as UiOp;
    let items = withUiOp([said('m0', 'Hi'), said('m1', 'Two runs.')], shown);
    expect(items[1].displays?.map(one => one.id)).toEqual(['m1-shows']);
    expect(items[0].displays).toBeUndefined();

    const patched = decoder.decode({
      type: 'ACTIVITY_DELTA',
      messageId: 'm1-shows',
      activityType: AGUI_NAME,
      patch: [
        {
          op: 'replace',
          path: '/display/text',
          value: 'Bot showed Table runs (3)',
        },
        { op: 'add', path: '/display/data/rows/-', value: { model: 'a' } },
      ],
    }) as UiOp;
    items = withUiOp(items, patched);
    expect(items[1].displays?.[0].text).toBe('Bot showed Table runs (3)');
    expect(items[1].displays?.[0].data?.rows).toEqual([{ model: 'a' }]);

    // Shown again under its id: replaced, not added.
    items = withUiOp(items, {
      ...shown,
      body: display('m1-shows', 'm1', 'Again'),
    } as UiOp);
    expect(items[1].displays?.map(one => one.text)).toEqual(['Again']);

    items = withUiOp(items, { v: 1, op: 'remove', scope: 's', id: 'm1-shows' });
    expect(items[1].displays).toEqual([]);
  });

  it('refuses a display under no message here, or a change to one never shown', () => {
    expect(() =>
      withUiOp([said('m1', 'x')], {
        v: 1,
        op: 'show',
        scope: 's',
        id: 'd',
        body: display('d', 'elsewhere'),
      }),
    ).toThrow(/not here/);
    expect(() =>
      withUiOp([said('m1', 'x')], {
        v: 1,
        op: 'show',
        scope: 's',
        id: 'd',
        body: { ...display('d', 'm1'), data: {} },
      }),
    ).toThrow(/says no message/);
    expect(() =>
      withUiOp([said('m1', 'x')], {
        v: 1,
        op: 'remove',
        scope: 's',
        id: 'gone',
      }),
    ).toThrow(/Nothing here is gone/);
  });

  it('draws a thread’s text, and refuses a display', () => {
    const drawn = messagesOfThread([
      { id: 'u1', role: 'user', content: 'Runs?' },
      { id: 'm1', role: 'assistant', content: 'Two runs.' },
      // A message that said nothing is drawn by the chat when its socket
      // shows something under it (`ChatBase`, history).
      { id: 'm2', role: 'assistant', content: '' },
    ]);
    expect(drawn.map(m => [m.id, m.content])).toEqual([
      ['u1', 'Runs?'],
      ['m1', 'Two runs.'],
    ]);
    // What a message showed comes on the ui socket, never in a thread.
    expect(() =>
      messagesOfThread([
        {
          id: 'm1-shows',
          role: 'activity',
          activityType: AGUI_NAME,
          content: { scope: 's', display: display('m1-shows', 'm1') },
        },
      ]),
    ).toThrow(/ui socket/);
  });
});
