/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The room a scene's balloons take above their members, measured: a graph
 * (`A2ATeamGraph`) or a member alone on its stage keeps above its members
 * what their balloons take now — the greeting, the suggestions, *more*
 * unfolded — and no more, so that the scene's box fits what it shows.
 *
 * @module components/teams/useBalloonRoom
 */

import type { RefObject } from 'react';
import { useEffect, useState } from 'react';

/** A balloon, as measured on the page: its top and its anchor's, in pixels. */
export type BalloonRect = {
  /** The top of what it speaks for: the member's node, or its figure. */
  anchorTop: number;
  /** The balloon's top. */
  top: number;
  /** Its height: a hidden balloon (`display: none`) has none and takes no room. */
  height: number;
};

/** Between the tallest balloon and the edge above it, in pixels at full scale. */
export const BALLOON_MARGIN = 12;

/** The room is kept to steps of this many pixels: a line more or less does not move the members. */
export const BALLOON_ROOM_STEP = 8;

/**
 * The room above the members their balloons take, in pixels at full scale:
 * the tallest balloon above its anchor, with a margin, in steps — at least
 * `floor`. `zoom` is the scale the balloons are drawn at (a graph's
 * viewport): their measures are divided by it.
 */
export function balloonRoomOf(
  balloons: readonly BalloonRect[],
  zoom = 1,
  floor = 0,
): number {
  const scale = zoom > 0 ? zoom : 1;
  const above = Math.max(
    0,
    ...balloons
      .filter(balloon => balloon.height > 0)
      .map(balloon => (balloon.anchorTop - balloon.top) / scale),
  );
  const room =
    above > 0
      ? Math.ceil((above + BALLOON_MARGIN) / BALLOON_ROOM_STEP) *
        BALLOON_ROOM_STEP
      : 0;
  return Math.max(floor, room);
}

/**
 * The room the balloons inside `box` take above their anchors (the closest
 * ancestor of each matching `anchor`), kept current as they open, close
 * and change: at least `floor`, in pixels at full scale.
 */
export function useBalloonRoom(
  box: RefObject<HTMLElement | null>,
  {
    anchor,
    zoom = 1,
    floor = 0,
  }: { anchor: string; zoom?: number; floor?: number },
): number {
  const [room, setRoom] = useState(floor);
  useEffect(() => {
    const element = box.current;
    if (
      !element ||
      typeof ResizeObserver === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      setRoom(floor);
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const balloons: BalloonRect[] = [];
      element
        .querySelectorAll<HTMLElement>('[data-speech-balloon]')
        .forEach(balloon => {
          const owner = balloon.closest<HTMLElement>(anchor);
          if (!owner || !element.contains(owner)) {
            return;
          }
          const rect = balloon.getBoundingClientRect();
          balloons.push({
            anchorTop: owner.getBoundingClientRect().top,
            top: rect.top,
            height: rect.height,
          });
        });
      const next = balloonRoomOf(balloons, zoom, floor);
      setRoom(current => (current === next ? current : next));
    };
    const later = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };
    const sizes = new ResizeObserver(later);
    // A balloon that opens, closes or is made again is observed anew.
    const observe = () => {
      sizes.disconnect();
      element
        .querySelectorAll<HTMLElement>('[data-speech-balloon]')
        .forEach(balloon => sizes.observe(balloon));
      later();
    };
    const changes = new MutationObserver(observe);
    changes.observe(element, { childList: true, subtree: true });
    observe();
    return () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      sizes.disconnect();
      changes.disconnect();
    };
  }, [box, anchor, zoom, floor]);
  return room;
}
