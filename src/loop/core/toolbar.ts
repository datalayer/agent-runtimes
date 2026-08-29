/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reading an editor toolbar out of the plugins that fill it.
 *
 * One hook rather than the same three lines in each editor, because the
 * ordering rule — contributions first by `order`, then the items each returned
 * by their own `order` — has to be the same in both or the two toolbars drift
 * apart for no reason a reader could see.
 *
 * @module loop/core/toolbar
 */

import { useMemo } from 'react';
import type { ContributionPoint } from '@datalayer/reactor';
import { useContributions } from '@datalayer/reactor/react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import type { EditorToolbarContext, EditorToolbarContribution } from './index';

/**
 * The toolbar items every enabled plugin puts on this editor.
 *
 * Reading the point is also what activates the plugins waiting on it: an
 * editor that renders its toolbar causes the toolbar's contributors to load,
 * without naming any of them.
 *
 * @param point The editor's toolbar contribution point
 * @param context What contributors are handed
 */
export function useEditorToolbarItems(
  point: ContributionPoint<EditorToolbarContribution>,
  context: EditorToolbarContext,
): ToolbarItem[] {
  const contributions = useContributions(point);
  const { workspace, editorId } = context;

  return useMemo(
    () =>
      contributions.flatMap(entry => {
        try {
          return entry.value.items({ workspace, editorId });
        } catch (error) {
          // One plugin with a broken toolbar item must not take the editor
          // down with it — the notebook is the work, the toolbar is furniture.
          console.warn(
            `[loop] The plugin ${entry.plugin} failed to build its toolbar items.`,
            error,
          );
          return [];
        }
      }),
    [contributions, workspace, editorId],
  );
}
