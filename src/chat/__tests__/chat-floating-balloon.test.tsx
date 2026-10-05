/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating chat's assistant, by balloon display (LOOP T-23): what the
 * chat's items say reaches the character's balloon — the tool it calls, in
 * plain words, closed — and open, `history` is the conversation under a
 * header that counts it, `current` the one line said now over the composer.
 *
 * `ChatBase` and `AssistantStage` are stood in for: what is tested is what
 * the chrome hands them.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';

const seen = vi.hoisted(() => ({
  chatProps: [] as Array<Record<string, any>>,
  stage: [] as Array<Record<string, any>>,
}));

vi.mock('../base/ChatBase', () => ({
  ChatBase: (props: Record<string, any>) => {
    seen.chatProps.push(props);
    return <div data-testid="chat-base">{props.children}</div>;
  },
}));

vi.mock('../assistant/AssistantStage', () => ({
  AssistantStage: (props: Record<string, any>) => {
    seen.stage.push(props);
    return <div data-testid="stage" />;
  },
}));

import { ChatFloating } from '../ChatFloating';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
  seen.chatProps.length = 0;
  seen.stage.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  vi.useRealTimers();
});

async function render(
  props: Partial<React.ComponentProps<typeof ChatFloating>> = {},
) {
  // It greets for a moment when it arrives: past that, it acts the turn.
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <ChatFloating
          title="Assistant"
          description="Hello! Ask me anything."
          useStore={false}
          defaultViewMode="assistant"
          {...props}
        />
      </ThemeProvider>,
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  mounted.push(() => act(() => root.unmount()));
  return { container };
}

const chat = () => seen.chatProps[seen.chatProps.length - 1];
const stage = () => seen.stage[seen.stage.length - 1];

const asked = { id: 'u1', role: 'user', content: 'Open invoices?' };
const call = (status: string) => ({
  id: 'tc-1',
  role: 'assistant',
  toolName: 'list_invoices',
  toolCallId: '1',
  status,
});

async function turn(items: unknown[], loading = true) {
  await act(async () => {
    chat().onLoadingChange(loading);
    chat().onDisplayItemsChange(items);
  });
}

describe('the floating assistant’s balloon, by display', () => {
  it('history is the default, and says the tool it calls while closed', async () => {
    await render();
    expect(stage().balloonDisplay).toBe('history');
    await turn([asked, call('executing')]);
    expect(stage().balloon.tool).toMatchObject({
      tool: 'list_invoices',
      phase: 'running',
    });
    expect(stage().balloon.text).toBe('Using list_invoices…');
    expect(stage().insist).toBe(true);
    await turn([asked, call('complete')]);
    expect(stage().balloon.text).toBe('Done: list_invoices');
    await turn([asked, call('error')]);
    expect(stage().balloon.text).toBe('list_invoices failed');
  });

  it('history, closed: the balloon lists every message of the conversation', async () => {
    await render();
    await turn(
      [
        asked,
        call('complete'),
        { id: 'a1', role: 'assistant', content: 'Two: Ada and Grace.' },
        { id: 'u2', role: 'user', content: 'Since when?' },
        { id: 'a2', role: 'assistant', content: 'March and April.' },
      ],
      false,
    );
    expect(
      stage().balloon.history.map((m: { text: string }) => m.text),
    ).toEqual([
      'Open invoices?',
      'Two: Ada and Grace.',
      'Since when?',
      'March and April.',
    ]);
  });

  it('current, closed: no list, the one thing said', async () => {
    await render({ balloonDisplay: 'current' });
    await turn(
      [asked, { id: 'a1', role: 'assistant', content: 'Two.' }],
      false,
    );
    expect(stage().balloon.history).toBeUndefined();
  });

  it('current: the words as they are written, whole, and Now', async () => {
    await render({ balloonDisplay: 'current' });
    expect(stage().balloonDisplay).toBe('current');
    await turn([asked]);
    expect(stage().balloon.text).toBe('Thinking…');
    expect(stage().insist).toBe(true);
    const long =
      'Two invoices are open: Ada owes 1,200 euros since March and Grace 860 since April.';
    await turn([asked, { id: 'a1', role: 'assistant', content: long }]);
    expect(stage().balloon.text).toBe(long);
    expect(stage().balloon.speaking).toBe(true);
  });

  it('open, history counts the conversation in its header', async () => {
    const { container } = await render({ defaultOpen: true });
    await turn(
      [
        asked,
        call('complete'),
        { id: 'a1', role: 'assistant', content: 'Two.' },
      ],
      false,
    );
    const window = container.querySelector('[data-conversation-balloon]');
    expect(window?.getAttribute('data-balloon-display')).toBe('history');
    expect(window?.querySelector('[data-balloon-header]')?.textContent).toBe(
      'Conversation · 2',
    );
    expect(window?.querySelector('[data-balloon-current]')).toBeNull();
  });

  it('open, current is the line said now over the composer, no header', async () => {
    const { container } = await render({
      defaultOpen: true,
      balloonDisplay: 'current',
    });
    await turn([asked, call('executing')]);
    const window = container.querySelector('[data-conversation-balloon]');
    expect(window?.getAttribute('data-balloon-display')).toBe('current');
    expect(window?.querySelector('[data-balloon-header]')).toBeNull();
    expect(
      window?.querySelector('[data-balloon-current] [data-balloon-tool]')
        ?.textContent,
    ).toBe('Using list_invoices…');
  });
});

