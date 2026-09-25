/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `TurnFooter`: a turn's accounting row, in the usage band's idiom.
 *
 * What is pinned: the row closes each finished turn with the familiar
 * `ctx · turn ▲▼` figures and its two actions; while the turn streams the
 * numbers show without the actions (nothing to copy or remove mid-answer);
 * the copy action serialises the turn's messages and the remove action hands
 * back exactly the turn's item ids; and a host that asks for a bare
 * transcript gets one.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatMessageList } from '../ChatMessageList';
import type { DisplayItem } from '../../../types/chat';
import type { ContextSnapshotData } from '../../../types/context';

function message(id: string, role: 'user' | 'assistant', text: string) {
  return {
    id,
    role,
    content: text,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as DisplayItem;
}

const USAGE = {
  totalTokens: 324,
  contextWindow: 128000,
  sumResponseInputTokens: 0,
  sumResponseOutputTokens: 0,
  systemPromptTokens: 0,
  userMessageTokens: 0,
  assistantMessageTokens: 0,
  toolTokens: 0,
  toolCallTokens: 0,
  toolReturnTokens: 0,
  historyToolCallTokens: 0,
  historyToolReturnTokens: 0,
  currentToolCallTokens: 0,
  currentToolReturnTokens: 0,
  turnUsage: {
    inputTokens: 12,
    outputTokens: 34,
    requests: 1,
    toolCalls: 0,
  },
} as ContextSnapshotData;

type RenderOptions = {
  streaming?: boolean;
  showTurnFooters?: boolean;
  onRemoveItems?: (ids: string[]) => void;
};

async function render(
  displayItems: DisplayItem[],
  {
    streaming = false,
    showTurnFooters = true,
    onRemoveItems,
  }: RenderOptions = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChatMessageList
        displayItems={displayItems}
        isLoading={streaming}
        isStreaming={streaming}
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
        showTurnFooters={showTurnFooters}
        agentUsage={USAGE}
        onRemoveItems={onRemoveItems}
      />,
    );
  });
  return { container, root };
}

const TURN = [
  message('u1', 'user', 'plot a chart'),
  message('a1', 'assistant', 'Done.'),
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the turn footer', () => {
  it('closes a finished turn in the usage band idiom, actions included', async () => {
    const { container, root } = await render(TURN);

    const footer = container.querySelector<HTMLElement>('[data-turn-footer]');
    expect(footer).not.toBeNull();
    // 324 / 128.0K ctx · turn 12▲ 34▼ — the same words the prompt band uses.
    expect(footer!.textContent).toContain('324');
    expect(footer!.textContent).toContain('128.0K ctx');
    expect(footer!.textContent).toContain('turn 12');
    expect(footer!.textContent).toContain('34');
    expect(footer!.querySelector('[data-turn-copy]')).not.toBeNull();
    expect(footer!.querySelector('[data-turn-remove]')).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('shows the ticking figures without actions while streaming', async () => {
    const { container, root } = await render(TURN, { streaming: true });

    const footer = container.querySelector<HTMLElement>('[data-turn-footer]');
    expect(footer).not.toBeNull();
    expect(footer!.textContent).toContain('ctx');
    expect(footer!.querySelector('[data-turn-copy]')).toBeNull();
    expect(footer!.querySelector('[data-turn-remove]')).toBeNull();

    await act(async () => root.unmount());
  });

  it('hands back exactly the turn on remove', async () => {
    const removed: string[][] = [];
    const items = [
      ...TURN,
      message('u2', 'user', 'and a table'),
      message('a2', 'assistant', 'Table done.'),
    ];
    const { container, root } = await render(items, {
      onRemoveItems: ids => removed.push(ids),
    });

    const footers =
      container.querySelectorAll<HTMLElement>('[data-turn-footer]');
    expect(footers).toHaveLength(2);
    await act(async () => {
      footers[0].querySelector<HTMLElement>('[data-turn-remove]')!.click();
    });
    expect(removed).toEqual([['u1', 'a1']]);

    await act(async () => root.unmount());
  });

  it('copies the turn as text', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });

    const { container, root } = await render(TURN);
    await act(async () => {
      container.querySelector<HTMLElement>('[data-turn-copy]')!.click();
    });
    expect(written).toEqual(['You: plot a chart\n\nDone.']);

    await act(async () => root.unmount());
  });

  it('stays out of a transcript that asked to be bare', async () => {
    const { container, root } = await render(TURN, { showTurnFooters: false });
    expect(container.querySelector('[data-turn-footer]')).toBeNull();
    await act(async () => root.unmount());
  });
});
