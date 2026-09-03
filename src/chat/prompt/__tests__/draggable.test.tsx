/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `InputPrompt`'s `placement`: the same composer, docked or in a card.
 *
 * The point being pinned is that floating is a *wrapper*, not a variant: the
 * prompt keeps its editor and its footer of session controls either way, and
 * the card only adds the handle and takes the layout away. A floating prompt
 * that lost the tools/skills/model menus would be a different, poorer
 * composer wearing the same name. The `container` prop moves the whole thing
 * into another subtree without changing what it is.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { InputPrompt, type InputPromptProps } from '../InputPrompt';

const BASE_PROPS: InputPromptProps = {
  input: '',
  setInput: () => {},
  isLoading: false,
  connectionConfirmed: true,
  autoFocus: false,
  padding: 3,
  onSend: () => {},
  onStop: () => {},
  // The footer the floating card must keep: tools, skills, models.
  showToolsMenu: true,
  showSkillsMenu: true,
  showModelSelector: true,
  hasConfigData: true,
  hasSkillsData: true,
};

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

describe('a floating prompt', () => {
  it('stands in a floating card with a handle', async () => {
    const { container, root } = await render(
      <InputPrompt {...BASE_PROPS} placement="floating" />,
    );

    const card = container.querySelector<HTMLElement>('[data-floating-prompt]');
    expect(card).not.toBeNull();
    expect(
      card?.querySelector('[aria-label="Move the prompt"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('keeps the session controls under the input', async () => {
    const { container, root } = await render(
      <InputPrompt {...BASE_PROPS} placement="floating" />,
    );

    // The footer band is inside the card: floating changes where the
    // composer stands, not what it is.
    const card = container.querySelector<HTMLElement>(
      '[data-floating-prompt]',
    )!;
    expect(
      card.querySelector('[data-prompt-stack="session-controls"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('stays docked without the prop', async () => {
    const { container, root } = await render(<InputPrompt {...BASE_PROPS} />);

    expect(container.querySelector('[data-floating-prompt]')).toBeNull();
    // Still the same composer, footer included.
    expect(
      container.querySelector('[data-prompt-stack="session-controls"]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('still answers to the deprecated draggable spelling', async () => {
    const { container, root } = await render(
      <InputPrompt {...BASE_PROPS} draggable />,
    );

    expect(
      container.querySelector('[data-floating-prompt]'),
    ).not.toBeNull();

    await act(async () => root.unmount());
  });

  it('mounts into the given container, docked or floating', async () => {
    const dock = document.createElement('div');
    document.body.appendChild(dock);

    const docked = await render(
      <InputPrompt {...BASE_PROPS} container={dock} />,
    );
    // The prompt is in the portal target, not where it was composed.
    expect(
      docked.container.querySelector('[data-prompt-stack="session-controls"]'),
    ).toBeNull();
    expect(
      dock.querySelector('[data-prompt-stack="session-controls"]'),
    ).not.toBeNull();
    await act(async () => docked.root.unmount());

    const floating = await render(
      <InputPrompt {...BASE_PROPS} placement="floating" container={dock} />,
    );
    expect(
      floating.container.querySelector('[data-floating-prompt]'),
    ).toBeNull();
    expect(dock.querySelector('[data-floating-prompt]')).not.toBeNull();
    await act(async () => floating.root.unmount());

    dock.remove();
  });

  it('moves when dragged by its handle', async () => {
    const { container, root } = await render(
      <InputPrompt {...BASE_PROPS} placement="floating" />,
    );
    const card = container.querySelector<HTMLElement>(
      '[data-floating-prompt]',
    )!;
    const handle = card.querySelector<HTMLElement>(
      '[aria-label="Move the prompt"]',
    )!;

    // jsdom lays nothing out, so the positioned ancestor the drag measures
    // against has to be supplied by hand.
    Object.defineProperty(card, 'offsetParent', {
      get: () => card.parentElement,
    });

    // jsdom has no PointerEvent; a MouseEvent with the right type reaches the
    // same listeners. Positions are clamped from zero-sized test boxes, so
    // what is asserted is that dragging repositions the card at all — the
    // default centring (left 50% and a transform) gives way to explicit
    // coordinates.
    await act(async () => {
      handle.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 50,
          clientY: 50,
        }),
      );
      handle.dispatchEvent(
        new MouseEvent('pointermove', {
          bubbles: true,
          clientX: 90,
          clientY: 120,
        }),
      );
      handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });

    const style = window.getComputedStyle(card);
    expect(style.left).not.toBe('50%');
    expect(style.left.endsWith('px')).toBe(true);

    await act(async () => root.unmount());
  });
});
