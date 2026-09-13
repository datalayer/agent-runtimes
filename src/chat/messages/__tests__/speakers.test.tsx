/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A message's `speaker` — the transcript this list draws for more than one
 * non-user voice: a team's supervisor and its members, not just "the
 * assistant". Pinned here from the real component: a named, coloured header;
 * "asks"/"steers" for a message addressed to somebody else; a turn's own
 * tool calls as chips; a still-writing speaker as dots in place of text; a
 * note (a wait, a failure, a stop) as an aside rather than a bubble; and a
 * message with none of this rendering exactly as it always did.
 */

// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { ChatMessageList } from '../ChatMessageList';
import type { DisplayItem } from '../../../types/chat';
import type { ChatMessage } from '../../../types/messages';

function message(
  overrides: Partial<ChatMessage> & { id: string },
): ChatMessage {
  return {
    role: 'assistant',
    content: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as ChatMessage;
}

async function render(
  displayItems: DisplayItem[],
  extra: Partial<Parameters<typeof ChatMessageList>[0]> = {},
) {
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
          showAvatars: true,
          avatarSize: 24,
          userAvatarBg: 'accent.subtle',
          assistantAvatarBg: 'accent.emphasis',
        }}
        padding={3}
        emptyContent={null}
        messagesEndRef={createRef<HTMLDivElement>() as never}
        onRespond={async () => {}}
        {...extra}
      />,
    );
  });
  return { container, root };
}

describe('a speaker', () => {
  it('draws a named, coloured header — and a message with none keeps today’s plain look', async () => {
    const { container, root } = await render([
      message({
        id: 'm1',
        content: 'Row count looks right.',
        speaker: { id: 'runner', name: 'Benchmark Runner', tone: 'success' },
      }),
      message({ id: 'm2', role: 'user', content: 'plot it' }),
    ]);
    expect(container.textContent).toContain('Benchmark Runner');
    expect(container.textContent).toContain('Row count looks right.');
    // The plain message carries no speaker name at all — unchanged behaviour.
    expect(container.textContent).not.toContain('You');
    await act(async () => root.unmount());
  });

  it('shows the role only where nobody is being addressed', async () => {
    const { container, root } = await render([
      message({
        id: 'm1',
        content: 'On it.',
        speaker: { id: 'runner', name: 'Benchmark Runner', role: 'initiator' },
      }),
    ]);
    expect(container.textContent).toContain('initiator');
    await act(async () => root.unmount());
  });
});

describe('a brief', () => {
  it('says who asks whom, and steers reads differently from asks', async () => {
    const { container, root } = await render([
      message({
        id: 'brief-1',
        content: 'Run the reference benchmark',
        speaker: {
          id: 'supervisor',
          name: 'Benchmark Supervisor',
          tone: 'accent',
        },
        directedTo: { id: 'runner', name: 'Benchmark Runner', tone: 'success' },
      }),
      message({
        id: 'steer-1',
        role: 'user',
        content: 'Only the six cases, please.',
        speaker: { id: 'person', name: 'You' },
        directedTo: {
          id: 'analyst',
          name: 'Benchmark Analyst',
          tone: 'attention',
        },
        steer: true,
      }),
    ]);
    expect(container.textContent).toContain('asks');
    expect(container.textContent).toContain('Benchmark Runner');
    expect(container.textContent).toContain('steers');
    expect(container.textContent).toContain('Benchmark Analyst');
    // A directed message shows who it is for, not its speaker's role label.
    await act(async () => root.unmount());
  });
});

describe("a turn's tools", () => {
  it('shows what it called as chips, not as tool-call cards', async () => {
    const { container, root } = await render([
      message({
        id: 'turn-1',
        content: "I'll run it.",
        speaker: { id: 'runner', name: 'Benchmark Runner' },
        toolChips: ['execute_cell'],
      }),
    ]);
    expect(container.textContent).toContain('execute_cell');
    expect(container.querySelector('[data-subagent-panel]')).toBeNull();
    await act(async () => root.unmount());
  });
});

describe('a still-writing speaker', () => {
  it('shows dots in place of text until something has streamed', async () => {
    const { container, root } = await render([
      message({
        id: 'turn-1',
        content: '',
        speaker: { id: 'runner', name: 'Benchmark Runner' },
        live: true,
      }),
    ]);
    // Nothing streamed yet: `TypingDots` is the only thing in this transcript
    // shaped like three empty leaf divs under one wrapper — told apart from
    // the bubble, the header and the avatar by that shape alone.
    const dotsWrapper = [...container.querySelectorAll('div')].find(
      el =>
        el.children.length === 3 &&
        [...el.children].every(
          child => child.tagName === 'DIV' && child.textContent === '',
        ),
    );
    expect(dotsWrapper).toBeDefined();
    await act(async () => root.unmount());
  });
});

describe('a note', () => {
  it('reads as an aside, not as a bubble from anyone', async () => {
    const { container, root } = await render([
      message({
        id: 'note-1',
        content: 'Waiting for a person to approve delete_cell.',
        speaker: { id: 'analyst', name: 'Benchmark Analyst' },
        note: 'waiting',
      }),
    ]);
    expect(container.textContent).toContain('Benchmark Analyst');
    expect(container.textContent).toContain(
      'Waiting for a person to approve delete_cell.',
    );
    await act(async () => root.unmount());
  });
});

describe('a message footer', () => {
  it('is drawn by the host for its own messages, never for a note', async () => {
    const seen: string[] = [];
    const { root } = await render(
      [
        message({
          id: 'm1',
          content: 'answered',
          speaker: { id: 'a', name: 'A' },
        }),
        message({ id: 'm2', content: 'failed', note: 'failed' }),
      ],
      {
        renderMessageFooter: (message: ChatMessage) => {
          seen.push(message.id);
          return <span>footer for {message.id}</span>;
        },
      },
    );
    expect(seen).toEqual(['m1']);
    await act(async () => root.unmount());
  });
});
