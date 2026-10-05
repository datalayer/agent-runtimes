/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant's two balloon displays (LOOP T-23): `history`, a
 * peek closed and the whole conversation open, counted in its header;
 * `current`, only what is said or done now, *Now* on it, nothing to scroll.
 * Either way a tool call is said in plain words — "Using list_invoices…",
 * "Done: list_invoices", "list_invoices failed" — and heard once as it starts
 * and once as it ends.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayItem } from '../../types/chat';
import { ThemeProvider } from '@primer/react';
import {
  AssistantStage,
  type AssistantStageProps,
} from '../assistant/AssistantStage';
import {
  BALLOON_DISPLAYS,
  conversationCount,
  newestToolLine,
  toolAnnouncement,
  toolDisplayName,
  toolLineOfStep,
  toolLineText,
  type BalloonToolLine,
} from '../assistant/toolLine';
import { conversationHeaderText } from '../assistant/BalloonParts';

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render(props: Partial<AssistantStageProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const draw = (next: Partial<AssistantStageProps>) =>
    act(async () => {
      root.render(
        <ThemeProvider>
          <AssistantStage
            character="paperclip"
            state="working"
            place={{ left: 10, top: 300 }}
            stageRef={createRef<HTMLDivElement>()}
            onDragStart={() => {}}
            open={false}
            onToggle={() => {}}
            onDismiss={() => {}}
            insist
            {...next}
          />
        </ThemeProvider>,
      );
    });
  await draw(props);
  mounted.push(() => act(() => root.unmount()));
  return { container, draw };
}

const line = (phase: BalloonToolLine['phase'], id = 'c1'): BalloonToolLine => ({
  id,
  tool: 'list_invoices',
  name: 'list_invoices',
  phase,
});

const balloonOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-speech-balloon]');
const announced = (container: HTMLElement) =>
  container.querySelector('[data-balloon-announce]')?.textContent;

describe('tool lines, in plain words', () => {
  it('say a call as it starts, ends and fails', () => {
    expect(toolLineText(line('running'))).toBe('Using list_invoices…');
    expect(toolLineText(line('done'))).toBe('Done: list_invoices');
    expect(toolLineText(line('failed'))).toBe('list_invoices failed');
    expect(
      toolLineText({ ...line('running'), words: 'Asking Accounting…' }),
    ).toBe('Asking Accounting…');
  });

  it('name a tool as its spec does, else without its MCP server', () => {
    expect(toolDisplayName('current_time')).toBe('Current Time');
    expect(toolDisplayName('odoo__list_invoices')).toBe('list_invoices');
    expect(toolDisplayName('list_invoices')).toBe('list_invoices');
  });

  it('are read from the conversation’s newest item, a tool call', () => {
    const asked = { id: 'u', role: 'user', content: 'Invoices?' };
    const call = {
      id: 'tc-1',
      role: 'assistant',
      toolName: 'list_invoices',
      toolCallId: '1',
      status: 'executing',
    };
    expect(newestToolLine([asked])).toBeUndefined();
    expect(newestToolLine([asked, call])?.phase).toBe('running');
    expect(
      newestToolLine([asked, { ...call, status: 'complete' }])?.phase,
    ).toBe('done');
    expect(newestToolLine([asked, { ...call, status: 'error' }])?.phase).toBe(
      'failed',
    );
    // Once words follow it, the answer is what is said.
    expect(
      newestToolLine([
        asked,
        call,
        { id: 'a', role: 'assistant', content: 'Two.' },
      ]),
    ).toBeUndefined();
    expect(
      conversationCount([
        asked,
        call,
        { id: 'a', role: 'assistant', content: 'Two.' },
      ]),
    ).toBe(2);
    expect(conversationHeaderText(6)).toBe('Conversation · 6');
  });

  it('are read from a step a peer told over A2A', () => {
    expect(
      toolLineOfStep({ id: 'x', name: 'list_invoices', ended: false }),
    ).toMatchObject({ id: 'x', phase: 'running' });
    expect(
      toolLineOfStep({ id: 'x', name: 'list_invoices', ended: true }).phase,
    ).toBe('done');
    expect(
      toolLineOfStep({
        id: 'x',
        name: 'list_invoices',
        ended: true,
        error: 'refused',
      }).phase,
    ).toBe('failed');
  });

  it('are announced once per start and once per end, never while running', () => {
    expect(toolAnnouncement(line('running'), undefined)).toBe(
      'Using list_invoices…',
    );
    expect(
      toolAnnouncement(line('running'), { id: 'c1', phase: 'running' }),
    ).toBeUndefined();
    expect(toolAnnouncement(line('done'), { id: 'c1', phase: 'running' })).toBe(
      'Done: list_invoices',
    );
    expect(toolAnnouncement(undefined, undefined)).toBeUndefined();
  });
});

