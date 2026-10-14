/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Read aloud* (VOICE.md VO-21, `on_request`): under each answer the agent
 * has finished, a button that reads that answer from its start — what was
 * being said stops first.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ChatMessageList } from '../../chat/messages/ChatMessageList';
import type { DisplayItem } from '../../types/chat';
import type { ChatMessage } from '../../types/messages';
import { getMessageText } from '../../utils';
import { ReadAloud, readAloud, readsAloud } from '../ReadAloud';

function message(
  id: string,
  role: 'user' | 'assistant',
  text: string,
  more: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    role,
    content: text,
    createdAt: new Date('2026-10-14T00:00:00Z'),
    ...more,
  } as ChatMessage;
}

describe('reading an answer aloud (VO-21)', () => {
  it('stops what was being said, then says the answer as plain words, sentence by sentence', () => {
    const calls: string[] = [];
    const said = readAloud(
      {
        unlock: () => calls.push('unlock'),
        stop: () => calls.push('stop'),
        say: sentence => calls.push(`say ${sentence}`),
      },
      'The report is **ready**. It costs 3.5 dollars.\n\n```py\nprint(1)\n```',
    );
    expect(calls.slice(0, 2)).toEqual(['unlock', 'stop']);
    expect(said[0]).toBe('The report is ready.');
    expect(said.join(' ')).toContain('3.5 dollars');
    expect(said.join(' ')).not.toContain('print(1)');
    expect(calls.slice(2)).toEqual(said.map(sentence => `say ${sentence}`));
  });

  it('is offered under a finished answer of the agent only', () => {
    const answer = message('a1', 'assistant', 'Done.');
    expect(readsAloud(answer, 'Done.', undefined)).toBe(true);
    // The answer being written, a live one, a note, a person's message, an empty one: not.
    expect(readsAloud(answer, 'Done.', 'a1')).toBe(false);
    expect(readsAloud({ ...answer, live: true }, 'Done.', undefined)).toBe(
      false,
    );
    expect(readsAloud({ ...answer, note: 'stopped' }, 'Done.', undefined)).toBe(
      false,
    );
    expect(readsAloud(message('u1', 'user', 'Hi'), 'Hi', undefined)).toBe(
      false,
    );
    expect(readsAloud(answer, '  ', undefined)).toBe(false);
  });

  it('draws the button under each finished answer, and reads that answer when pressed', async () => {
    const read: string[] = [];
    const items: DisplayItem[] = [
      message('u1', 'user', 'How is the report?'),
      message('a1', 'assistant', 'The report is ready.'),
      message('u2', 'user', 'And the invoice?'),
      message('a2', 'assistant', 'Still being writ'),
    ];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChatMessageList
          displayItems={items}
          isLoading={true}
          isStreaming={true}
          showLoadingIndicator={false}
          hideMessagesAfterToolUI={false}
          avatarConfig={{
            userAvatar: 'me',
            assistantAvatar: 'ai',
            showAvatars: false,
            avatarSize: 24,
            userAvatarBg: 'accent.subtle',
            assistantAvatarBg: 'accent.emphasis',
          }}
          padding={3}
          emptyContent={null}
          messagesEndRef={createRef<HTMLDivElement>() as never}
          onRespond={async () => {}}
          showTurnFooters={false}
          renderMessageFooter={item => {
            const text = getMessageText(item);
            return readsAloud(item, text, 'a2') ? (
              <ReadAloud onRead={() => read.push(text)} />
            ) : null;
          }}
        />,
      );
    });
    const buttons = container.querySelectorAll('[data-read-aloud]');
    // Only the finished answer: not the person's messages, not the one being written.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toBe('Read aloud');
    await act(async () => {
      (buttons[0] as HTMLButtonElement).click();
    });
    expect(read).toEqual(['The report is ready.']);
    act(() => root.unmount());
    container.remove();
  });
});
