/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The backdrops a scene's stage is drawn with: `studio`, `hero`, `plain`,
 * `space`, `minimal`, `orb` ({@link SCENE_BACKDROPS}, in a chooser's order), and the one an id
 * names ({@link sceneBackdrop}: `studio` for none, and for an id the
 * graph does not know, said once in the console).
 *
 * @module components/teams/backdrops
 */

import type { SceneBackdrop } from './types';
import { STUDIO_BACKDROP } from './studio';
import { HERO_BACKDROP } from './hero';
import { PLAIN_BACKDROP } from './plain';
import { SPACE_BACKDROP } from './space';
import { MINIMAL_BACKDROP } from './minimal';
import { ORB_BACKDROP } from './orb';

export type {
  SceneBackdrop,
  SceneBackdropFace,
  SceneBackdropId,
  SceneBackdropLayout,
  SceneBackdropTheme,
  StageSx,
} from './types';
export * from './catalogue';
export { sceneStageSx } from './theme';

/** The six backdrops, in a chooser's order: the drawing every scene had first. */
export const SCENE_BACKDROPS: readonly SceneBackdrop[] = [
  STUDIO_BACKDROP,
  HERO_BACKDROP,
  PLAIN_BACKDROP,
  SPACE_BACKDROP,
  MINIMAL_BACKDROP,
  ORB_BACKDROP,
];

/** The backdrop of a scene that says none: every scene written before draws as before. */
export const DEFAULT_SCENE_BACKDROP: SceneBackdrop = STUDIO_BACKDROP;

/** The ids said not to be a backdrop, each once. */
const UNKNOWN_SAID = new Set<string>();

/**
 * The backdrop an id names; `studio` for none, and for an id no backdrop
 * has — said once in the console, so a scene with a backdrop the graph does
 * not know still plays.
 */
export function sceneBackdrop(id?: string): SceneBackdrop {
  if (!id) {
    return DEFAULT_SCENE_BACKDROP;
  }
  const found = SCENE_BACKDROPS.find(backdrop => backdrop.id === id);
  if (found) {
    return found;
  }
  if (!UNKNOWN_SAID.has(id)) {
    UNKNOWN_SAID.add(id);
    console.warn(
      `There is no scene backdrop "${id}"; the stage is drawn as ${DEFAULT_SCENE_BACKDROP.id}. The backdrops are ${SCENE_BACKDROPS.map(backdrop => backdrop.id).join(', ')}.`,
    );
  }
  return DEFAULT_SCENE_BACKDROP;
}
