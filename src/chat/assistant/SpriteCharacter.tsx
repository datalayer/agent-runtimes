/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A character one brings, played (LOOP T-26): the frames of a character file
 * read by `formats` — clippy.js or Microsoft Agent — drawn from its sprite
 * sheet and stepped as the character authored them, its branches included,
 * the animation chosen by the state the stage acts (T-22). Nothing plays for
 * a reader who asks for reduced motion: the first frame of the state stands.
 *
 * @module chat/assistant/SpriteCharacter
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AssistantCharacterAnimation,
  AssistantCharacterData,
} from './formats/types';
import { stateAnimations } from './formats/stateAnimations';
import type { AssistantState } from './state';

/**
 * The frame after `index`: a branch, when the frame has some and the draw
 * falls in one (weights are percents; what is left over goes on), else the
 * next frame; `undefined` at the end of the animation.
 */
export function nextFrameIndex(
  animation: AssistantCharacterAnimation,
  index: number,
  draw: number = Math.random(),
): number | undefined {
  const frame = animation.frames[index];
  let at = draw * 100;
  for (const branch of frame?.branching ?? []) {
    if (at < branch.weight) {
      return branch.frameIndex;
    }
    at -= branch.weight;
  }
  return index + 1 < animation.frames.length ? index + 1 : undefined;
}

/** One of the animations offered for a state, drawn at random. */
export function animationFor(
  character: AssistantCharacterData,
  state: AssistantState,
  draw: number = Math.random(),
): string {
  const names = stateAnimations(character)[state];
  return names[Math.min(names.length - 1, Math.floor(draw * names.length))];
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function SpriteCharacter({
  character,
  state,
  size,
}: {
  character: AssistantCharacterData;
  state: AssistantState;
  size: number;
}): JSX.Element {
  const [play, setPlay] = useState(() => ({
    name: animationFor(character, state),
    index: 0,
  }));
  // A new state starts one of its own animations from the first frame.
  useEffect(() => {
    setPlay({ name: animationFor(character, state), index: 0 });
  }, [character, state]);
  const animation = character.animations[play.name];
  const frame = animation?.frames[play.index];
  const still = useMemo(reducedMotion, []);
  useEffect(() => {
    if (!animation || !frame || still) {
      return;
    }
    const timer = setTimeout(
      () => {
        const next = nextFrameIndex(animation, play.index);
        // At its end an animation gives way to another of the same state.
        setPlay(
          next === undefined
            ? { name: animationFor(character, state), index: 0 }
            : { name: play.name, index: next },
        );
      },
      Math.max(frame.duration, 16),
    );
    return () => clearTimeout(timer);
  }, [animation, frame, play, character, state, still]);
  const { width, height } = character.frameSize;
  const scale = size / Math.max(width, height);
  return (
    <span
      role="img"
      aria-label={character.name}
      data-sprite-animation={play.name}
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
      }}
    >
      {(frame?.images ?? []).map((image, layer) => (
        <span
          key={layer}
          aria-hidden
          style={{
            position: 'absolute',
            left: (size - width * scale) / 2,
            top: (size - height * scale) / 2,
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            backgroundImage: `url(${character.sprite})`,
            backgroundPosition: `-${image.x}px -${image.y}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
      ))}
    </span>
  );
}

export default SpriteCharacter;
