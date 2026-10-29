/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The 3D avatar moves from one state to the next without a blink: one
 * renderer and one loaded model across every state and every replay, each
 * new animation faded in over the last one (never cut, never faded out to
 * nothing), a wave that settles back into idle, and a goodbye or a step
 * aside that walks out of its square rather than vanishing. three.js is
 * stood in for by fakes that record what is asked of them.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantState } from '../assistant/state';
import {
  CROSSFADE_SECONDS,
  OUT_OF_FRAME,
  assistantModel3D,
} from '../assistant/avatar3dModel';

const three = vi.hoisted(() => {
  type Listener = (event: { action: unknown }) => void;
  const record = {
    renderers: 0,
    loads: 0,
    mixers: [] as FakeMixer[],
    model: undefined as undefined | FakeObject,
  };
  class FakeObject {
    name = '';
    type = 'Object3D';
    rotation = {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
      },
    };
    position = { x: 0, y: 0, z: 0 };
    children: FakeObject[] = [];
    traverse(visit: (object: FakeObject) => void) {
      visit(this);
      this.children.forEach(child => child.traverse(visit));
    }
  }
  class FakeClip {
    constructor(
      public name: string,
      public duration = 1,
    ) {}
    clone() {
      return new FakeClip(this.name, this.duration);
    }
  }
  class FakeAction {
    calls: string[] = [];
    crossFadedFrom: FakeAction[] = [];
    fadeDurations: number[] = [];
    loop = 0;
    clampWhenFinished = false;
    time = 0;
    constructor(public clip: FakeClip) {}
    getClip() {
      return this.clip;
    }
    reset() {
      this.calls.push('reset');
      return this;
    }
    setLoop(loop: number) {
      this.loop = loop;
      return this;
    }
    setEffectiveWeight() {
      return this;
    }
    play() {
      this.calls.push('play');
      return this;
    }
    stop() {
      this.calls.push('stop');
      return this;
    }
    fadeOut() {
      this.calls.push('fadeOut');
      return this;
    }
    crossFadeFrom(previous: FakeAction, duration: number) {
      this.crossFadedFrom.push(previous);
      this.fadeDurations.push(duration);
      return this;
    }
  }
  class FakeMixer {
    actions = new Map<FakeClip, FakeAction>();
    listeners: Listener[] = [];
    constructor() {
      record.mixers.push(this);
    }
    clipAction(clip: FakeClip) {
      let action = this.actions.get(clip);
      if (!action) {
        action = new FakeAction(clip);
        this.actions.set(clip, action);
      }
      return action;
    }
    addEventListener(_type: string, listener: Listener) {
      this.listeners.push(listener);
    }
    update() {}
    finish(action: FakeAction) {
      this.listeners.forEach(listener => listener({ action }));
    }
    named(name: string) {
      return [...this.actions.values()].filter(
        action => action.clip.name === name,
      );
    }
  }
  return { record, FakeObject, FakeClip, FakeAction, FakeMixer };
});

vi.mock('three', () => {
  class Vector3 {
    x = 1;
    y = 2;
    z = 1;
  }
  return {
    SRGBColorSpace: 'srgb',
    LoopOnce: 2200,
    LoopRepeat: 2201,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      constructor() {
        three.record.renderers += 1;
      }
      setPixelRatio() {}
      setSize() {}
      render() {}
      dispose() {}
    },
    Scene: class {
      add() {}
      traverse() {}
    },
    HemisphereLight: class {},
    DirectionalLight: class {
      position = { set() {} };
    },
    PerspectiveCamera: class {
      position = { set() {} };
      lookAt() {}
    },
    Box3: class {
      setFromObject() {
        return this;
      }
      getSize() {
        return new Vector3();
      }
      getCenter() {
        return new Vector3();
      }
    },
    Vector3,
    AnimationMixer: three.FakeMixer,
    Clock: class {
      elapsedTime = 0;
      getDelta() {
        this.elapsedTime += 0.1;
        return 0.1;
      }
    },
  };
});

const ROBOT_CLIPS = ['Idle', 'Wave', 'Walking', 'Sitting', 'Yes'];

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync() {
      three.record.loads += 1;
      const model = new three.FakeObject();
      const head = new three.FakeObject();
      head.name = 'Head';
      head.type = 'Bone';
      model.children.push(head);
      three.record.model = model;
      return {
        scene: model,
        animations: ROBOT_CLIPS.map(name => new three.FakeClip(name)),
      };
    }
  },
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let frames: FrameRequestCallback[] = [];
let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  three.record.renderers = 0;
  three.record.loads = 0;
  three.record.mixers = [];
  frames = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as RenderingContext,
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  reducedMotion(false);
});

