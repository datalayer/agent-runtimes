/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `ChatFloating` holding a conversation its host draws (LOOP R-01): the
 * embed's bubble, panel and assistant hold the LOOP workspace, and keep
 * their chrome — the window's header and close, the button's balloon and
 * blink on words not yet heard, the assistant acting what the host says the
 * conversation is doing and saying its words.
 *
 * `ChatBase` and `AssistantStage` are stood in for: what is tested is what
 * the chrome draws and hands them.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import type { FloatingConversation } from '../ChatFloating';
import { ASSISTANT_WORDS } from '../assistant/state';

const seen = vi.hoisted(() => ({
  chatBase: 0,
  chatProps: [] as Array<Record<string, any>>,
  stage: [] as Array<Record<string, any>>,
}));

vi.mock('../base/ChatBase', () => ({
  ChatBase: (props: Record<string, any>) => {
    seen.chatBase += 1;
    seen.chatProps.push(props);
    return (
      <div data-testid="chat-base">
        {props.trailingContent}
        {props.footerContent}
      </div>
    );
  },
}));

vi.mock('../assistant/AssistantStage', () => ({
  AssistantStage: (props: Record<string, any>) => {
    seen.stage.push(props);
    return <div data-testid="stage" />;
  },
}));

import { ChatFloating } from '../ChatFloating';

// jsdom has none; the panel measures its host with one.
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
  seen.chatBase = 0;
  seen.chatProps.length = 0;
  seen.stage.length = 0;
  localStorage.clear();
  sessionStorage.clear();
});

const conversation = (
  change: Partial<FloatingConversation> = {},
): FloatingConversation => ({
  body: <div data-testid="workspace">the workspace</div>,
  presence: 'idle',
  answering: false,
  ...change,
});

async function render(
  props: Partial<React.ComponentProps<typeof ChatFloating>>,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const draw = async (
    next: Partial<React.ComponentProps<typeof ChatFloating>>,
  ) =>
    act(async () => {
      root.render(
        <ThemeProvider>
          <ChatFloating
            title="Support Desk"
            description="Ask me about your order."
            useStore={false}
            {...next}
          />
        </ThemeProvider>,
      );
    });
  await draw(props);
  mounted.push(() => act(() => root.unmount()));
  return { container, draw };
}

