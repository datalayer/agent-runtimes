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
 * @module chat/assistant/avatar3dModel
 */

import type { AppAvatarModel3D } from '../../types/agentspecs';
import type { AssistantState } from './state';

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

/** Every state a 3D avatar acts out, as the drawings and sprites do. */
export const AVATAR_3D_STATES = [
  'idle',
  'greeting',
  'thinking',
  'working',
  'waiting',
  'speaking',
  'paused',
  'goodbye',
] as const satisfies readonly AssistantState[];

/**
 * The animations a model may have for each state, by name, in order of
 * preference; `once` plays it a single time, then idles again, unless it
 * `holds` its last pose. RobotExpressive's are `Idle`, `Wave`, `Walking`
 * and `Sitting` among others.
 */
const STATE_CLIPS: Record<
  AssistantState,
  { names: readonly RegExp[]; once?: boolean; holds?: boolean }
> = {
  idle: { names: [/^idle$/i, /idle/i] },
  greeting: { names: [/^wave$/i, /wave|greet|hello/i], once: true },
  thinking: { names: [/think|ponder/i] },
  working: { names: [/work|typing/i, /^walk(ing)?$/i] },
  waiting: { names: [/wait/i] },
  speaking: { names: [/talk|speak/i] },
  paused: { names: [/^sit(ting)?$/i, /sit/i], once: true, holds: true },
  goodbye: { names: [/bye/i, /^wave$/i, /wave/i], once: true },
};

/** How a 3D avatar acts a state: an animation of its own, or idle and moved by code. */
export interface StateMotion {
  /** The animation played: the state's own, else its idle one; none when it has none. */
  clip?: string;
  /** Whether that animation is the state's own. */
  own: boolean;
  /** Played once, then idle again (or held). */
  once: boolean;
  /** Its last pose held once played. */
  holds: boolean;
  /** Whether the state is acted by moving the model (`proceduralPose`): it has no animation of its own. */
  procedural: boolean;
}

/** How a model with these animations acts a state. */
export function stateMotion(
  state: AssistantState,
  names: readonly string[],
): StateMotion {
  const wanted = STATE_CLIPS[state];
  for (const pattern of wanted.names) {
    const clip = names.find(name => pattern.test(name));
    if (clip) {
      return {
        clip,
        own: true,
        once: !!wanted.once,
        holds: !!wanted.holds,
        procedural: false,
      };
    }
  }
  return {
    clip: idleClipName(names),
    own: false,
    once: false,
    holds: false,
    procedural: true,
  };
}

/**
 * How the model is moved, by code, over what its animation does: its head
 * (radians, added to its head bone, or to the whole model when it has none)
 * and its body (turned, leant, lifted and shifted sideways by a share of its
 * size).
 */
export interface Pose3D {
  headPitch: number;
  headYaw: number;
  headRoll: number;
  bodyYaw: number;
  bodyLean: number;
  bodyLift: number;
  /** Sideways, a share of its size: past `OUT_OF_FRAME` it has left its square. */
  bodyShift: number;
}

/** Its pose with nothing added: as its animation leaves it. */
export const REST_POSE: Readonly<Pose3D> = {
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  bodyYaw: 0,
  bodyLean: 0,
  bodyLift: 0,
  bodyShift: 0,
};
const REST = REST_POSE;

/** What a 3D avatar acts: a state, or stepped aside from what covers it. */
export type Avatar3DAct = AssistantState | 'aside';

/**
 * The pose of a state, `seconds` after it began, for a model with no
 * animation of its own for it: idle breathes and looks about, greeting
 * wiggles hello, thinking tilts its head, looks up and sways slowly, working
 * bobs looking down, waiting leans in, bobbing, with a questioning tilt,
 * speaking nods and turns its head in the rhythm of talk, paused slumps,
 * goodbye wiggles and sinks.
 */
