/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which side each speaker stands on, and that neither side moves.
 *
 * The person's messages belong on the right and the agent's on the left, and
 * both used to be true only approximately: each row shrank to its content, so
 * the bubble's percentage width resolved against geometry that re-settled
 * with every streamed chunk, and the person's own message drifted while the
 * agent was answering. The cure is full-width rows — fixed ground the
 * alignment can stand on — and these tests pin exactly that, from the real
 * component rather than from a description of it.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ChatMessageList } from '../ChatMessageList';
import type { DisplayItem } from '../../../types/chat';

function message(id: string, role: 'user' | 'assistant', text: string) {
  return {
    id,
    role,
    content: text,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as DisplayItem;
}

async function render(displayItems: DisplayItem[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChatMessageList
        displayItems={displayItems}
        isLoading={false}
        isStreaming={false}
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
      />,
    );
  });
  return { container, root };
}

/** The row that lays a message out: the flex *row* inside the message column. */
function rowOf(container: HTMLElement, text: string): CSSStyleDeclaration {
  // Both the outer column and this row carry the message as their whole text,
  // so the row is told apart by what makes it the row: a horizontal flex
  // direction.
  const node = [...container.querySelectorAll<HTMLElement>('div')].find(
    element =>
      element.textContent === text &&
      window.getComputedStyle(element).flexDirection.startsWith('row'),
  );
  expect(node).toBeDefined();
  return window.getComputedStyle(node!);
}

describe('who stands where', () => {
  it('pins the person right and the agent left, on full-width rows', async () => {
    const { container, root } = await render([
      message('m1', 'user', 'plot a chart'),
      message('m2', 'assistant', 'Here is the chart.'),
    ]);

    const user = rowOf(container, 'plot a chart');
    expect(user.flexDirection).toBe('row-reverse');
    // Full width is the point: a row shrunk to its content gives the
    // alignment nothing fixed to align against, and the bubble wanders as
    // the transcript grows.
    expect(user.width).toBe('100%');

    const agent = rowOf(container, 'Here is the chart.');
    expect(agent.flexDirection).toBe('row');
    expect(agent.width).toBe('100%');

    await act(async () => root.unmount());
  });
});