describe('the two balloon displays', () => {
  it('are history and current', () => {
    expect(BALLOON_DISPLAYS).toEqual(['history', 'current']);
  });

  it('history: a peek of the newest words, no Now', async () => {
    const { container } = await render({
      balloon: { text: 'Three customers wrote.' },
    });
    const balloon = balloonOf(container);
    expect(balloon?.getAttribute('data-balloon-display')).toBe('history');
    expect(balloon?.textContent).toContain('Three customers wrote.');
    expect(balloon?.querySelector('[data-balloon-now]')).toBeNull();
    expect(
      container
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-balloon'),
    ).toBe('history');
  });

  it('current: Now, the words cut to a few lines, read out once all arrive', async () => {
    const { container } = await render({
      balloonDisplay: 'current',
      balloon: { text: 'Three customers wrote', speaking: true, busy: true },
    });
    const balloon = balloonOf(container);
    expect(balloon?.getAttribute('data-balloon-display')).toBe('current');
    expect(
      balloon
        ?.querySelector('[data-balloon-now]')
        ?.getAttribute('data-balloon-now'),
    ).toBe('busy');
    const words = balloon?.querySelector('[data-balloon-current-text]');
    expect(words?.textContent).toBe('Three customers wrote');
    expect(words?.getAttribute('aria-busy')).toBe('true');
    // Nothing in it scrolls.
    expect(
      (words as HTMLElement | null)?.style.overflow ||
        getComputedStyle(words as Element).overflow,
    ).toBe('hidden');
  });

  it('current: what goes with the words, under them', async () => {
    const { container } = await render({
      balloonDisplay: 'current',
      balloon: {
        text: 'Here it is.',
        attachment: <div data-testid="given">a notebook</div>,
      },
    });
    expect(
      container.querySelector(
        '[data-balloon-attachment] [data-testid="given"]',
      ),
    ).not.toBeNull();
  });
});

