/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A character one brings, played (LOOP T-26): frames stepped as authored,
 * branches by their weights, an animation chosen by the state.
 */

import { describe, expect, it } from 'vitest';
import { animationFor, nextFrameIndex } from '../assistant/SpriteCharacter';
import type { AssistantCharacterData } from '../assistant/formats/types';

const frame = (branching?: { frameIndex: number; weight: number }[]) => ({
  duration: 100,
  images: [{ x: 0, y: 0 }],
  branching,
});

describe('playing a character one brings', () => {
  it('steps frame by frame, and ends after the last', () => {
    const animation = { frames: [frame(), frame(), frame()] };
    expect(nextFrameIndex(animation, 0, 0.5)).toBe(1);
    expect(nextFrameIndex(animation, 2, 0.5)).toBeUndefined();
  });

  it('takes a branch by its weight, and goes on with what is left over', () => {
    const animation = {
      frames: [
        frame([
          { frameIndex: 3, weight: 30 },
          { frameIndex: 0, weight: 20 },
        ]),
        frame(),
        frame(),
        frame(),
      ],
    };
    expect(nextFrameIndex(animation, 0, 0.1)).toBe(3);
    expect(nextFrameIndex(animation, 0, 0.4)).toBe(0);
    expect(nextFrameIndex(animation, 0, 0.9)).toBe(1);
  });

  it('chooses one of the animations the character offers for a state', () => {
    const character: AssistantCharacterData = {
      name: 'Test',
      frameSize: { width: 10, height: 10 },
      sprite: 'data:,',
      animations: {
        Idle1_1: { frames: [frame()] },
        Thinking: { frames: [frame()] },
        Wave: { frames: [frame()] },
      },
    };
    expect(animationFor(character, 'thinking', 0)).toBe('Thinking');
    expect(Object.keys(character.animations)).toContain(
      animationFor(character, 'idle', 0.99),
    );
  });
});
