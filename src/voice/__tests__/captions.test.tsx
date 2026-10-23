/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Captions always (VO-65): the sentence being said marked in the
 * open conversation, not by colour alone — the answer that holds it marked
 * `aria-current` and `data-voice-saying`, the sentence underlined in place
 * through the CSS Custom Highlight API, which jsdom lacks (stood in here).
 */

// @vitest-environment jsdom

import React, { act, createRef, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatMessageList } from '../../chat/messages/ChatMessageList';
import type { DisplayItem } from '../../types/chat';
import type { ChatMessage } from '../../types/messages';
import {
  SAID_HIGHLIGHT,
  saidMessageId,
  sentenceRange,
  useSaidSentence,
} from '../captions';

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

describe('the answer a sentence is said from', () => {
  const items = [
    message({ id: 'q', role: 'user', content: 'Is it sunny in Paris?' }),
    message({
      id: 'a1',
      content: 'It is **sunny** in Paris today. Take a hat.',
    }),
    message({ id: 'q2', role: 'user', content: 'And tomorrow?' }),
    message({ id: 'a2', content: 'Tomorrow it rains. Take a hat.' }),
  ];

  it('is the newest answer of the agent whose words hold it, read as plain words', () => {
    expect(saidMessageId(items, 'It is sunny in Paris today.')).toBe('a1');
    // Said in both: the newest.
    expect(saidMessageId(items, 'Take a hat.')).toBe('a2');
  });

  it('is none for a sentence no answer holds, or none being said', () => {
    expect(saidMessageId(items, 'Is it sunny in Paris?')).toBeUndefined();
    expect(saidMessageId(items, undefined)).toBeUndefined();
    expect(saidMessageId(items, '   ')).toBeUndefined();
  });
});

describe('where a sentence is shown', () => {
  it('is a range across the bold and the line breaks it is drawn with', () => {
    const element = document.createElement('div');
    element.innerHTML =
      '<p>First.</p><p>It is <strong>sunny</strong>\n   in Paris today. Then.</p>';
    const range = sentenceRange(element, 'It is sunny in Paris today.');
    expect(range).toBeDefined();
    expect(range!.toString().replace(/\s+/g, ' ')).toBe(
      'It is sunny in Paris today.',
    );
  });

  it('is none where the sentence is not shown as said', () => {
    const element = document.createElement('div');
    element.innerHTML = '<pre><code>print(1)</code></pre>';
    expect(sentenceRange(element, 'A code block.')).toBeUndefined();
  });
});

const avatarConfig = {
  userAvatar: 'me',
  assistantAvatar: 'ai',
  showAvatars: true,
  avatarSize: 24,
  userAvatarBg: 'accent.subtle',
  assistantAvatarBg: 'accent.emphasis',
};

/** A conversation as ChatBase draws it, with the hook underlining what is said. */
function Conversation({
  items,
  sentence,
}: {
  items: DisplayItem[];
  sentence?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSaidSentence(ref, sentence, items);
  return (
    <div ref={ref}>
      <ChatMessageList
        displayItems={items}
        isLoading={false}
        isStreaming={false}
        showLoadingIndicator={false}
        hideMessagesAfterToolUI={false}
        avatarConfig={avatarConfig}
        padding={3}
        emptyContent={null}
        messagesEndRef={createRef<HTMLDivElement>() as never}
        onRespond={async () => {}}
        saidMessageId={saidMessageId(items, sentence)}
      />
    </div>
  );
}

/** The CSS Custom Highlight API, as Chrome, Safari and Firefox have it. */
function standInHighlights() {
  const registered = new Map<string, { ranges: Range[] }>();
  class Highlight {
    ranges: Range[];
    constructor(...ranges: Range[]) {
      this.ranges = ranges;
    }
  }
  (globalThis as Record<string, unknown>).Highlight = Highlight;
  (globalThis as Record<string, unknown>).CSS = { highlights: registered };
  return registered;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).Highlight;
  delete (globalThis as Record<string, unknown>).CSS;
  document.body.innerHTML = '';
});

describe('the sentence being said, in the conversation', () => {
  const items = [
    message({ id: 'q', role: 'user', content: 'Weather?' }),
    message({ id: 'a', content: 'It is sunny in Paris today. Take a hat.' }),
  ] as DisplayItem[];

  async function draw(sentence?: string) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Conversation items={items} sentence={sentence} />);
    });
    return { container, root };
  }

  it('marks its answer aria-current, not by colour alone, and underlines the sentence', async () => {
    const highlights = standInHighlights();
    const { container, root } = await draw('Take a hat.');
    // The answer's Markdown is drawn after the first paint.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    const marked = container.querySelectorAll('[data-voice-saying]');
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute('aria-current')).toBe('true');
    expect(marked[0].getAttribute('data-chat-message')).toBe('assistant');
    expect(marked[0].textContent).toContain('Take a hat.');
    const underlined = highlights.get(SAID_HIGHLIGHT);
    expect(underlined?.ranges[0].toString()).toBe('Take a hat.');
    // The underline is drawn by a style, not a colour.
    expect(
      document.getElementById('datalayer-voice-said')?.textContent,
    ).toContain('text-decoration: underline');
    // Nothing said: no mark, no underline.
    await act(async () => {
      root.render(<Conversation items={items} />);
    });
    expect(container.querySelector('[data-voice-saying]')).toBeNull();
    expect(container.querySelector('[aria-current]')).toBeNull();
    expect(highlights.has(SAID_HIGHLIGHT)).toBe(false);
    await act(async () => root.unmount());
  });

  it('keeps the answer marked where the browser has no highlights', async () => {
    const { container, root } = await draw('It is sunny in Paris today.');
    expect(
      container
        .querySelector('[data-voice-saying]')
        ?.getAttribute('aria-current'),
    ).toBe('true');
    await act(async () => root.unmount());
  });

  it('marks nothing for a line said and not written', async () => {
    const highlights = standInHighlights();
    const { container, root } = await draw('One moment.');
    expect(container.querySelector('[data-voice-saying]')).toBeNull();
    expect(highlights.size).toBe(0);
    await act(async () => root.unmount());
  });
});
