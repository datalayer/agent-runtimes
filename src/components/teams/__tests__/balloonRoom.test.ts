/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The room a scene's balloons take above their members: the tallest, with a
 * margin, in steps, at least the page's floor; a hidden balloon takes none.
 */

import { describe, expect, it } from 'vitest';
import {
  BALLOON_MARGIN,
  BALLOON_ROOM_STEP,
  balloonRoomOf,
} from '../useBalloonRoom';

describe('balloonRoomOf', () => {
  it('keeps the tallest balloon above its anchor, with a margin, in steps', () => {
    const room = balloonRoomOf([
      { anchorTop: 300, top: 160, height: 140 },
      { anchorTop: 300, top: 220, height: 80 },
    ]);
    expect(room).toBe(
      Math.ceil((140 + BALLOON_MARGIN) / BALLOON_ROOM_STEP) * BALLOON_ROOM_STEP,
    );
    expect(room % BALLOON_ROOM_STEP).toBe(0);
  });

  it('measures at full scale: a graph drawn at half takes twice its pixels', () => {
    expect(balloonRoomOf([{ anchorTop: 100, top: 30, height: 70 }], 0.5)).toBe(
      balloonRoomOf([{ anchorTop: 140, top: 0, height: 140 }], 1),
    );
  });

  it('is never less than the floor, and a hidden balloon takes no room', () => {
    expect(balloonRoomOf([], 1, 96)).toBe(96);
    expect(balloonRoomOf([{ anchorTop: 300, top: 0, height: 0 }])).toBe(0);
    expect(
      balloonRoomOf([{ anchorTop: 300, top: 260, height: 40 }], 1, 96),
    ).toBe(96);
  });
});
