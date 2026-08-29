/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reading an editor toolbar out of the plugins that provide and fill it.
 *
 * One hook rather than the same logic in each editor, because the rule — no
 * provider, no toolbar, and no items either — has to be the same in both or
 * the two editors disagree about what switching a toolbar plugin off means.
 *
 * @module loop/core/toolbar
 */

import { useMemo } from 'react';
import type { Contribution, ContributionPoint } from '@datalayer/reactor';
import { useContributions } from '@datalayer/reactor/react';
import type { ToolbarItem } from '@datalayer/primer-addons';
import type {
  EditorToolbarContext,
  EditorToolbarContribution,
  EditorToolbarItemContribution,
} from './index';

/** What an editor needs to know to draw its toolbar, or not draw it. */
export type EditorToolbar = {
  /**
   * Whether any plugin provides one.
   *
   * `false` means render no toolbar at all — not an empty one. An empty bar
   * would still take a row of space and a border, and would make the toolbar
   * plugin look like decoration rather than the thing that owns the bar.
   */
  present: boolean;
  /** Everything to put on it, ordered by the editor's own toolbar. */
  items: ToolbarItem[];
};

/** Build one plugin's items, without letting a broken one take the editor down. */
function itemsOf(
  entry: Contribution<{ items?: (context: EditorToolbarContext) => ToolbarItem[] }>,
  context: EditorToolbarContext,
): ToolbarItem[] {
  try {
    return entry.value.items?.(context) ?? [];
  } catch (error) {
    // The notebook is the work, the toolbar is furniture: one plugin with a
    // broken item must not cost the reader their editor.
    console.warn(
      `[loop] The plugin ${entry.plugin} failed to build its toolbar items.`,
      error,
    );
    return [];
  }
}

/**
 * The toolbar for this editor: whether there is one, and what is on it.
 *
 * Reading both points is also what activates the plugins waiting on them: an
 * editor that renders causes its toolbar's provider to load, without naming
 * it.
 *
 * @param point The point a plugin provides the toolbar through
 * @param itemPoint The point other plugins add to it through
 * @param context What contributors are handed
 */
export function useEditorToolbar(
  point: ContributionPoint<EditorToolbarContribution>,
  itemPoint: ContributionPoint<EditorToolbarItemContribution>,
  context: EditorToolbarContext,
): EditorToolbar {
  const providers = useContributions(point);
  const additions = useContributions(itemPoint);
  const { workspace, editorId } = context;

  return useMemo(() => {
    if (providers.length === 0) {
      // Nobody provides the bar, so nothing goes on it. Returning the
      // additions here would leave the chat's buttons looking for a toolbar
      // that the editor is not going to draw.
      return { present: false, items: [] };
    }
    const scoped = { workspace, editorId };
    return {
      present: true,
      items: [
        ...providers.flatMap(entry => itemsOf(entry, scoped)),
        ...additions.flatMap(entry => itemsOf(entry, scoped)),
      ],
    };
  }, [providers, additions, workspace, editorId]);
}
