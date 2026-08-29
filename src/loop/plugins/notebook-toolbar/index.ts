/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook-toolbar` — the notebook's own toolbar items.
 *
 * A plugin of its own rather than part of the notebook editor, because the
 * toolbar is where several parties meet: the editor offers the point, this
 * plugin puts the notebook's own furniture on it — a light saying what the
 * notebook is running on — and the chat puts the agent actions on it. Splitting
 * them means each can be switched off without the others noticing: turn this
 * one off and the notebook keeps working, minus its kernel light.
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
import { LoopNotebookToolbar } from '../../core';
import { NOTEBOOK_TOOLBAR_PLUGIN_NAME } from './names';

export { NOTEBOOK_TOOLBAR_PLUGIN_NAME };

export const NotebookToolbarPlugin = defineLazyPlugin({
  name: NOTEBOOK_TOOLBAR_PLUGIN_NAME,
  displayName: 'Notebook toolbar',
  description: 'Shows what the notebook is running on, on its toolbar.',
  octicon: 'circle',
  emoji: '\u{1F7E2}',
  activationEvents: [onContributionPoint(LoopNotebookToolbar)],
  load: () => import('./plugin'),
});

export default NotebookToolbarPlugin;
