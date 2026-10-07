/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A component an application adds to the A2UI catalog it is drawn with (LOOP
 * P-17), as a contribution point, re-exported by `loop/core`: the components
 * its developer wrote, contributed by the application's own plugin, so that
 * its page, the elements its code shows and its answers draw them — in that
 * application's workspace, and in no other.
 *
 * @module loop/core/a2uiComponents
 */

import { defineContributionPoint } from '@datalayer/reactor';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';

export type A2uiComponentContribution = {
  /** The name a surface gives it (e.g. 'Gauge'). */
  id: string;
  /** The application whose developer wrote it, by id. */
  app: string;
  /** Its renderer, as A2UI's catalog registers one. */
  implementation: ReactComponentImplementation;
};

export const LoopA2uiComponent =
  defineContributionPoint<A2uiComponentContribution>('loop.a2ui.component');