export function proceduralPose(state: AssistantState, seconds: number): Pose3D {
  const t = Math.max(0, seconds);
  const sin = Math.sin;
  switch (state) {
    case 'idle':
      return {
        ...REST,
        headYaw: 0.08 * sin(t * 0.45),
        bodyLift: 0.006 * sin(t * 2),
      };
    case 'greeting': {
      const fade = Math.max(0.15, 1 - t / 2);
      return {
        ...REST,
        bodyYaw: 0.3 * sin(t * 7 + Math.PI / 2) * fade,
        headRoll: 0.15 * sin(t * 7 + Math.PI / 2) * fade,
        bodyLift: 0.035 * Math.abs(sin(t * 7 + Math.PI / 2)) * fade,
      };
    }
    case 'thinking':
      return {
        ...REST,
        headPitch: -0.16 + 0.03 * sin(t * 0.7),
        headRoll: 0.24 + 0.04 * sin(t * 0.8),
        headYaw: 0.22 * sin(t * 0.6 + 0.4),
        bodyYaw: 0.07 * sin(t * 0.5),
      };
    case 'working':
      return {
        ...REST,
        headPitch: 0.22,
        headYaw: 0.12 * sin(t * 3),
        bodyLift: 0.02 * Math.abs(sin(t * 10 + 0.3)),
      };
    case 'waiting':
      return {
        ...REST,
        bodyLean: 0.12,
        headPitch: -0.06,
        headRoll: -0.14 + 0.05 * sin(t * 1.6),
        bodyLift: 0.014 * sin(t * 2.4),
      };
    case 'speaking':
      return {
        ...REST,
        headPitch: 0.07 * sin(t * 4.6),
        headYaw: 0.12 * sin(t * 1.7 + 0.6),
        headRoll: 0.05 * sin(t * 2.3),
        bodyYaw: 0.04 * sin(t * 1.1),
      };
    case 'paused':
      return { ...REST, headPitch: 0.35, bodyLean: 0.1, bodyLift: -0.03 };
    case 'goodbye':
      return {
        ...REST,
        bodyYaw: 0.3 * sin(t * 7 + Math.PI / 2),
        bodyLift: -0.12 * Math.min(1, t / 0.7),
      };
  }
}

/**
 * What is added over a state's own animation: little, so that the
 * animation reads — the head down over its work, and nothing else.
 */
export function accentPose(state: AssistantState, seconds: number): Pose3D {
  return state === 'working'
    ? { ...REST, headPitch: 0.16 + 0.03 * Math.sin(Math.max(0, seconds) * 3) }
    : REST;
}

/** How far sideways, as a share of its size, it has left its square. */
export const OUT_OF_FRAME = 1.25;

/**
 * Leaving (goodbye, once it has waved, and stepped aside): turned to its
 * side and walking out of its square, `seconds` after it set off. It does
 * not vanish: it goes.
 */
export function leavingPose(seconds: number): Pose3D {
  // Long gone (or drawn still): out of its square, standing.
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 60;
  return {
    ...REST,
    bodyYaw: Math.PI / 2,
    bodyShift: Math.min(OUT_OF_FRAME, 0.9 * t),
    bodyLift: t < 3 ? 0.012 * Math.abs(Math.sin(t * 8)) : 0,
  };
}

/** How long a goodbye with no animation of its own waves before it goes. */
export const GOODBYE_WAVE_SECONDS = 1.2;

/** How long one animation fades into the next: never a cut to the next. */
export const CROSSFADE_SECONDS = 0.4;

/** How fast a pose follows its target, per second: settled in about half a second. */
export const POSE_FOLLOW_RATE = 7;

/**
 * The pose `seconds` after `current`, following `target` without jumping
 * (exponentially damped, field by field): a new state's pose is reached,
 * never snapped to.
 */
export function dampedPose(
  current: Pose3D,
  target: Pose3D,
  seconds: number,
  rate: number = POSE_FOLLOW_RATE,
): Pose3D {
  const follow = 1 - Math.exp(-Math.max(0, seconds) * rate);
  const next = { ...current };
  for (const key of Object.keys(target) as (keyof Pose3D)[]) {
    next[key] = current[key] + (target[key] - current[key]) * follow;
  }
  return next;
}

/** The animation it walks with (away, and back): `Walking`, `Walk`; none when it has none. */
export function walkClipName(names: readonly string[]): string | undefined {
  return names.find(name => /^walk(ing)?$/i.test(name));
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
