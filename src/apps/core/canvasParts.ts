/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's toolbox as a contribution point (LOOP C-20), beside the
 * Canvas's palette of blocks (`canvasBlocks`, C-12): kept apart so that
 * reading the toolbox loads the reactor and the catalogue, and nothing of the
 * workspace.
 *
 * @module apps/core/canvasParts
 */

import { defineContributionPoint } from '@datalayer/reactor';

/** The kinds of part an agent is built from on the Canvas. */
export type CanvasPartKind =
  'connection' | 'rule' | 'skill' | 'test' | 'event' | 'model';

/**
 * A part of an agent the Canvas may place (LOOP C-20): a connection to a
 * server of the catalogue, a skill, a model, a rule, a test, an event —
 * contributed by the plugin of what it comes from. The toolbox is what the
 * enabled plugins contribute here, and nothing else: a plugin disabled takes
 * its parts off it, as it takes its blocks off the palette.
 */
export type CanvasPartContribution = {
  /** Unique among the parts: its kind and what it is, `connection:tavily`. */
  id: string;
  kind: CanvasPartKind;
  /** What the toolbox calls it. */
  label: string;
  /** One line of what it is. */
  says: string;
  emoji?: string;
  /**
   * What it arrives with, spelled as the Appspec's text spells it: a
   * connection's, a rule's, a test's or an event's object, a skill's or a
   * model's id. Every example is one the Appspec's schema takes as it is.
   */
  example: unknown;
  /** Whether what it names is enabled today; a part that is not is offered, and its application's setup notes say so. */
  enabled: boolean;
};

export const LoopCanvasPart =
  defineContributionPoint<CanvasPartContribution>('loop.canvas.part');
