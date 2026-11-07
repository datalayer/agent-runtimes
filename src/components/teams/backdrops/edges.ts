/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What every backdrop's edges share: the straight path between two ends,
 * and the arrowhead at the end a message goes to.
 *
 * @module components/teams/backdrops/edges
 */

/** A point of the graph. */
export type Point = { x: number; y: number };

/** The straight path from one end to the other. */
export const straightPath = (source: Point, target: Point): string =>
  `M ${source.x},${source.y} L ${target.x},${target.y}`;

const ARROW = 9;

/**
 * An arrowhead at the end a message goes to — the target's when `forward`,
 * the source's otherwise — pointing along the edge.
 */
export function arrowPath(
  source: Point,
  target: Point,
  forward: boolean,
  length = ARROW,
): string {
  const tip = forward ? target : source;
  const from = forward ? source : target;
  const span = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  // Along the edge, toward the tip; and across it.
  const ax = (tip.x - from.x) / span;
  const ay = (tip.y - from.y) / span;
  const bx = tip.x - ax * length;
  const by = tip.y - ay * length;
  const px = -ay * (length / 1.6);
  const py = ax * (length / 1.6);
  return `M ${tip.x},${tip.y} L ${bx + px},${by + py} L ${bx - px},${by - py} Z`;
}

/** The middle of an edge, where its words go. */
export const midpoint = (source: Point, target: Point): Point => ({
  x: (source.x + target.x) / 2,
  y: (source.y + target.y) / 2,
});
