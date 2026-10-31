/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The halo round a selected edge (SCENES S3-02): a wide, faint stroke under
 * the edge, in the backdrop's colour, so the exchange chosen in the
 * transcript is seen on the stage, on every backdrop.
 *
 * @module components/teams/backdrops/halo
 */

import type { JSX } from 'react';

/** A wide, faint stroke under a selected edge's path. */
export function EdgeHalo({
  path,
  color,
}: {
  path: string;
  /** The halo's colour: a CSS value, `var(--scene-stage-glow)`. */
  color: string;
}): JSX.Element {
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={12}
      strokeLinecap="round"
      opacity={0.35}
      data-edge-selected=""
    />
  );
}
