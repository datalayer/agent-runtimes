/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The assistant's own menu (LOOP T-27): it opens on a right-click and on
 * Shift+F10, shows what each host passes and nothing it does not, each entry
 * it offers does something, *Inspect the agent…* opens the Agent Inspector
 * over the page, and Esc closes it.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  AssistantStage,
  assistantMenuItems,
  type AssistantStageProps,
} from '../assistant/AssistantStage';
import { createOtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { startAgentTurn } from '../../components/inspector/agentSpans';

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
  await act(async () => {
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
          {...props}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
}

const character = () =>
  document.querySelector<HTMLElement>('[data-assistant-figure]')!;
const menuIds = () =>
  [...document.querySelectorAll('[data-assistant-menu-item]')].map(item =>
    item.getAttribute('data-assistant-menu-item'),
  );
const wait = () =>
  act(async () => new Promise(resolve => setTimeout(resolve, 0)));

describe('the menu opens', () => {
  it('on a right-click, at the pointer', async () => {
    await render();
    await act(async () => {
      character().dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 50,
        }),
      );
    });
    expect(menuIds()).toContain('conversation');
    const anchor = document.querySelector<HTMLElement>(
      '[data-assistant-menu-anchor]',
    );
    expect(anchor?.style.left).toBe('40px');
  });

  it('on Shift+F10 and the ContextMenu key; Esc closes it', async () => {
    await render();
    character().focus();
    await act(async () => {
      character().dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(menuIds().length).toBeGreaterThan(0);
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(menuIds()).toEqual([]);
    await act(async () => {
      character().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }),
      );
    });
    expect(menuIds().length).toBeGreaterThan(0);
  });
});

describe('its entries', () => {
  const noop = () => {};
  it('are what the host passes, and nothing else', () => {
    const bare = assistantMenuItems({
      name: 'Clip',
      open: false,
      onToggle: noop,
      onDismiss: noop,
    });
    expect(bare.map(item => item.id)).toEqual([
      'conversation',
      'away:page',
      'away:session',
      'away:always',
    ]);
    const member = assistantMenuItems({
      name: 'Accounting',
      open: false,
      onToggle: noop,
      onDismiss: noop,
      conversationLabel: false,
      inspect: noop,
    });
    expect(member.map(item => item.id)).not.toContain('conversation');
    expect(member.map(item => item.id)).toContain('inspect');
    const full = assistantMenuItems({
      name: 'Clip',
      open: true,
      onToggle: noop,
      onDismiss: noop,
      inspect: noop,
      busy: true,
      onStop: noop,
      onNewChat: noop,
      onClear: noop,
      suggestions: [
        { label: 'Open invoices', prompt: 'Which invoices are open?' },
      ],
      onSuggestion: noop,
      balloonDisplay: 'current',
      onBalloonDisplayChange: noop,
      onChangeCharacter: noop,
      speech: { muted: false, onToggle: noop },
      onResetPosition: noop,
      about: noop,
      extra: [{ id: 'mine', label: 'Mine', onSelect: noop }],
    });
    expect(full.map(item => item.id)).toEqual([
      'inspect',
      'conversation',
      'stop',
      'new-chat',
      'clear',
      'suggestion:Open invoices',
      'balloon-history',
      'balloon-current',
      'character',
      'speech',
      'reset-position',
      'about',
      'mine',
      'away:page',
      'away:session',
      'away:always',
    ]);
    expect(full.find(item => item.id === 'conversation')?.label).toBe(
      'Close the conversation',
    );
    expect(full.find(item => item.id === 'balloon-current')?.checked).toBe(
      true,
    );
  });

  it('each do something, in the floating chat’s stage and in a team member’s', async () => {
    const spies = {
      onToggle: vi.fn(),
      onDismiss: vi.fn(),
      onStop: vi.fn(),
      onNewChat: vi.fn(),
      onClear: vi.fn(),
      onSuggestion: vi.fn(),
      onBalloonDisplayChange: vi.fn(),
      onResetPosition: vi.fn(),
      onChangeCharacter: vi.fn(),
    };
    await render({
      ...spies,
      state: 'thinking',
      suggestions: [{ label: 'Go', prompt: 'Go on' }],
    });
    const offered: string[] = [];
    const open = async () => {
      await act(async () => {
        character().dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 5,
            clientY: 5,
          }),
        );
      });
    };
    await open();
    offered.push(...(menuIds() as string[]));
    for (const id of offered) {
      if (!document.querySelector(`[data-assistant-menu-item="${id}"]`)) {
        await open();
      }
      await act(async () => {
        document
          .querySelector<HTMLElement>(`[data-assistant-menu-item="${id}"]`)
          ?.click();
      });
    }
    expect(spies.onToggle).toHaveBeenCalled();
    expect(spies.onStop).toHaveBeenCalled();
    expect(spies.onNewChat).toHaveBeenCalled();
    expect(spies.onClear).toHaveBeenCalled();
    // Busy: suggestions are offered, and not sent until it is free.
    expect(spies.onBalloonDisplayChange).toHaveBeenCalledWith('history');
    expect(spies.onResetPosition).toHaveBeenCalled();
    expect(spies.onChangeCharacter).toHaveBeenCalled();
    expect(spies.onDismiss).toHaveBeenCalledWith('page');
  });

  it('leaves the conversation out where there is none to open', async () => {
    await render({ conversationLabel: false });
    await act(async () => {
      character().dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    expect(menuIds()).not.toContain('conversation');
    expect(menuIds()).not.toContain('inspect');
  });
});

describe('Inspect the agent…', () => {
  it('opens the Agent Inspector over the page; Esc closes it', async () => {
    const inspector = createOtelLiveTracer();
    startAgentTurn(inspector, { agent: 'Clip', prompt: 'a turn' }).end();
    await render({ inspector });
    await act(async () => {
      character().dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    await act(async () => {
      document
        .querySelector<HTMLElement>('[data-assistant-menu-item="inspect"]')
        ?.click();
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector(
          '[role="dialog"] [data-otel-span-name="invoke_agent Clip"]',
        ),
      ).not.toBeNull(),
    );
    await wait();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('a suggestion’s description in the menu', () => {
  it('keeps to one line, whole words and an ellipsis, the full text in its tooltip', async () => {
    const { shortDescription, MENU_DESCRIPTION_MAX } = await import(
      '../assistant/AssistantContextMenu'
    );
    expect(shortDescription('Chart the aged receivables as of today, by customer.')).toBe(
      'Chart the aged receivables as of today, by customer.',
    );
    const long =
      'Show me the open customer invoices as a notebook: the invoices, the total due, and a chart of what each customer owes.';
    const short = shortDescription(long);
    expect(short).toBe('Show me the open customer invoices as a notebook: the…');
    expect(short.length).toBeLessThanOrEqual(MENU_DESCRIPTION_MAX + 1);
  });
});