describe('the floating assistant’s suggestions and menu', () => {
  it('offers the chat’s suggestions in the balloon, and a click sends one to the chat', async () => {
    await render({
      suggestions: [
        { title: 'Open invoices', message: 'Which invoices are open?' },
      ],
    });
    expect(stage().suggestions).toEqual([
      { label: 'Open invoices', prompt: 'Which invoices are open?' },
    ]);
    const send = vi.fn();
    await act(async () => {
      chat().onSendReady({ send, stop: vi.fn(), newChat: vi.fn() });
    });
    await act(async () => {
      stage().onSuggestion(stage().suggestions[0]);
    });
    expect(send).toHaveBeenCalledWith('Which invoices are open?');
  });

  it('gives the menu what it can do: the conversation, stop while busy, the inspector', async () => {
    const inspector = { subscribe: () => () => {} } as never;
    await render({ inspector, onBalloonDisplayChange: vi.fn() });
    // The conversation: the chat opens, as a click on the character does.
    expect(stage().open).toBe(false);
    await act(async () => stage().onToggle());
    expect(stage().open).toBe(true);
    expect(stage().inspector).toBe(inspector);
    expect(chat().inspector).toBe(inspector);
    expect(stage().onBalloonDisplayChange).toBeTypeOf('function');
    // Stop, only while a turn runs, stops the chat.
    expect(stage().onStop).toBeUndefined();
    const stop = vi.fn();
    await act(async () => {
      chat().onSendReady({ send: vi.fn(), stop, newChat: vi.fn() });
      chat().onLoadingChange(true);
    });
    await act(async () => stage().onStop());
    expect(stop).toHaveBeenCalled();
    // No drag yet: nothing to put back.
    expect(stage().onResetPosition).toBeUndefined();
  });
});

describe('the floating assistant’s balloon, chosen in its menu', () => {
  it('switches to history and back, and tells the host', async () => {
    const onBalloonDisplayChange = vi.fn();
    await render({ balloonDisplay: 'current', onBalloonDisplayChange });
    expect(stage().balloonDisplay).toBe('current');
    await act(async () => stage().onBalloonDisplayChange('history'));
    expect(stage().balloonDisplay).toBe('history');
    expect(onBalloonDisplayChange).toHaveBeenCalledWith('history');
    await act(async () => stage().onBalloonDisplayChange('current'));
    expect(stage().balloonDisplay).toBe('current');
  });
});
