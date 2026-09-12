/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The idle sandbox signal answers with the same object every time.
 *
 * `useSignalValue` is a `useSyncExternalStore`, so whatever `peek()` returns is
 * the snapshot React compares by identity. Four views each declared their own
 * placeholder for "the sandbox plugin is switched off", and all four built the
 * value inside `peek` — a fresh object per call, so the snapshot never settled
 * and the workspace re-rendered without bound. The visible failure was a
 * nested-update overflow inside a Primer overlay in the plugins panel, nowhere
 * near the cause.
 *
 * The rule is one line and easy to undo by hand, which is why it is pinned
 * here: a placeholder is read, not built.
 */

import { describe, expect, it } from 'vitest';

import {
  IDLE_SANDBOX_SNAPSHOT,
  IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  IDLE_SANDBOX_TARGET_SIGNAL,
} from '../core';

describe('the idle sandbox snapshot', () => {
  it('peeks the same object every time', () => {
    // Identity, not equality: `Object.is` is what decides whether React
    // re-renders, and two equal objects are two snapshots to it.
    expect(IDLE_SANDBOX_SNAPSHOT_SIGNAL.peek()).toBe(
      IDLE_SANDBOX_SNAPSHOT_SIGNAL.peek(),
    );
    expect(IDLE_SANDBOX_SNAPSHOT_SIGNAL.peek()).toBe(IDLE_SANDBOX_SNAPSHOT);
  });

  it('reads the same object through `value`', () => {
    expect(IDLE_SANDBOX_SNAPSHOT_SIGNAL.value).toBe(
      IDLE_SANDBOX_SNAPSHOT_SIGNAL.peek(),
    );
  });

  it('says the sandbox is idle', () => {
    expect(IDLE_SANDBOX_SNAPSHOT.state).toBe('idle');
  });

  it('cannot be mutated by whoever reads it', () => {
    // Shared by every view that reads it, so one of them writing to it would
    // change what the others see.
    expect(Object.isFrozen(IDLE_SANDBOX_SNAPSHOT)).toBe(true);
  });

  it('has no target, stably', () => {
    expect(IDLE_SANDBOX_TARGET_SIGNAL.peek()).toBeUndefined();
    expect(IDLE_SANDBOX_TARGET_SIGNAL.peek()).toBe(
      IDLE_SANDBOX_TARGET_SIGNAL.peek(),
    );
  });
});