describe('ChatFloating, holding its host’s conversation', () => {
  it('draws the host’s conversation under its own header, not the chat', async () => {
    const { container } = await render({
      defaultViewMode: 'floating-small',
      conversation: conversation(),
    });
    expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
    expect(
      container.querySelector('[data-floating-conversation]')?.textContent,
    ).toBe('the workspace');
    expect(seen.chatBase).toBe(0);
    expect(container.textContent).toContain('Support Desk');
    expect(
      container.querySelector('button[aria-label="Close"]'),
    ).not.toBeNull();
  });

  it('opens and closes the window from the bubble, the conversation kept mounted', async () => {
    const { container } = await render({
      defaultViewMode: 'floating-small',
      buttonTooltip: 'Talk to Support Desk',
      conversation: conversation(),
    });
    const open = container.querySelector(
      'button[aria-label="Talk to Support Desk"]',
    ) as HTMLButtonElement;
    await act(async () => open.click());
    const window = container.querySelector('[data-floating-conversation]')!
      .parentElement as HTMLElement;
    expect(getComputedStyle(window).visibility).toBe('visible');
    await act(async () => {
      (
        container.querySelector('button[aria-label="Close"]') as HTMLElement
      ).click();
      await new Promise(resolve => setTimeout(resolve, 250));
    });
    expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
  });

  it('stands the panel at the viewport’s right edge, full height, when its host holds nothing of the page', async () => {
    const { container } = await render({
      defaultViewMode: 'panel',
      buttonTooltip: 'Talk to Support Desk',
      conversation: conversation(),
    });
    const open = container.querySelector(
      'button[aria-label="Talk to Support Desk"]',
    ) as HTMLButtonElement;
    await act(async () => open.click());
    const panel = container.querySelector('[data-floating-conversation]')!
      .parentElement as HTMLElement;
    const style = getComputedStyle(panel);
    expect(style.height).toBe(`${window.innerHeight}px`);
    expect(style.top).toBe('0px');
    expect(style.right).toBe('0px');
  });

  it('rings the bubble and says the words in its balloon while they are not heard', async () => {
    const { container, draw } = await render({
      defaultViewMode: 'floating-small',
      buttonTooltip: 'Talk to Support Desk',
      conversation: conversation(),
    });
    const ring = () =>
      [...container.querySelectorAll('div')].some(element =>
        getComputedStyle(element).animation.includes('pulse'),
      );
    expect(container.textContent).not.toContain('Your order left today.');
    await draw({
      defaultViewMode: 'floating-small',
      buttonTooltip: 'Talk to Support Desk',
      conversation: conversation({
        saying: { id: 'm1', text: 'Your order left today.', more: false },
      }),
    });
    const button = container.querySelector(
      'button[aria-label="Talk to Support Desk"]',
    ) as HTMLElement;
    await act(async () => {
      button.parentElement!.dispatchEvent(
        new MouseEvent('mouseover', { bubbles: true }),
      );
    });
    expect(container.textContent).toContain('Your order left today.');
    // Heard once the window is opened: no balloon, no ring after.
    await act(async () => button.click());
    expect(ring()).toBe(false);
  });

  it('has the assistant act what the host says it is doing, and say its words', async () => {
    const { draw } = await render({
      defaultViewMode: 'assistant',
      conversation: conversation(),
    });
    expect(seen.stage.at(-1)!.balloon).toEqual({
      text: 'Ask me about your order.',
    });
    // It greets as it arrives; then it acts the conversation.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1900));
    });
    await draw({
      defaultViewMode: 'assistant',
      conversation: conversation({
        presence: 'waiting',
      }),
    });
    expect(seen.stage.at(-1)!.state).toBe('waiting');
    await draw({
      defaultViewMode: 'assistant',
      conversation: conversation({
        presence: 'thinking',
        answering: true,
        saying: { id: 'm2', text: 'It left today.', more: false },
      }),
    });
    const props = seen.stage.at(-1)!;
    expect(props.balloon).toMatchObject({
      text: 'It left today.',
      more: false,
    });
    expect(typeof props.balloon.onDismiss).toBe('function');
    expect(props.insist).toBe(true);
    expect(typeof props.onDismiss).toBe('function');
    expect(typeof props.onDragStart).toBe('function');
  });
  it('dozes while the host says it is paused, and says so in its balloon', async () => {
    const { draw } = await render({
      defaultViewMode: 'assistant',
      conversation: conversation({ presence: 'paused' }),
    });
    await draw({
      defaultViewMode: 'assistant',
      conversation: conversation({ presence: 'paused' }),
    });
    const props = seen.stage.at(-1)!;
    expect(props.state).toBe('paused');
    expect(props.balloon).toEqual({ text: ASSISTANT_WORDS.paused });
  });

  it('holds the first approval in its balloon, answered by the chat’s own answers (T-23)', async () => {
    const onApproveApproval = vi.fn();
    const onRejectApproval = vi.fn();
    const pendingApprovals = [
      {
        id: 'ap-1',
        toolName: 'send_email',
        args: {},
        agentId: 'a',
        requestedAt: '2026-10-05T00:00:00Z',
      },
      {
        id: 'ap-2',
        toolName: 'delete_file',
        args: {},
        agentId: 'a',
        requestedAt: '2026-10-05T00:00:01Z',
      },
    ];
    await render({
      defaultViewMode: 'assistant',
      conversation: conversation({ presence: 'waiting' }),
      pendingApprovals,
      onApproveApproval,
      onRejectApproval,
    });
    const props = seen.stage.at(-1)!;
    const balloon = props.balloon as {
      text: string;
      approval: {
        asks: string;
        others: number;
        onApprove: () => void;
        onDeny: () => void;
      };
    };
    expect(balloon.text).toBe(ASSISTANT_WORDS.approval);
    expect(balloon.approval.asks).toBe('send_email');
    expect(balloon.approval.others).toBe(1);
    expect(props.insist).toBe(true);
    await act(async () => balloon.approval.onApprove());
    await act(async () => balloon.approval.onDeny());
    expect(onApproveApproval).toHaveBeenCalledWith('ap-1');
    expect(onRejectApproval).toHaveBeenCalledWith('ap-1');
  });
});

