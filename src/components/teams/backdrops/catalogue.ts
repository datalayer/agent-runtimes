/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The backdrops by name: the id a scene keeps (`stage.backdrop`, agentspecs'
 * `Backdrop`), the name a chooser shows, and one line of what the stage
 * looks like. Pure — no React, no React Flow — so a chooser, an editor or a
 * test lists them without loading the drawings; `backdrops/index.ts` draws
 * each one.
 *
 * @module components/teams/backdrops/catalogue
 */

import type { SceneBackdropId } from '../../../types/scenes';

/** A backdrop as a chooser offers it. */
export interface SceneBackdropChoice {
  id: SceneBackdropId;
  /** `Studio`, `Hero`, `Plain`. */
  name: string;
  /** One line of what the stage looks like. */
  description: string;
}

/** The three backdrops, in a chooser's order: the drawing every scene had first. */
export const SCENE_BACKDROP_CHOICES: readonly SceneBackdropChoice[] = [
  {
    id: 'studio',
    name: 'Studio',
    description:
      'Characters with speech balloons; each message flows along its line.',
  },
  {
    id: 'hero',
    name: 'Hero',
    description:
      'Round faces on a deep tint, thin lines, and a dot that flies with each message.',
  },
  {
    id: 'plain',
    name: 'Plain',
    description: 'Boxes and arrows, nothing moves: for a printout or a slide.',
  },
];

/** The backdrop of a scene that says none: every scene written before draws as before. */
export const DEFAULT_SCENE_BACKDROP_ID: SceneBackdropId = 'studio';

/** The choice an id names; `studio` for none, and for an id no backdrop has. */
export const sceneBackdropChoice = (id?: string): SceneBackdropChoice =>
  SCENE_BACKDROP_CHOICES.find(choice => choice.id === id) ??
  SCENE_BACKDROP_CHOICES[0];

/**
 * The backdrop a stage is drawn with: its scene's `stage.backdrop`, `studio`
 * when the scene says none or one no backdrop has. Every stage reads it
 * here — a card's thumbnail, a stage's page, the home page — so that a
 * scene plays on the same backdrop wherever it plays.
 */
export const stageBackdropOf = (
  scene?: { stage?: { backdrop?: string } } | null,
): SceneBackdropId => sceneBackdropChoice(scene?.stage?.backdrop).id;
