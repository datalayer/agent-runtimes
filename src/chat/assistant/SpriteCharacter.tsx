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
 * While it speaks, a frame that has mouths (Microsoft Agent's overlays) is
 * drawn with one: the one its voice's loudness opens (`mouthLevel`), else
 * one after another as its words come. Its sounds are played only when the
 * person asked for them (`sounds`, off unless said: the stage's menu has
 * *Play its sounds* and *Mute its sounds*).
 *
 * @module chat/assistant/SpriteCharacter
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AssistantCharacterAnimation,
  AssistantCharacterData,
  AssistantCharacterFrame,
  AssistantMouthShape,
} from './formats/types';
import { stateAnimations } from './formats/stateAnimations';
import { mouthOpening, type AssistantState } from './state';

/** How often the mouth changes while the character speaks, in milliseconds. */
export const MOUTH_STEP_MS = 110;

const WIDE: AssistantMouthShape[] = ['wide1', 'wide2', 'wide3', 'wide4'];

/** The shapes to try, by opening (shut, a little, half, wide). */
const BY_OPENING: Record<0 | 1 | 2 | 3, AssistantMouthShape[]> = {
  0: ['closed', 'narrow'],
  1: ['narrow', 'medium', 'closed'],
  2: ['medium', 'narrow', ...WIDE],
  3: [...WIDE, 'medium'],
};

/**
 * The mouth a frame is drawn with: among the ones it has, the one the voice's
 * `level` opens (any of the wide ones when wide, by `draw`), else, with no
 * voice, one drawn at random; `undefined` when the frame has none.
 */
export function mouthFor(
  frame: Pick<AssistantCharacterFrame, 'mouths'> | undefined,
  level: number | undefined,
  draw: number = Math.random(),
): AssistantMouthShape | undefined {
  const has = Object.keys(frame?.mouths ?? {}) as AssistantMouthShape[];
  if (has.length === 0) {
    return undefined;
  }
  if (level === undefined) {
    return has[Math.min(has.length - 1, Math.floor(draw * has.length))];
  }
  const wanted = BY_OPENING[mouthOpening(level)];
  const wide = WIDE.filter(shape => has.includes(shape));
  if (mouthOpening(level) === 3 && wide.length > 0) {
    return wide[Math.min(wide.length - 1, Math.floor(draw * wide.length))];
  }
  return wanted.find(shape => has.includes(shape)) ?? has[0];
}

/** Plays a sound of the character, in the page. */
export function playCharacterSound(url: string): void {
  const audio = new Audio(url);
  // A sound the browser will not play now (the page not yet interacted
  // with) is skipped: the next frame's will be tried.
  Promise.resolve(audio.play()).catch((error: unknown) => {
    console.warn(`A sound of the character was not played: ${String(error)}`);
  });
}

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
  sounds = false,
  mouthLevel,
  playSound = playCharacterSound,
}: {
  character: AssistantCharacterData;
  state: AssistantState;
  size: number;
  /** Whether its sounds are played: off unless the person asked. */
  sounds?: boolean;
  /** How loud its voice is now, between 0 and 1, while it is heard. */
  mouthLevel?: () => number;
  /** How a sound is played; the page's `Audio` by default. */
  playSound?: (url: string) => void;
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
  // Its sound, when the frame that has one shows and sounds were asked for.
  const soundUrl =
    sounds && frame?.sound !== undefined
      ? character.sounds?.[frame.sound]
      : undefined;
  useEffect(() => {
    if (soundUrl) {
      playSound(soundUrl);
    }
    // Each time a frame with a sound shows, the same sound again included.
  }, [soundUrl, play, playSound]);
  // While it speaks, the frame's mouths, one after another.
  const speaking = state === 'speaking' && !still && Boolean(frame?.mouths);
  const [mouth, setMouth] = useState<AssistantMouthShape | undefined>();
  useEffect(() => {
    if (!speaking) {
      setMouth(undefined);
      return;
    }
    const step = () => setMouth(mouthFor(frame, mouthLevel?.()));
    step();
    const timer = setInterval(step, MOUTH_STEP_MS);
    return () => clearInterval(timer);
  }, [speaking, frame, mouthLevel]);
  const withMouth = speaking && mouth ? frame?.mouths?.[mouth] : undefined;
  const drawn = withMouth ? [withMouth] : (frame?.images ?? []);
  const { width, height } = character.frameSize;
  const scale = size / Math.max(width, height);
  return (
    <span
      className="assistant-sprite"
      role="img"
      aria-label={character.name}
      data-sprite-animation={play.name}
      {...(withMouth ? { 'data-sprite-mouth': mouth } : {})}
      style={{
        position: 'relative',
        display: 'block',
        width: size,
        height: size,
      }}
    >
      {drawn.map((image, layer) => (
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