describe('the assistant’s conversation, as its balloon', () => {
  const pendingApprovals = [
    {
      id: 'ap-1',
      toolName: 'send_email',
      args: {},
      agentId: 'a',
      requestedAt: '2026-10-05T00:00:00Z',
    },
  ];

  it('is toggled by the character, closes from its corner, and keeps the conversation', async () => {
    const { container } = await render({
      defaultViewMode: 'assistant',
      conversation: conversation(),
    });
    const balloon = () =>
      container.querySelector('[data-conversation-balloon]') as HTMLElement;
    expect(getComputedStyle(balloon()).visibility).toBe('hidden');
    await act(async () => seen.stage.at(-1)!.onToggle());
    expect(getComputedStyle(balloon()).visibility).toBe('visible');
    expect(seen.stage.at(-1)!.open).toBe(true);
    // No header: the window's title is not drawn, its own close is.
    expect(container.textContent).not.toContain('Support Desk');
    expect(container.querySelector('button[aria-label="Close"]')).toBeNull();
    const close = container.querySelector(
      '[data-conversation-balloon-close] button',
    ) as HTMLButtonElement;
    await act(async () => {
      close.click();
      await new Promise(resolve => setTimeout(resolve, 250));
    });
    expect(getComputedStyle(balloon()).visibility).toBe('hidden');
    expect(container.querySelector('[data-testid="workspace"]')).not.toBeNull();
    // A click on the character opens it again, and another closes it.
    await act(async () => seen.stage.at(-1)!.onToggle());
    expect(getComputedStyle(balloon()).visibility).toBe('visible');
    await act(async () => {
      seen.stage.at(-1)!.onToggle();
      await new Promise(resolve => setTimeout(resolve, 250));
    });
    expect(getComputedStyle(balloon()).visibility).toBe('hidden');
  });

  it('holds the chat bare: the history with the welcome first, the Lexical composer, no header nor footer', async () => {
    await render({
      defaultViewMode: 'assistant',
      decisions: { serverUrl: 'http://localhost:8765' },
    });
    const props = seen.chatProps.at(-1)!;
    expect(props).toMatchObject({
      showHeader: false,
      showPoweredBy: false,
      promptVariant: 'lexical',
      showModelSelector: false,
      showToolsMenu: false,
      showSkillsMenu: false,
      showTokenUsage: false,
      showAgentsMenu: false,
      showTurnFooter: false,
      showToolApprovalBanner: false,
      welcome: 'Ask me about your order.',
    });
    // Ask a decision, beside the composer.
    expect(
      document.querySelector(
        '[data-balloon-decisions] [data-balloon-ask-decision]',
      ),
    ).not.toBeNull();
  });

  it('holds an approval as a message of the history, with Approve and Deny', async () => {
    const onApproveApproval = vi.fn();
    await render({
      defaultViewMode: 'assistant',
      pendingApprovals,
      onApproveApproval,
      onRejectApproval: vi.fn(),
    });
    const held = document.querySelector(
      '[data-testid="chat-base"] [data-balloon-approval="ap-1"]',
    );
    expect(held?.textContent).toContain('send_email');
    const approve = Array.from(held!.querySelectorAll('button')).find(
      button => button.textContent === ASSISTANT_WORDS.approve,
    )!;
    await act(async () => approve.click());
    expect(onApproveApproval).toHaveBeenCalledWith('ap-1');
  });

  it('peeks a new message by its first words, and lets it be dismissed', async () => {
    const { draw } = await render({
      defaultViewMode: 'assistant',
      conversation: conversation(),
    });
    // Past its greeting, which insists of its own.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1900));
    });
    const long =
      'Your order left the warehouse this morning and should reach you on Thursday, by noon.';
    await draw({
      defaultViewMode: 'assistant',
      conversation: conversation({
        presence: 'idle',
        saying: { id: 'm3', text: long, more: false },
      }),
    });
    let props = seen.stage.at(-1)!;
    expect(props.balloon.text.endsWith('…')).toBe(true);
    expect(props.balloon.text.length).toBeLessThan(long.length);
    expect(props.balloon.more).toBe(true);
    expect(props.insist).toBe(true);
    await act(async () => props.balloon.onDismiss());
    props = seen.stage.at(-1)!;
    expect(props.insist).toBe(false);
    expect(props.balloon).toEqual({ text: 'Ask me about your order.' });
  });

  it('keeps an approval’s peek until it is answered: it cannot be dismissed', async () => {
    const { draw } = await render({
      defaultViewMode: 'assistant',
      conversation: conversation({ presence: 'waiting' }),
      pendingApprovals,
      onApproveApproval: vi.fn(),
      onRejectApproval: vi.fn(),
    });
    let props = seen.stage.at(-1)!;
    expect(props.balloon.approval.asks).toBe('send_email');
    expect(props.balloon.onDismiss).toBeUndefined();
    expect(props.insist).toBe(true);
    // Answered elsewhere: the peek goes.
    await draw({
      defaultViewMode: 'assistant',
      conversation: conversation({ presence: 'idle' }),
      pendingApprovals: [],
      onApproveApproval: vi.fn(),
      onRejectApproval: vi.fn(),
    });
    props = seen.stage.at(-1)!;
    expect(props.balloon.approval).toBeUndefined();
  });
});
