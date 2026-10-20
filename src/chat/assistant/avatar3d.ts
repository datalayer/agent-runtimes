/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The third kind of avatar: a 3D model (glTF), beside Datalayer's own
 * drawings (`characters`) and the Microsoft Agent characters a person
 * brings (`SpriteCharacter`). What is decided about it without drawing
 * it lives here — which animation is its idle one, which morph targets
 * open its mouth, how far it talks for a voice level, whether the page
 * can draw 3D at all — so it is tested without WebGL; `Avatar3D` draws it,
 * loading three.js only when one is shown.
 *
 * @module chat/assistant/avatar3d
 */

import type { AppAvatarModel3D } from '../../types/agentspecs';

/**
 * The 3D model an avatar of kind `model3d` shows when it names no `url`
 * (agentspecs' `DEFAULT_AVATAR_MODEL_URL`): RobotExpressive, by Tomás
 * Laulhé (Quaternius), CC0 1.0, with Don McCurdy's facial morph targets,
 * from the three.js repository at r170, served by jsDelivr.
 */
export const DEFAULT_AVATAR_MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb';

/** The id a 3D avatar is chosen by, where the others go by theirs. */
export const AVATAR_3D_ID = 'model3d';

/** A 3D avatar, as the stage draws it. */
export interface AssistantModel3D {
  kind: 'model3d';
  id: typeof AVATAR_3D_ID;
  /** Its name, as its menu and the figure's description say it. */
  name: string;
  /** The address of its glTF model. */
  url: string;
}

/** The 3D avatar an Appspec says: its model, or the default robot. */
export function assistantModel3D(avatar?: AppAvatarModel3D): AssistantModel3D {
  const url = avatar?.url || DEFAULT_AVATAR_MODEL_URL;
  return {
    kind: 'model3d',
    id: AVATAR_3D_ID,
    name: url === DEFAULT_AVATAR_MODEL_URL ? 'Robot (3D)' : '3D avatar',
    url,
  };
}

/**
 * What the stage draws for an avatar an Appspec says: an id as it is, a 3D
 * model as `assistantModel3D` makes it, the fallback id when it says none.
 */
export function avatarShown(
  avatar: string | AppAvatarModel3D | undefined,
  fallback: string,
): string | AssistantModel3D {
  if (avatar === undefined) {
    return fallback;
  }
  return typeof avatar === 'string' ? avatar : assistantModel3D(avatar);
}

/** Whether what the stage is given is a 3D avatar. */
export function isAssistantModel3D(value: unknown): value is AssistantModel3D {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'model3d'
  );
}

/** Said where the avatar would stand, in a browser that cannot draw 3D. */
export const NO_WEBGL_SENTENCE =
  'This avatar is a 3D model, and this browser cannot draw 3D: WebGL is turned off or missing.';

/** Said where the avatar would stand, when its model could not be loaded. */
export const modelNotLoadedSentence = (url: string, why: string): string =>
  `The 3D avatar could not be loaded from ${url}: ${why}`;

/** Whether the page can draw WebGL: a canvas that gives a context. */
export function webglAvailable(
  doc: Pick<Document, 'createElement'> | undefined = typeof document ===
  'undefined'
    ? undefined
    : document,
): boolean {
  if (!doc) {
    return false;
  }
  try {
    const canvas = doc.createElement('canvas') as HTMLCanvasElement;
    return Boolean(
      canvas.getContext?.('webgl2') ?? canvas.getContext?.('webgl'),
    );
  } catch {
    return false;
  }
}

/** Whether the reader asks for reduced motion: a still model, no loop. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The animation it idles with: the one named `Idle` (any case), else one
 * whose name says idle, else its first; none when it has none.
 */
export function idleClipName(names: readonly string[]): string | undefined {
  return (
    names.find(name => name.toLowerCase() === 'idle') ??
    names.find(name => /idle/i.test(name)) ??
    names[0]
  );
}

/** The morph targets that open a mouth: mouth, jaw, open, a viseme `aa`, or surprise. */
const TALKING_MORPH = /mouth|jaw|open|^v?_?aa$|viseme_aa|surprised/i;

/** The indices of the morph targets its voice moves, by their names. */
export function talkingMorphIndices(
  dictionary: Readonly<Record<string, number>> | undefined,
): number[] {
  return Object.entries(dictionary ?? {})
    .filter(([name]) => TALKING_MORPH.test(name))
    .map(([, index]) => index);
}

/**
 * How far it talks now, between 0 and 1: its voice's level while it is
 * heard, else, speaking with no voice, a mouth that moves as words come;
 * nothing while quiet, or for a reader who asks for reduced motion.
 */
export function talkAmount({
  speaking,
  level,
  reducedMotion,
  seconds,
}: {
  speaking: boolean;
  level?: number;
  reducedMotion: boolean;
  seconds: number;
}): number {
  if (!speaking || reducedMotion) {
    return 0;
  }
  if (level !== undefined) {
    return Math.max(0, Math.min(1, level));
  }
  return 0.25 + 0.25 * Math.abs(Math.sin(seconds * 9));
}

/**
 * The next value of a smoothed amount, `seconds` after the last: it follows
 * the target without jumping, as a mouth does.
 */
export function smoothed(
  previous: number,
  target: number,
  seconds: number,
): number {
  const follow = 1 - Math.exp(-Math.max(0, seconds) * 18);
  return previous + (target - previous) * follow;
}

/**
 * How far the camera stands from a model of this size, with this field of
 * view (degrees), for it to fill the square it is drawn in.
 */
export function cameraDistance(size: number, fovDegrees: number): number {
  const half = (fovDegrees * Math.PI) / 360;
  return (Math.max(size, 0.001) / 2 / Math.tan(half)) * 1.15;
}
