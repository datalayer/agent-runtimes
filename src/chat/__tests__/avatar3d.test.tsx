/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The 3D avatar (the third kind, beside the drawings and the Microsoft Agent
 * characters): what is decided without WebGL — its model, its idle
 * animation, the morph targets its voice moves, how far it talks — and the
 * sentence said where it would stand in a browser that cannot draw 3D,
 * before three.js is ever loaded.
 */

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assistantCharacterFor } from '../../apps/plugins/assistant-characters';
import { ASSISTANT_CHARACTERS } from '../assistant/characters';
import {
  DEFAULT_AVATAR_MODEL_URL,
  NO_WEBGL_SENTENCE,
  assistantModel3D,
  avatarShown,
  cameraDistance,
  idleClipName,
  isAssistantModel3D,
  smoothed,
  talkAmount,
  talkingMorphIndices,
  webglAvailable,
} from '../assistant/avatar3d';

vi.mock('three', () => {
  throw new Error('three.js is loaded only when WebGL can draw it');
});

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
    expect(holder.querySelector('[role="status"]')?.textContent).toBe(
      NO_WEBGL_SENTENCE,
    );
    expect(holder.querySelector('canvas')).toBeNull();
    act(() => root.unmount());
    getContext.mockRestore();
  });
});
