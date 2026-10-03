/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant on the page (LOOP T-21 to T-23, T-27): the
 * character acts its state, its balloon says the agent's words while the
 * conversation is closed, a click opens it, a drag does not, and it can be
 * sent away.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  AssistantStage,
  type AssistantStageProps,
} from '../assistant/AssistantStage';

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render(props: Partial<AssistantStageProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onToggle = vi.fn();
  const onDismiss = vi.fn();
  await act(async () => {
    root.render(
      <ThemeProvider>
        <AssistantStage
          character="paperclip"
          state="idle"
          place={{ left: 10, top: 10 }}
          stageRef={createRef<HTMLDivElement>()}
          onDragStart={() => {}}
          open={false}
          onToggle={onToggle}
          onDismiss={onDismiss}
          {...props}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
  return { container, onToggle, onDismiss };
}

const balloon = (container: HTMLElement) =>
  container.querySelector('[data-speech-balloon]');

describe('the floating assistant', () => {
  it('acts out its state, drawn as the chosen character', async () => {
    const { container } = await render({ state: 'working' });
    expect(
      container
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-state'),
    ).toBe('working');
    expect(
      container.querySelector('svg[aria-label="Paper clip"]'),
    ).not.toBeNull();
  });

  it('says the agent’s words in its balloon while the conversation is closed', async () => {
    const { container } = await render({
      balloon: { text: 'Brussels.', more: true },
      insist: true,
    });
    expect(balloon(container)?.textContent).toContain('Brussels.');
    expect(balloon(container)?.textContent).toContain('Open the conversation');
  });

  it('keeps the balloon for a hover when there is nothing new, and never over the open conversation', async () => {
    const quiet = await render({ balloon: { text: 'Ask me anything.' } });
    expect(balloon(quiet.container)).toBeNull();
    const open = await render({
      balloon: { text: 'Brussels.' },
      insist: true,
      open: true,
    });
    expect(balloon(open.container)).toBeNull();
  });

  it('opens the conversation on a click, and not at the end of a drag', async () => {
    const { container, onToggle } = await render();
    const button = container.querySelector(
      'button[aria-label^="Talk to"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }),
      );
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 5,
          clientY: 5,
        }),
      );
      button.dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 40 }),
      );
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('can be sent away from its hover control, for as long as the person says', async () => {
    const { container, onDismiss } = await render();
    const stage = container.querySelector(
      '[data-assistant-state]',
    ) as HTMLElement;
    await act(async () => {
      stage.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const away = container.querySelector(
      '[data-assistant-dismiss]',
    ) as HTMLButtonElement;
    expect(away).not.toBeNull();
    await act(async () => {
      away.click();
    });
    const choices = [...document.querySelectorAll('[data-assistant-away]')];
    expect(choices.map(choice => choice.textContent)).toEqual([
      'Hide for now',
      'Hide for this session',
      'Don’t show again',
    ]);
    await act(async () => {
      (
        document.querySelector('[data-assistant-away="session"]') as HTMLElement
      ).click();
    });
    expect(onDismiss).toHaveBeenCalledWith('session');
  });
});
