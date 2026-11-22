/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The limited-preview plugin as a page holds it (Copilot's review of #146,
 * the user, 20 November 2026):
 *
 * - each plugin its own board: two anonymous embeds on one page keep their
 *   own turns, note and disabled features, and one going leaves the other;
 * - an exhausted preview: the composer closed (`disableInputPrompt`), its
 *   footer dimmed and blocked, the indicator still opens onto the refusal
 *   and Sign in — it stands in `AgentSlots.promptStatus`, outside the
 *   disabled region, through the real `InputPrompt`.
 */

// @vitest-environment jsdom
import React from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import {
  AnonymousChatProvider,
  type AnonymousChatState,
} from '../../../../chat/anonymous/AnonymousChat';
import { InputPrompt } from '../../../../chat/prompt/InputPrompt';
import type { FrontendToolDefinition } from '../../../../types/tools';
import { AgentChatExtras, AgentSlots } from '../../../core';
import { limitedPreviewPlugin, PREVIEW_INDICATOR_UPDATE } from '..';

afterEach(cleanup);

function state(over: Partial<AnonymousChatState> = {}): AnonymousChatState {
  return {
    taken: 3,
    startedAt: null,
    refused: '',
    take: () => undefined,
    config: { maxTurns: 10 },
    name: 'Shopper',
    validating: false,
    headerShown: true,
    minutes: 15,
    signIn: vi.fn(),
    ...over,
  };
}

type Built = {
  components: { slot: string; Component: React.ComponentType }[];
};

/** A plugin's indicator, its slot, and the tools it hands the agent. */
function partsOf(disabled: string[]) {
  const plugin = limitedPreviewPlugin(disabled) as unknown as {
    contributes: { point: unknown; value: any }[];
    build: (context: unknown) => Built;
  };
  const indicator = plugin
    .build({ config: {} })
    .components.find(each => each.slot === AgentSlots.promptStatus);
  if (!indicator) {
    throw new Error('No indicator in the promptStatus slot.');
  }
  const tools: FrontendToolDefinition[] = plugin.contributes
    .filter(entry => entry.point === AgentChatExtras)
    .flatMap(entry => entry.value.extras.value.frontendTools ?? []);
  const tool = (name: string) => {
    const found = tools.find(each => each.name === name);
    return (args: Record<string, unknown> = {}) =>
      found!.handler!(args) as Promise<Record<string, unknown>>;
  };
  return {
    Indicator: indicator.Component,
    status: tool('preview_status'),
    update: tool(PREVIEW_INDICATOR_UPDATE),
  };
}

const themed = (node: React.ReactNode) => (
  <ThemeProvider>
    <BaseStyles>{node}</BaseStyles>
  </ThemeProvider>
);

describe('two anonymous embeds on one page', () => {
  it('keep each their own turns, note and disabled features', async () => {
    const shopper = partsOf(['Shopping basket']);
    const marketer = partsOf(['X budget', 'LinkedIn link']);
    const view = render(
      themed(
        <>
          <div data-embed="shopper">
            <AnonymousChatProvider value={state({ taken: 3 })}>
              <shopper.Indicator />
            </AnonymousChatProvider>
          </div>
          <div data-embed="marketer">
            <AnonymousChatProvider
              value={state({ taken: 8, config: { maxTurns: 20 } })}
            >
              <marketer.Indicator />
            </AnonymousChatProvider>
          </div>
        </>,
      ),
    );
    expect(await shopper.status()).toEqual({
      limited: true,
      turnsLeft: 7,
      turnsPerDay: 10,
      disabled: ['Shopping basket'],
    });
    expect(await marketer.status()).toEqual({
      limited: true,
      turnsLeft: 12,
      turnsPerDay: 20,
      disabled: ['X budget', 'LinkedIn link'],
    });
    await act(async () => {
      await shopper.update({ note: 'Seven left', flash: true });
    });
    const shopperBox = view.container.querySelector('[data-embed="shopper"]')!;
    const marketerBox = view.container.querySelector(
      '[data-embed="marketer"]',
    )!;
    expect(shopperBox.textContent).toContain('Seven left');
    expect(marketerBox.textContent).not.toContain('Seven left');
    expect(
      marketerBox.querySelector('[data-limited-preview-flash="on"]'),
    ).toBeNull();
    expect((await marketer.status()).note).toBeUndefined();
  });

  it('leave the other’s preview when one goes', async () => {
    const one = partsOf([]);
    const two = partsOf([]);
    const first = render(
      themed(
        <AnonymousChatProvider value={state({ taken: 1 })}>
          <one.Indicator />
        </AnonymousChatProvider>,
      ),
    );
    render(
      themed(
        <AnonymousChatProvider value={state({ taken: 2 })}>
          <two.Indicator />
        </AnonymousChatProvider>,
      ),
    );
    first.unmount();
    expect(await one.status()).toEqual({ limited: false });
    expect(await two.status()).toMatchObject({ limited: true, turnsLeft: 8 });
  });
});

/** Whether a click reaches this element: nothing above it blocks pointers. */
function reachable(element: Element): boolean {
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (getComputedStyle(at).pointerEvents === 'none') {
      return false;
    }
  }
  return true;
}

describe('an exhausted preview, in the real composer', () => {
  it('keeps the indicator usable while the composer is closed', () => {
    const signIn = vi.fn();
    const { Indicator } = partsOf(['X budget']);
    const refused = 'You have taken today’s 10 turns without an account.';
    const { container } = render(
      themed(
        <AnonymousChatProvider value={state({ taken: 10, refused, signIn })}>
          <InputPrompt
            input=""
            setInput={() => undefined}
            isLoading={false}
            connectionConfirmed={false}
            autoFocus={false}
            padding={3}
            onSend={() => undefined}
            onStop={() => undefined}
            placeholder={refused}
            disableInputPrompt
            footerExtras={<button data-footer-action="">Notebook</button>}
            footerLive={<Indicator />}
          />
        </AnonymousChatProvider>,
      ),
    );
    // The footer's own controls are closed with the composer…
    const action = container.querySelector('[data-footer-action]')!;
    expect(reachable(action)).toBe(false);
    // …the indicator is not, nor dimmed with them.
    const indicator = screen.getByRole('button', { name: /Limited preview/ });
    expect(reachable(indicator)).toBe(true);
    expect(indicator.closest('[aria-disabled="true"]')).toBeNull();
    expect(screen.getByText('0/10 turns today')).toBeTruthy();
    fireEvent.click(indicator);
    expect(screen.getByRole('alert').textContent).toBe(refused);
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(reachable(button)).toBe(true);
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledOnce();
  });
});
