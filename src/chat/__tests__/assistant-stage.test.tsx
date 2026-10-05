/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant on the page (LOOP T-21 to T-23, T-27): the
 * character acts its state, its balloon says the agent's words while the
 * conversation is closed, a click opens it, a drag does not, and it can be
 * sent away; it steps aside for a dialog, another chat's composer and the
 * pointer at work (T-27).
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  balloonSide,
  AssistantStage,
  type AssistantStageProps,
} from '../assistant/AssistantStage';
import { ASSISTANT_WORDS, POINTER_CALM_MS } from '../assistant/state';

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
  });

  it('peeks a new message in one line that opens the conversation, and can be dismissed', async () => {
    const onDismissPeek = vi.fn();
    const { container, onToggle } = await render({
      balloon: {
        text: 'Your order left the warehouse this…',
        more: true,
        onDismiss: onDismissPeek,
      },
      insist: true,
    });
    const peek = container.querySelector(
      '[data-balloon-peek]',
    ) as HTMLButtonElement;
    expect(peek.hasAttribute('data-balloon-more')).toBe(true);
    await act(async () => peek.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    await act(async () =>
      (
        container.querySelector('[data-balloon-dismiss]') as HTMLButtonElement
      ).click(),
    );
    expect(onDismissPeek).toHaveBeenCalledTimes(1);
  });

  it('peeks a notification as its line', async () => {
    const { container } = await render({
      state: 'paused',
      balloon: { text: ASSISTANT_WORDS.paused },
      insist: true,
    });
    expect(container.querySelector('[data-balloon-peek]')?.textContent).toBe(
      ASSISTANT_WORDS.paused,
    );
    expect(container.querySelector('[data-balloon-dismiss]')).toBeNull();
  });

  it('peeks an approval with Approve and Deny and how many more wait, never dismissed', async () => {
    const { container } = await render({
      state: 'waiting',
      balloon: {
        text: ASSISTANT_WORDS.approval,
        onDismiss: () => undefined,
        approval: {
          id: 'ap-2',
          asks: 'send_email',
          others: 2,
          onApprove: () => undefined,
          onDeny: () => undefined,
        },
      },
      insist: true,
    });
    const held = container.querySelector('[data-balloon-approval="ap-2"]');
    expect(held?.textContent).toContain('2 more');
    expect(container.querySelector('[data-balloon-dismiss]')).toBeNull();
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

  it('dozes while paused, its eyes shut, and says it is paused', async () => {
    const { container } = await render({
      state: 'paused',
      balloon: { text: ASSISTANT_WORDS.paused },
      insist: true,
    });
    expect(
      container
        .querySelector('[data-assistant-state]')
        ?.getAttribute('data-assistant-state'),
    ).toBe('paused');
    expect(balloon(container)?.textContent).toContain(ASSISTANT_WORDS.paused);
  });

  it('holds an approval in its balloon, answered there with Approve or Deny (T-23)', async () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const { container, onToggle } = await render({
      state: 'waiting',
      balloon: {
        text: ASSISTANT_WORDS.approval,
        approval: {
          id: 'ap-1',
          asks: 'send_email',
          why: 'Send anything: ask me first',
          others: 0,
          onApprove,
          onDeny,
        },
      },
      insist: true,
    });
    const held = container.querySelector('[data-balloon-approval="ap-1"]');
    expect(held?.textContent).toContain('send_email');
    expect(held?.textContent).toContain('Send anything: ask me first');
    expect(held?.textContent).not.toContain('more');
    const button = (label: string) =>
      Array.from(held?.querySelectorAll('button') ?? []).find(
        b => b.textContent === label,
      ) as HTMLButtonElement;
    await act(async () => button(ASSISTANT_WORDS.approve).click());
    await act(async () => button(ASSISTANT_WORDS.deny).click());
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
    // Answering is not opening the conversation.
    expect(onToggle).not.toHaveBeenCalled();
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

describe('where the balloon goes (T-23)', () => {
  const viewport = { width: 1200, height: 800 };
  it('stays inside the window wherever the character stands', () => {
    expect(balloonSide({ left: 1000, top: 600 }, viewport)).toEqual({
      side: 'above',
      align: 'right',
    });
    expect(balloonSide({ left: 20, top: 600 }, viewport)).toEqual({
      side: 'above',
      align: 'left',
    });
    expect(balloonSide({ left: 20, top: 40 }, viewport)).toEqual({
      side: 'below',
      align: 'left',
    });
  });

  it('reads a corner as well as a place', () => {
    expect(balloonSide({ right: 20, bottom: 20 }, viewport)).toEqual({
      side: 'above',
      align: 'right',
    });
    expect(
      balloonSide(
        {
          left: 20,
          top: 20,
          right: 'auto' as unknown,
          bottom: 'auto' as unknown,
        },
        viewport,
      ).side,
    ).toBe('below');
    expect(balloonSide({ left: '20px', top: '20px' }, viewport)).toEqual({
      side: 'below',
      align: 'left',
    });
    // A dragged place arrives in pixels, as strings (a number in sx from 0
    // to 12 would be read as the space scale).
    expect(balloonSide({ left: '1000px', top: '600px' }, viewport)).toEqual({
      side: 'above',
      align: 'right',
    });
  });
});

/** Puts `element` on the screen at `box`, which jsdom does not lay out. */
function placeAt(
  element: Element,
  box: { left: number; top: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      ...box,
      x: box.left,
      y: box.top,
      right: box.left + box.width,
      bottom: box.top + box.height,
      toJSON: () => box,
    }) as DOMRect;
}

/** The character stands at 1000,600, 88 square. */
const STAGE = { left: 1000, top: 600, width: 88, height: 88 };

async function renderPlaced(props: Partial<AssistantStageProps> = {}) {
  const rendered = await render(props);
  const stage = rendered.container.querySelector(
    '[data-assistant-state]',
  ) as HTMLElement;
  placeAt(stage, STAGE);
  return { ...rendered, stage };
}

/** Lets the page be looked over again. */
async function tick(ms = 450) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

function addToPage(html: string, box: Parameters<typeof placeAt>[1]) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const element = host.firstElementChild as HTMLElement;
  document.body.appendChild(element);
  placeAt(element, box);
  return element;
}

describe('keeping clear (T-27)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('steps aside while an open dialog is under it, and comes back when it closes', async () => {
    vi.useFakeTimers();
    const { stage } = await renderPlaced();
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
    // A dialog elsewhere on the page is no reason.
    const far = addToPage('<div role="dialog"></div>', {
      left: 0,
      top: 0,
      width: 400,
      height: 300,
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
    const dialog = addToPage('<div role="dialog"></div>', {
      left: 700,
      top: 400,
      width: 400,
      height: 300,
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBe('obstacle');
    expect(stage.style.visibility || getComputedStyle(stage).visibility).toBe(
      'hidden',
    );
    dialog.remove();
    far.remove();
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
  });

  it('steps aside for a Primer overlay and for another chat’s composer, not for its own conversation', async () => {
    vi.useFakeTimers();
    const own = document.createElement('div');
    document.body.appendChild(own);
    const { stage } = await renderPlaced({ ownRef: { current: own } });
    // Its own conversation's composer, right against it.
    own.innerHTML = '<div data-chat-composer=""></div>';
    placeAt(own.firstElementChild as Element, {
      left: 980,
      top: 560,
      width: 300,
      height: 80,
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
    const composer = addToPage('<div data-chat-composer=""></div>', {
      left: 900,
      top: 650,
      width: 300,
      height: 80,
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBe('obstacle');
    composer.remove();
    addToPage('<div class="prc-Overlay-Overlay-dVyJl"></div>', {
      left: 1050,
      top: 500,
      width: 200,
      height: 200,
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBe('obstacle');
  });

  it('gets out of the pointer’s way while it works beside it, and comes back once it has gone', async () => {
    vi.useFakeTimers();
    const { stage } = await renderPlaced();
    const page = document.createElement('div');
    document.body.appendChild(page);
    const at = (type: string, x: number, y: number, buttons = 0) =>
      act(async () => {
        page.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            clientX: x,
            clientY: y,
            buttons,
          }),
        );
      });
    // Passing by is not working.
    await at('pointermove', 1010, 610);
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
    // A press far off is not near it.
    await at('pointerdown', 200, 200, 1);
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
    // A press just beside it is.
    await at('pointerdown', 990, 620, 1);
    expect(stage.getAttribute('data-assistant-aside')).toBe('pointer');
    // The pointer stays about where it stood: it stays aside.
    await tick(POINTER_CALM_MS - 200);
    await at('pointermove', 1030, 640);
    await tick(POINTER_CALM_MS - 200);
    expect(stage.getAttribute('data-assistant-aside')).toBe('pointer');
    // Gone, and calm: it comes back.
    await at('pointermove', 200, 200);
    await tick(POINTER_CALM_MS);
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
  });

  it('set in a layout (stayPut), stays put for a press just beside it', async () => {
    vi.useFakeTimers();
    const { stage } = await renderPlaced({ stayPut: true });
    const label = document.createElement('div');
    document.body.appendChild(label);
    await act(async () => {
      label.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 990,
          clientY: 620,
          buttons: 1,
        }),
      );
    });
    await tick();
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
  });

  it('is not put aside by a press on itself', async () => {
    vi.useFakeTimers();
    const { stage } = await renderPlaced();
    const button = stage.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 1040,
          clientY: 640,
          buttons: 1,
        }),
      );
    });
    expect(stage.getAttribute('data-assistant-aside')).toBeNull();
  });
});
