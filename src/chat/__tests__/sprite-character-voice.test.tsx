// @vitest-environment jsdom
/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A character one brings, speaking (LOOP T-26): its mouths drawn while it
 * speaks, by its voice's loudness or one after another; its sounds played
 * only once asked, from its menu, and muted from it.
 */

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@primer/react';
import {
  MOUTH_STEP_MS,
  SpriteCharacter,
  mouthFor,
} from '../assistant/SpriteCharacter';
import { AssistantStage } from '../assistant/AssistantStage';
import type { AssistantCharacterData } from '../assistant/formats/types';

// jsdom plays nothing.
HTMLMediaElement.prototype.play = () => Promise.resolve();

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
  vi.useRealTimers();
});

/** A character with one animation per state it acts, a sound and mouths. */
const CHARACTER: AssistantCharacterData = {
  name: 'Webby',
  frameSize: { width: 4, height: 2 },
  sprite: 'blob:sheet',
  animations: {
    Idle1_1: {
      frames: [{ duration: 100, images: [{ x: 0, y: 0 }], sound: '0' }],
    },
    Explain: {
      frames: [
        {
          duration: 100000,
          images: [{ x: 4, y: 0 }],
          mouths: {
            closed: { x: 8, y: 0 },
            wide2: { x: 12, y: 0 },
            narrow: { x: 16, y: 0 },
          },
        },
      ],
    },
  },
  sounds: { '0': 'blob:sound-0' },
};

async function mount(node: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ThemeProvider>{node}</ThemeProvider>);
  });
  mounted.push(() => act(() => root.unmount()));
  return container;
}

const layer = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.assistant-sprite > span')!.style
    .backgroundPosition;

describe('its mouths', () => {
  it('follow the voice: shut, a little, half, wide', () => {
    const frame = CHARACTER.animations.Explain.frames[0];
    expect(mouthFor(frame, 0)).toBe('closed');
    expect(mouthFor(frame, 0.2)).toBe('narrow');
    // Half open, with no medium: the narrow one.
    expect(mouthFor(frame, 0.4)).toBe('narrow');
    expect(mouthFor(frame, 0.9, 0.99)).toBe('wide2');
  });

  it('come one after another without a voice, and none for a frame without', () => {
    const frame = CHARACTER.animations.Explain.frames[0];
    expect(mouthFor(frame, undefined, 0)).toBe('closed');
    expect(mouthFor(frame, undefined, 0.99)).toBe('narrow');
    expect(
      mouthFor(CHARACTER.animations.Idle1_1.frames[0], undefined),
    ).toBeUndefined();
  });

  it('are drawn while it speaks, in place of the frame', async () => {
    vi.useFakeTimers();
    let level = 0;
    const container = await mount(
      <SpriteCharacter
        character={CHARACTER}
        state="speaking"
        size={40}
        mouthLevel={() => level}
      />,
    );
    const sprite = container.querySelector('.assistant-sprite')!;
    expect(sprite.getAttribute('data-sprite-mouth')).toBe('closed');
    expect(layer(container)).toBe('-8px 0px');
    level = 0.9;
    await act(async () => {
      vi.advanceTimersByTime(MOUTH_STEP_MS);
    });
    expect(sprite.getAttribute('data-sprite-mouth')).toBe('wide2');
    expect(layer(container)).toBe('-12px 0px');
  });

  it('are not drawn while it does not speak', async () => {
    const container = await mount(
      <SpriteCharacter character={CHARACTER} state="idle" size={40} />,
    );
    expect(
      container
        .querySelector('.assistant-sprite')!
        .hasAttribute('data-sprite-mouth'),
    ).toBe(false);
    expect(layer(container)).toBe('0px 0px');
  });
});

describe('its sounds', () => {
  it('are not played unless asked', async () => {
    const playSound = vi.fn();
    await mount(
      <SpriteCharacter
        character={CHARACTER}
        state="idle"
        size={40}
        playSound={playSound}
      />,
    );
    expect(playSound).not.toHaveBeenCalled();
  });

  it('are played with their frame once asked', async () => {
    const playSound = vi.fn();
    await mount(
      <SpriteCharacter
        character={CHARACTER}
        state="idle"
        size={40}
        sounds
        playSound={playSound}
      />,
    );
    expect(playSound).toHaveBeenCalledWith('blob:sound-0');
  });

  it('are asked for, and muted, from its menu; a shipped character has none', async () => {
    const stage = (character: AssistantCharacterData | string) => (
      <AssistantStage
        character={character}
        state="idle"
        place={{ left: 10, top: 300 }}
        stageRef={createRef<HTMLDivElement>()}
        onDragStart={() => {}}
        open={false}
        onToggle={() => {}}
        onDismiss={() => {}}
      />
    );
    const openMenu = async () => {
      await act(async () => {
        document
          .querySelector<HTMLElement>('[data-assistant-figure]')!
          .dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
          );
      });
    };
    const item = () =>
      document.querySelector<HTMLElement>(
        '[data-assistant-menu-item="character-sounds"]',
      );
    await mount(stage(CHARACTER));
    await openMenu();
    expect(item()?.textContent).toContain('Play its sounds');
    await act(async () => {
      item()!.click();
    });
    await openMenu();
    expect(item()?.textContent).toContain('Mute its sounds');

    mounted.splice(0).forEach(unmount => unmount());
    document.body.innerHTML = '';
    await mount(stage('paperclip'));
    await openMenu();
    expect(item()).toBeNull();
  });
});
