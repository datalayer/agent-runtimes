/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The 3D avatar (the third kind, beside the drawings and the Microsoft Agent
 * characters): what is decided without WebGL — its model, its idle
 * animation, how it acts each state the other avatars act (an animation
 * of its own, else moved by code), the morph targets its voice moves, how
 * far it talks — and the
 * sentence said where it would stand in a browser that cannot draw 3D,
 * before three.js is ever loaded.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantCharacterFor } from '../../apps/plugins/assistant-characters';
import { ASSISTANT_CHARACTERS } from '../assistant/characters';
import type { AssistantState } from '../assistant/state';
import {
  AVATAR_3D_STATES,
  DEFAULT_AVATAR_MODEL_URL,
  NO_WEBGL_SENTENCE,
  assistantModel3D,
  avatarShown,
  OUT_OF_FRAME,
  REST_POSE,
  accentPose,
  cameraDistance,
  dampedPose,
  idleClipName,
  leavingPose,
  isAssistantModel3D,
  proceduralPose,
  smoothed,
  stateMotion,
  talkAmount,
  talkingMorphIndices,
  walkClipName,
  webglAvailable,
} from '../assistant/avatar3dModel';

vi.mock('three', () => {
  throw new Error('three.js is loaded only when WebGL can draw it');
});

/** RobotExpressive's animations, the default model's. */
const ROBOT_CLIPS = [
  'Dance',
  'Death',
  'Idle',
  'Jump',
  'No',
  'Punch',
  'Running',
  'Sitting',
  'Standing',
  'ThumbsUp',
  'Walking',
  'WalkJump',
  'Wave',
  'Yes',
];

/** Every state, keyed so that a state added to the union fails to compile here. */
const EVERY_STATE: Record<AssistantState, true> = {
  idle: true,
  greeting: true,
  thinking: true,
  working: true,
  waiting: true,
  speaking: true,
  paused: true,
  goodbye: true,
};

const contributed = ASSISTANT_CHARACTERS.map(character => ({
  id: character.id,
  character,
}));

