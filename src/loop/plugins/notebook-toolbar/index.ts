/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook-toolbar` — the notebook's own toolbar items.
 *
 * A plugin of its own rather than part of the notebook editor, because the
 * toolbar is where several parties meet. The editor offers a point and draws
 * whatever is contributed to it; this plugin provides the bar itself and puts
 * the notebook's own furniture on it — a light saying what the notebook is
 * running on — and opens a second point for everyone else, which is where the
 * chat's agent actions arrive.
 *
 * Switch this off and the notebook has **no toolbar at all**, not an empty
 * one, and the chat's buttons go with it: they had nowhere to sit. The
 * notebook itself keeps working, which is the point of the split.
 *
 * Lazy, and waiting on the toolbar point rather than on startup. Nothing has to
 * name it: the notebook renders its toolbar, that read fires the point's
 * activation event, and the module arrives. A workspace where nobody opens a
 * notebook never fetches it at all — which is the whole reason its manifest
 * lives here and its code does not.
 *
 * @module loop/plugins/notebook-toolbar
 */

import { defineLazyPlugin, onContributionPoint } from '@datalayer/reactor';
import { LoopNotebookToolbar, LoopNotebookToolbarItem } from '../../core';
import { NOTEBOOK_TOOLBAR_PLUGIN_NAME } from './names';

export { NOTEBOOK_TOOLBAR_PLUGIN_NAME };

export const NotebookToolbarPlugin = defineLazyPlugin({
  name: NOTEBOOK_TOOLBAR_PLUGIN_NAME,
  displayName: 'Notebook toolbar',
  description: 'Shows what the notebook is running on, on its toolbar.',
  octicon: 'circle',
  emoji: '\u{1F7E2}',
  activationEvents: [onContributionPoint(LoopNotebookToolbar)],
  // The bar is what accepts buttons, so the plugin that owns the bar is the
  // one that opens the point. Declared here rather than inside the module, so
  // the graph shows the point — and the chat's contributions to it — before
  // this plugin's code has been fetched.
  contributionPoints: [LoopNotebookToolbarItem],
  load: () => import('./plugin'),
});

export default NotebookToolbarPlugin;
