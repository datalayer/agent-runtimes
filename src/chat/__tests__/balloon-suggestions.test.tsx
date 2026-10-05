/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the balloon offers and shows besides its words (LOOP T-23): the
 * suggestions while it waits for a question, one clicked sent; the chat's
 * three dots while it works with nothing written; *more* and *less* for
 * words cut to fit; and the history drawn large with *Expand*, *Shrink* and
 * Esc taking it back.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  AssistantStage,
  type AssistantStageProps,
} from '../assistant/AssistantStage';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

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
            state="idle"
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
  return {
    redraw: (next: Partial<AssistantStageProps>) => draw({ ...props, ...next }),
  };
}

const SUGGESTIONS = [
  { label: 'Open invoices', prompt: 'Which customer invoices are still open?' },
  { label: 'Trial balance', prompt: 'Give me the trial balance.' },
];
const chips = () => [...document.querySelectorAll('[data-balloon-suggestion]')];
const dots = () =>
  document.querySelector('[data-speech-balloon] [data-typing-dots]');

describe('suggestions in the balloon', () => {
  it.each(['current', 'history'] as const)(
    'show while it waits for a question (%s), and a click sends one',
    async display => {
      const onSuggestion = vi.fn();
      await render({
        balloonDisplay: display,
        balloon: { text: 'Ask me for a report.' },
        suggestions: SUGGESTIONS,
        onSuggestion,
      });
      expect(chips().map(chip => chip.textContent)).toEqual([
        'Open invoices',
        'Trial balance',
      ]);
      expect(chips()[0].getAttribute('aria-label')).toBe(
        'Ask: Which customer invoices are still open?',
      );
      await act(async () => (chips()[0] as HTMLElement).click());
      expect(onSuggestion).toHaveBeenCalledWith(SUGGESTIONS[0]);
    },
  );

  it('do not show while it works', async () => {
    await render({
      state: 'thinking',
      balloonDisplay: 'current',
      balloon: { text: 'Thinking…', busy: true },
      suggestions: SUGGESTIONS,
      onSuggestion: () => {},
    });
    expect(chips()).toHaveLength(0);
  });
});

describe('the three dots', () => {
  it.each(['thinking', 'working', 'waiting'] as const)(
    'show while it is %s and nothing is written',
    async state => {
      await render({
        state,
        balloonDisplay: 'current',
        balloon: { text: 'Thinking…', busy: true },
      });
      expect(dots()).not.toBeNull();
    },
  );

  it('show last in the history while a turn runs', async () => {
    await render({
      state: 'thinking',
      balloonDisplay: 'history',
      balloon: { text: 'Hi', history: [{ id: '1', role: 'user', text: 'Hi' }] },
    });
    expect(
      document.querySelector('[data-balloon-waiting] [data-typing-dots]'),
    ).not.toBeNull();
  });

  it('stop once words stream in, or it is idle', async () => {
    const { redraw } = await render({
      state: 'thinking',
      balloonDisplay: 'current',
      balloon: { text: 'Thinking…', busy: true },
    });
    expect(dots()).not.toBeNull();
    await redraw({
      state: 'speaking',
      balloon: { text: 'Two invoices', busy: true, speaking: true },
    });
    expect(dots()).toBeNull();
    await redraw({
      state: 'idle',
      balloon: { text: 'Two invoices are open.' },
    });
    expect(dots()).toBeNull();
  });
});

describe('words cut to fit', () => {
  it('show whole with more, and fold back with less', async () => {
    const whole = `Two invoices are open: ${'Ada owes 1,200 EUR, '.repeat(12)}and that is all.`;
    await render({
      balloonDisplay: 'current',
      balloon: { text: `${whole.slice(0, 119)}…`, fullText: whole, more: true },
    });
    const toggle = document.querySelector<HTMLElement>('[data-balloon-whole]')!;
    expect(toggle.textContent).toBe('more');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent).not.toContain('and that is all.');
    await act(async () => toggle.click());
    expect(document.body.textContent).toContain('and that is all.');
    expect(toggle.textContent).toBe('less');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await act(async () => toggle.click());
    expect(document.body.textContent).not.toContain('and that is all.');
  });

  it('offer no more when nothing was cut', async () => {
    await render({ balloonDisplay: 'current', balloon: { text: 'Short.' } });
    expect(document.querySelector('[data-balloon-whole]')).toBeNull();
  });
});

describe('the history, large', () => {
  const history = [
    { id: '1', role: 'user' as const, text: 'Open invoices?' },
    { id: '2', role: 'assistant' as const, text: 'Two are open.' },
    { id: '3', role: 'user' as const, text: 'Thanks.' },
  ];

  it('opens over the page with every message; Shrink and Esc take it back', async () => {
    await render({
      balloonDisplay: 'history',
      balloon: { text: 'Thanks.', history },
    });
    const expand = () =>
      document.querySelector<HTMLElement>('[data-balloon-history-expand]');
    await act(async () => expand()?.click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(
      dialog?.querySelectorAll(
        '[data-balloon-history-large] [data-balloon-history-message]',
      ),
    ).toHaveLength(3);
    await act(async () =>
      dialog
        ?.querySelector<HTMLElement>('button[data-balloon-shrink]')
        ?.click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => expand()?.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('goes into the area a host names, with Shrink', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    await render({
      balloonDisplay: 'history',
      expandTarget: { current: target },
      balloon: { text: 'Thanks.', history },
    });
    await act(async () =>
      document
        .querySelector<HTMLElement>('[data-balloon-history-expand]')
        ?.click(),
    );
    expect(
      target.querySelectorAll('[data-balloon-history-message]'),
    ).toHaveLength(3);
    await act(async () =>
      target.querySelector<HTMLElement>('[data-balloon-shrink]')?.click(),
    );
    expect(target.querySelector('[data-balloon-history-large]')).toBeNull();
  });
});
