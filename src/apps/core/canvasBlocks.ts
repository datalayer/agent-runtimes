/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's palette as a contribution point (LOOP C-12), re-exported by
 * `apps/core`: kept apart so that reading the palette loads the reactor and
 * the catalogue, and nothing of the workspace.
 *
 * @module apps/core/canvasBlocks
 */

import { defineContributionPoint } from '@datalayer/reactor';
import type { ComponentSpec } from '../../types/agentspecs';

/**
 * A block the Canvas may place (LOOP C-12): one component of the catalog of
 * visual components (C-13), contributed by the plugin of the UI plugin that
 * renders it. The Canvas's palette is what the enabled plugins contribute
 * here, and nothing else: a plugin disabled takes its blocks off it, and an
 * application that uses one of them says so in its setup notes.
 */
export type CanvasBlockContribution = {
  /** The name a surface gives it, the component's id (e.g. 'Table'). */
  id: string;
  /** The UI plugin of the catalogue that renders it (e.g. 'a2ui'). */
  uiPlugin: string;
  component: ComponentSpec;
};

export const LoopCanvasBlock =
  defineContributionPoint<CanvasBlockContribution>('loop.canvas.block');
