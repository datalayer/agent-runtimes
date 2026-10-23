/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The balloon's hover intent: the figure and its balloon are one region, so
 * the balloon stays while the pointer travels from the figure to it, and
 * closes after a grace on neither, on Escape or on a press outside.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import { AssistantStage } from '../assistant/AssistantStage';
import {
  BALLOON_GRACE_MS,
  BALLOON_HOVER_START,
  balloonHover,
  graceRuns,
  type BalloonHoverEvent,
} from '../assistant/balloonHover';

const run = (...events: BalloonHoverEvent[]) =>
  events.reduce(balloonHover, BALLOON_HOVER_START);

describe('the hover-intent rule', () => {
  it('opens on enter and stays through a leave until the grace', () => {
    const left = run('enter', 'leave');
    expect(left.shown).toBe(true);
    expect(graceRuns(left)).toBe(true);
    expect(run('enter', 'leave', 'grace').shown).toBe(false);
  });

  it('keeps it when the pointer comes back before the grace', () => {
    const back = run('enter', 'leave', 'enter');
    expect(back.shown).toBe(true);
    expect(graceRuns(back)).toBe(false);
    // A grace already due finds the pointer over it.
    expect(run('enter', 'leave', 'enter', 'grace').shown).toBe(true);
  });

  it('keeps it while focused, and runs the grace once blurred', () => {
    const focused = run('focus', 'enter', 'leave');
    expect(graceRuns(focused)).toBe(false);
    expect(balloonHover(focused, 'grace').shown).toBe(true);
    expect(graceRuns(balloonHover(focused, 'blur'))).toBe(true);
  });

  it('closes at once on Escape or a press outside, and opens on the next enter', () => {
    expect(run('enter', 'escape').shown).toBe(false);
    expect(run('enter', 'outside').shown).toBe(false);
    expect(run('enter', 'outside', 'enter').shown).toBe(true);
    expect(run('focus', 'escape', 'focus').shown).toBe(true);
  });
});

const mounted: Array<() => void> = [];

afterEach(() => {
  vi.useRealTimers();
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onToggle = vi.fn();
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
          onToggle={onToggle}
          onDismiss={() => {}}
          balloon={{ text: 'Click me to open the conversation.' }}
        />
      </ThemeProvider>,
    );
  });
  mounted.push(() => act(() => root.unmount()));
  const stage = container.querySelector(
    '[data-assistant-state]',
  ) as HTMLElement;
  return { container, stage, onToggle };
}

const balloon = (container: HTMLElement) =>
  container.querySelector('[data-speech-balloon]') as HTMLElement | null;

const enter = (element: HTMLElement) =>
  act(() => {
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
  });

const leave = (element: HTMLElement) =>
  act(() => {
    element.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    );
  });

describe('the stage’s balloon on hover', () => {
  it('stays while the pointer crosses from the figure to the balloon, whose click opens the conversation', async () => {
    vi.useFakeTimers();
    const { container, stage, onToggle } = await render();
    await enter(stage);
    expect(balloon(container)).not.toBeNull();
    // Off the figure, into the gap.
    await leave(stage);
    await act(() => {
      vi.advanceTimersByTime(BALLOON_GRACE_MS - 100);
    });
    expect(balloon(container)).not.toBeNull();
    // Onto the balloon.
    await enter(balloon(container)!);
    await act(() => {
      vi.advanceTimersByTime(BALLOON_GRACE_MS * 3);
    });
    const shown = balloon(container);
    expect(shown?.textContent).toContain('Click me');
    const open = shown!.querySelector('[data-balloon-peek]') as HTMLElement;
    await act(() => {
      open.click();
    });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('closes after the grace on neither, on Escape and on a press outside', async () => {
    vi.useFakeTimers();
    const { container, stage } = await render();
    await enter(stage);
    await leave(stage);
    await act(() => {
      vi.advanceTimersByTime(BALLOON_GRACE_MS + 10);
    });
    expect(balloon(container)).toBeNull();

    await enter(stage);
    await act(() => {
      stage.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(balloon(container)).toBeNull();

    await leave(stage);
    await enter(stage);
    expect(balloon(container)).not.toBeNull();
    await act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
    });
    expect(balloon(container)).toBeNull();
  });
});
