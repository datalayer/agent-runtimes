/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The components the application of this workspace adds to the catalog it
 * is drawn with (LOOP P-17, `loop.a2ui.component`): what its answers, its
 * elements and its page draw beside Datalayer's catalog. None outside an
 * application's workspace, or in one whose developer wrote none.
 *
 * @module apps/plugins/a2ui-surface/ownComponents
 */

import { useMemo } from 'react';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { Catalog } from '@a2ui/web_core/v0_9';
import { useOptionalReactorPlatform } from '@datalayer/reactor/react';
import { catalogWithOwn } from '../../../components/a2ui';
import { LoopA2uiComponent } from '../../core/a2uiComponents';

/** The renderers the workspace's application contributes, in contribution order. */
export function useOwnComponents(): ReactComponentImplementation[] {
  const reactor = useOptionalReactorPlatform();
  return useMemo(
    () =>
      reactor
        ? reactor
            .getContributions(LoopA2uiComponent)
            .map(entry => entry.value.implementation)
        : [],
    [reactor],
  );
}

/** Datalayer's catalog with the workspace's application's own components. */
export function useOwnCatalog(): Catalog<ReactComponentImplementation> {
  const own = useOwnComponents();
  return useMemo(() => catalogWithOwn(own), [own]);
}