describe('a tool call in the balloon', () => {
  for (const display of ['history', 'current'] as const) {
    it(`${display}: replaces the words while it runs, then says how it ended`, async () => {
      const { container, draw } = await render({
        balloonDisplay: display,
        balloon: {
          text: toolLineText(line('running')),
          tool: line('running'),
        },
      });
      const tool = () => container.querySelector('[data-balloon-tool]');
      // The chat's own tool card, its status the call's.
      const status = () =>
        tool()
          ?.querySelector('[data-tool-call="list_invoices"]')
          ?.getAttribute('data-tool-call-status');
      expect(tool()?.getAttribute('data-balloon-tool')).toBe('running');
      expect(status()).toBe('executing');
      // Heard in plain words, once.
      expect(announced(container)).toBe('Using list_invoices…');

      await draw({
        balloonDisplay: display,
        balloon: { text: '', tool: line('done') },
      });
      expect(status()).toBe('complete');
      expect(announced(container)).toBe('Done: list_invoices');

      await draw({
        balloonDisplay: display,
        balloon: { text: '', tool: line('failed', 'c2') },
      });
      expect(tool()?.getAttribute('data-balloon-tool')).toBe('failed');
      expect(status()).toBe('error');
      expect(announced(container)).toBe('list_invoices failed');
    });
  }

  it('is heard once per start, not on every redraw', async () => {
    const { container, draw } = await render({
      balloonDisplay: 'current',
      balloon: { text: '', tool: line('running') },
    });
    const region = container.querySelector('[data-balloon-announce]');
    const changes: string[] = [];
    const observer = new MutationObserver(() =>
      changes.push(region?.textContent ?? ''),
    );
    observer.observe(region as Node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    for (let index = 0; index < 3; index += 1) {
      await draw({
        balloonDisplay: 'current',
        balloon: { text: '', tool: line('running'), busy: index % 2 === 0 },
      });
    }
    observer.disconnect();
    expect(changes).toEqual([]);
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('closed, the peek shows the tool line', async () => {
    const onToggle = vi.fn();
    const { container } = await render({
      onToggle,
      balloon: { text: 'Using list_invoices…', tool: line('running') },
    });
    // The chat's own tool card, beside the peek rather than in its button:
    // a click on the card opens the card, as in the chat.
    const tool = container.querySelector<HTMLElement>(
      '[data-balloon-tool="running"]',
    );
    expect(
      tool?.querySelector('[data-tool-call="list_invoices"]'),
    ).not.toBeNull();
    act(() => tool?.querySelector<HTMLElement>('button')?.click());
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('the history balloon lists the conversation', () => {
  // The conversation as the chat holds it: messages and a tool call.
  const at = new Date(0);
  const history: DisplayItem[] = [
    {
      id: 'u1',
      role: 'user',
      content: 'Who wrote about late deliveries?',
      createdAt: at,
    },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Ada, Grace and **Alan**.',
      createdAt: at,
    },
    {
      id: 't1',
      type: 'tool-call',
      toolCallId: 't1',
      toolName: 'readCell',
      args: {},
      status: 'complete',
    },
    {
      id: 'u2',
      role: 'user',
      content: 'Is the notebook up to date?',
      createdAt: at,
    },
    {
      id: 'a2',
      role: 'assistant',
      content: 'Yes, it ran at 9:40.',
      createdAt: at,
    },
  ];
  const messagesIn = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-chat-message]')).map(
      message => message.textContent,
    );

  it('draws the messages with the chat’s own components: markdown, and the tool call', async () => {
    const { container } = await render({
      balloon: { text: 'Yes, it ran at 9:40.', history },
    });
    expect(
      container.querySelector(
        '[data-chat-message="assistant"] [data-chat-markdown] [data-streamdown="strong"]',
      )?.textContent,
    ).toBe('Alan');
    expect(
      container
        .querySelector(
          '[data-balloon-history-list] [data-tool-call="readCell"]',
        )
        ?.getAttribute('data-tool-call-status'),
    ).toBe('complete');
  });

  it('history: every message, under a header that counts them, scrolled', async () => {
    const { container } = await render({
      balloon: { text: 'Yes, it ran at 9:40.', history },
    });
    expect(messagesIn(container)).toEqual([
      'Who wrote about late deliveries?',
      'Ada, Grace and Alan.',
      'Is the notebook up to date?',
      'Yes, it ran at 9:40.',
    ]);
    expect(
      container.querySelector('[data-balloon-history] [data-balloon-header]')
        ?.textContent,
    ).toBe('Conversation · 4');
    const list = container.querySelector<HTMLElement>(
      '[data-balloon-history-list]',
    );
    expect(getComputedStyle(list as Element).overflowY).toBe('auto');
  });

  it('history: the tool being called under the messages', async () => {
    const { container } = await render({
      balloon: {
        text: 'Using list_invoices…',
        tool: line('running'),
        history,
      },
    });
    expect(messagesIn(container)).toHaveLength(4);
    // Last in the list, as the chat's tool card.
    const cards = container.querySelectorAll(
      '[data-balloon-history-list] [data-tool-call]',
    );
    expect(cards[cards.length - 1]?.getAttribute('data-tool-call')).toBe(
      'list_invoices',
    );
    expect(cards[cards.length - 1]?.getAttribute('data-tool-call-status')).toBe(
      'executing',
    );
  });

  it('current: the one thing said now, not the list', async () => {
    const { container } = await render({
      balloonDisplay: 'current',
      balloon: { text: 'Yes, it ran at 9:40.', history },
    });
    expect(messagesIn(container)).toHaveLength(0);
    expect(
      container.querySelector('[data-balloon-current-text]')?.textContent,
    ).toBe('Yes, it ran at 9:40.');
  });
});