/** What the reader asks: reduced motion, or not. */
function reducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches }),
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function draw(
  props: { state: AssistantState; aside?: boolean; replay?: number },
  first = false,
) {
  const { Avatar3D } = await import('../assistant/Avatar3D');
  if (first) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <Avatar3D avatar={assistantModel3D()} size={120} {...props} />,
    );
  });
  // three.js and the model arrive asynchronously.
  await act(async () => {
    for (let wait = 0; wait < 10; wait += 1) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
}

/** Runs `count` animation frames. */
function run(count: number) {
  for (let index = 0; index < count; index += 1) {
    const next = frames.shift();
    next?.(index * 16);
  }
}

const mixer = () => three.record.mixers[0];
const action = (name: string) => mixer().named(name)[0];

describe('a 3D avatar changing state', () => {
  it('keeps its one renderer and its one model through every state and every replay', async () => {
    await draw({ state: 'idle' }, true);
    expect(three.record.renderers).toBe(1);
    expect(three.record.loads).toBe(1);
    for (const state of [
      'greeting',
      'thinking',
      'working',
      'waiting',
      'speaking',
      'paused',
      'goodbye',
      'idle',
    ] as const) {
      await draw({ state });
      run(3);
    }
    await draw({ state: 'idle', aside: true });
    await draw({ state: 'idle', aside: false });
    await draw({ state: 'greeting', replay: 1 });
    await draw({ state: 'greeting', replay: 2 });
    expect(three.record.renderers).toBe(1);
    expect(three.record.loads).toBe(1);
    expect(three.record.mixers).toHaveLength(1);
    expect(host!.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('fades each new animation in over the last one', async () => {
    await draw({ state: 'idle' }, true);
    await draw({ state: 'working' });
    const walking = action('Walking');
    expect(walking.crossFadedFrom).toEqual([action('Idle')]);
    expect(walking.fadeDurations).toEqual([CROSSFADE_SECONDS]);
    expect(CROSSFADE_SECONDS).toBeGreaterThanOrEqual(0.3);
    expect(CROSSFADE_SECONDS).toBeLessThanOrEqual(0.5);
    await draw({ state: 'paused' });
    expect(action('Sitting').crossFadedFrom).toEqual([walking]);
    // Never faded out to nothing, and never stopped: that shows the bind pose.
    for (const each of mixer().actions.values()) {
      expect(each.calls).not.toContain('fadeOut');
      expect(each.calls).not.toContain('stop');
    }
  });

  it('settles a wave back into idle, faded, and replays it faded over itself', async () => {
    await draw({ state: 'greeting' }, true);
    const wave = action('Wave');
    expect(wave.loop).toBe(2200);
    expect(wave.clampWhenFinished).toBe(true);
    act(() => mixer().finish(wave));
    expect(action('Idle').crossFadedFrom).toEqual([wave]);
    // Played again: a second action of the same clip, faded over the first.
    await draw({ state: 'greeting', replay: 1 });
    const waves = mixer().named('Wave');
    expect(waves.length).toBeGreaterThanOrEqual(1);
    const latest = waves[waves.length - 1];
    expect(latest.crossFadedFrom.length).toBe(1);
    await draw({ state: 'greeting', replay: 2 });
    const again = mixer().named('Wave');
    expect(again[again.length - 1].crossFadedFrom.length).toBeGreaterThan(0);
  });

  it('walks out of its square to say goodbye, and to step aside, and back', async () => {
    await draw({ state: 'goodbye' }, true);
    const model = three.record.model!;
    act(() => mixer().finish(action('Wave')));
    // Waved: it walks, faded in over the wave.
    expect(action('Walking').crossFadedFrom).toEqual([action('Wave')]);
    run(40);
    expect(model.position.x).toBeGreaterThan(0.9 * OUT_OF_FRAME * 2);
    expect(host!.querySelector('canvas')).not.toBeNull();
    // Back for a new state: it walks back in, then idles.
    await draw({ state: 'idle' });
    run(60);
    expect(Math.abs(model.position.x)).toBeLessThan(0.1);
    // Aside: out by walking, back after.
    await draw({ state: 'idle', aside: true });
    expect(host!.querySelector('[data-avatar-aside]')).not.toBeNull();
    run(40);
    expect(model.position.x).toBeGreaterThan(0.9 * OUT_OF_FRAME * 2);
    await draw({ state: 'idle', aside: false });
    run(60);
    expect(Math.abs(model.position.x)).toBeLessThan(0.1);
  });

  it('follows a new pose damped: no frame jumps to it', async () => {
    await draw({ state: 'idle' }, true);
    run(5);
    const model = three.record.model!;
    const before = model.rotation.x;
    await draw({ state: 'waiting' });
    run(1);
    const firstStep = model.rotation.x - before;
    // Waiting leans in by 0.12: one frame of 0.1 s goes part of the way.
    expect(firstStep).toBeGreaterThan(0);
    expect(firstStep).toBeLessThan(0.12);
    run(30);
    expect(model.rotation.x).toBeCloseTo(0.12, 2);
  });
});

describe('a 3D avatar for a reader who asks for reduced motion', () => {
  it('replaces one animation with the next, with no fade, drawn once', async () => {
    reducedMotion(true);
    await draw({ state: 'idle' }, true);
    await draw({ state: 'paused' });
    expect(action('Sitting').crossFadedFrom).toEqual([]);
    expect(action('Idle').calls).toContain('stop');
    // No loop of frames: still.
    expect(frames).toHaveLength(0);
    expect(three.record.renderers).toBe(1);
  });
});