describe('a 3D avatar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is the default robot unless its url names another model', () => {
    expect(assistantModel3D({ kind: 'model3d' })).toEqual({
      kind: 'model3d',
      id: 'model3d',
      name: 'Robot (3D)',
      url: DEFAULT_AVATAR_MODEL_URL,
    });
    const fox = assistantModel3D({
      kind: 'model3d',
      url: 'https://example.com/fox.glb',
    });
    expect(fox.url).toBe('https://example.com/fox.glb');
    expect(fox.name).toBe('3D avatar');
    expect(isAssistantModel3D(fox)).toBe(true);
    expect(isAssistantModel3D(ASSISTANT_CHARACTERS[0])).toBe(false);
    expect(DEFAULT_AVATAR_MODEL_URL).toMatch(/^https:\/\/.+\.glb$/);
  });

  it('is what the application names, winning over the person’s choice', () => {
    const chosen = assistantCharacterFor(contributed, {
      app: { kind: 'model3d' },
      person: 'wizard',
    });
    expect(chosen).toMatchObject({ id: 'model3d', saidBy: 'app' });
    expect('character' in chosen && isAssistantModel3D(chosen.character)).toBe(
      true,
    );
    // An id is still looked up in what is contributed.
    expect(assistantCharacterFor(contributed, { app: 'cat' })).toMatchObject({
      id: 'cat',
    });
    expect(avatarShown(undefined, 'paperclip')).toBe('paperclip');
    expect(avatarShown('eyes', 'paperclip')).toBe('eyes');
    expect(avatarShown({ kind: 'model3d' }, 'paperclip')).toMatchObject({
      kind: 'model3d',
    });
  });

  it('idles with its Idle animation, else one that says idle, else its first', () => {
    expect(idleClipName(['Dance', 'Idle', 'Wave'])).toBe('Idle');
    expect(idleClipName(['Run', 'breathing_idle'])).toBe('breathing_idle');
    expect(idleClipName(['Run'])).toBe('Run');
    expect(idleClipName([])).toBeUndefined();
  });

  it('acts every state the other avatars act', () => {
    expect([...AVATAR_3D_STATES].sort()).toEqual(
      Object.keys(EVERY_STATE).sort(),
    );
  });

  it('acts a state with the robot’s own animation when it has one, else idles and is moved', () => {
    const robot = Object.fromEntries(
      AVATAR_3D_STATES.map(state => [state, stateMotion(state, ROBOT_CLIPS)]),
    ) as Record<AssistantState, ReturnType<typeof stateMotion>>;
    expect(robot.idle).toMatchObject({ clip: 'Idle', own: true, once: false });
    // Hello and goodbye: it waves once, then idles again.
    expect(robot.greeting).toMatchObject({
      clip: 'Wave',
      own: true,
      once: true,
      holds: false,
      procedural: false,
    });
    expect(robot.goodbye).toMatchObject({ clip: 'Wave', once: true });
    // It walks while it works, and sits down, staying seated, when paused.
    expect(robot.working).toMatchObject({ clip: 'Walking', once: false });
    expect(robot.paused).toMatchObject({
      clip: 'Sitting',
      once: true,
      holds: true,
    });
    // No animation of its own: it idles, moved by code.
    for (const state of ['thinking', 'waiting', 'speaking'] as const) {
      expect(robot[state]).toMatchObject({
        clip: 'Idle',
        own: false,
        procedural: true,
      });
    }
    // A model with no animations at all is moved by code in every state.
    for (const state of AVATAR_3D_STATES) {
      expect(stateMotion(state, [])).toEqual({
        clip: undefined,
        own: false,
        once: false,
        holds: false,
        procedural: true,
      });
    }
    // A model's own names win: one that says it thinks, thinks with it.
    expect(stateMotion('thinking', ['Idle', 'Thinking'])).toMatchObject({
      clip: 'Thinking',
      own: true,
    });
  });

  it('is moved differently in each state, by code', () => {
    const at = 0.5;
    const poses = AVATAR_3D_STATES.map(state =>
      JSON.stringify(proceduralPose(state, at)),
    );
    expect(new Set(poses).size).toBe(AVATAR_3D_STATES.length);
    for (const state of AVATAR_3D_STATES) {
      const pose = proceduralPose(state, at);
      expect(Object.values(pose).some(value => value !== 0)).toBe(true);
      for (const value of Object.values(pose)) {
        // Small turns and lifts: the model stays in its square.
        expect(Math.abs(value)).toBeLessThan(0.5);
      }
    }
    // Thinking tilts its head and looks up; paused hangs it.
    expect(proceduralPose('thinking', at).headRoll).toBeGreaterThan(0);
    expect(proceduralPose('thinking', at).headPitch).toBeLessThan(0);
    expect(proceduralPose('paused', at).headPitch).toBeGreaterThan(0);
    // The hello wiggle settles; goodbye sinks.
    expect(Math.abs(proceduralPose('greeting', 0).bodyYaw)).toBeGreaterThan(
      Math.abs(proceduralPose('greeting', 1.9).bodyYaw),
    );
    expect(proceduralPose('goodbye', 1).bodyLift).toBeLessThan(
      proceduralPose('goodbye', 0.1).bodyLift,
    );
  });

  it('reads each state with character: thinking sways, waiting leans in and bobs, speaking nods', () => {
    const over = (state: AssistantState, key: keyof typeof REST_POSE) =>
      Array.from({ length: 80 }, (_, index) => index * 0.05).map(
        t => proceduralPose(state, t)[key],
      );
    const spread = (values: number[]) =>
      Math.max(...values) - Math.min(...values);
    // Thinking: the head tilted throughout, swaying slowly.
    expect(Math.min(...over('thinking', 'headRoll'))).toBeGreaterThan(0.15);
    expect(spread(over('thinking', 'bodyYaw'))).toBeGreaterThan(0.05);
    // Waiting: leant in throughout, bobbing.
    expect(Math.min(...over('waiting', 'bodyLean'))).toBeGreaterThan(0.1);
    expect(spread(over('waiting', 'bodyLift'))).toBeGreaterThan(0.01);
    // Speaking: the head nods in a rhythm.
    expect(spread(over('speaking', 'headPitch'))).toBeGreaterThan(0.05);
    // Over its own animation, little is added: its head down to work.
    expect(accentPose('working', 1).headPitch).toBeGreaterThan(0.1);
    expect(accentPose('greeting', 1)).toEqual(REST_POSE);
  });

  it('follows a new pose damped, never jumping to it, and settles on it', () => {
    const target = proceduralPose('waiting', 0);
    const first = dampedPose(REST_POSE, target, 1 / 60);
    expect(first.bodyLean).toBeGreaterThan(0);
    expect(first.bodyLean).toBeLessThan(target.bodyLean / 4);
    let pose = REST_POSE;
    for (let frame = 0; frame < 120; frame += 1) {
      pose = dampedPose(pose, target, 1 / 60);
    }
    expect(pose.bodyLean).toBeCloseTo(target.bodyLean, 3);
    expect(dampedPose(target, target, 0.5)).toEqual(target);
  });

  it('leaves by walking out of its square, turned to its side, and with the robot’s walk', () => {
    expect(leavingPose(0).bodyShift).toBe(0);
    expect(leavingPose(0).bodyYaw).toBeCloseTo(Math.PI / 2);
    expect(leavingPose(0.5).bodyShift).toBeGreaterThan(0);
    expect(leavingPose(0.5).bodyShift).toBeLessThan(OUT_OF_FRAME);
    expect(leavingPose(10).bodyShift).toBe(OUT_OF_FRAME);
    // Drawn still: already gone, a number in every field.
    expect(Object.values(leavingPose(Infinity)).every(Number.isFinite)).toBe(
      true,
    );
    expect(walkClipName(ROBOT_CLIPS)).toBe('Walking');
    expect(walkClipName(['Idle'])).toBeUndefined();
  });

  it('opens the morph targets of a mouth with its voice, not the others', () => {
    // RobotExpressive's: its surprise opens the mouth.
    expect(talkingMorphIndices({ Angry: 0, Surprised: 1, Sad: 2 })).toEqual([
      1,
    ]);
    expect(
      talkingMorphIndices({ jawOpen: 3, mouthSmile: 4, eyeBlink_L: 5 }),
    ).toEqual([3, 4]);
    expect(talkingMorphIndices(undefined)).toEqual([]);
  });

  it('talks as loud as its voice, moves its mouth with no voice, and is still when asked', () => {
    const at = { speaking: true, reducedMotion: false, seconds: 1 };
    expect(talkAmount({ ...at, level: 0.7 })).toBe(0.7);
    expect(talkAmount({ ...at, level: 3 })).toBe(1);
    const unvoiced = talkAmount(at);
    expect(unvoiced).toBeGreaterThanOrEqual(0.25);
    expect(unvoiced).toBeLessThanOrEqual(0.5);
    expect(talkAmount({ ...at, speaking: false, level: 0.7 })).toBe(0);
    expect(talkAmount({ ...at, reducedMotion: true, level: 0.7 })).toBe(0);
    // Smoothed: towards the target, never past it.
    const next = smoothed(0, 1, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
    expect(smoothed(0.4, 0.4, 0.5)).toBeCloseTo(0.4);
    expect(cameraDistance(2, 30)).toBeGreaterThan(cameraDistance(1, 30));
  });

  it('says, where it would stand, that this browser cannot draw 3D — and loads no three.js', async () => {
    expect(
      webglAvailable({
        createElement: () =>
          ({ getContext: () => null }) as unknown as HTMLElement,
      } as Pick<Document, 'createElement'>),
    ).toBe(false);
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(null);
    const { Avatar3D } = await import('../assistant/Avatar3D');
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const root = createRoot(holder);
    await act(async () => {
      root.render(
        <Avatar3D avatar={assistantModel3D()} state="idle" size={88} />,
      );
    });
    const figure = holder.querySelector('[data-avatar-model3d]');
    expect(figure?.getAttribute('aria-label')).toBe('Robot (3D)');
    expect(figure?.getAttribute('data-avatar-state')).toBe('idle');
    await act(async () => {
      root.render(
        <Avatar3D avatar={assistantModel3D()} state="thinking" size={88} />,
      );
    });
    expect(figure?.getAttribute('data-avatar-state')).toBe('thinking');
    expect(holder.querySelector('[role="status"]')?.textContent).toBe(
      NO_WEBGL_SENTENCE,
    );
    expect(holder.querySelector('canvas')).toBeNull();
    act(() => root.unmount());
    getContext.mockRestore();
  });
});
