/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The notebook toolbar plugin's module — everything behind its manifest.
 *
 * Separate from the entry point so that `@datalayer/jupyter-react`, which the
 * kernel indicator reaches for, is fetched when a notebook toolbar is first
 * read rather than with the shell.
 *
 * @module loop/plugins/notebook-toolbar/plugin
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopNotebookToolbar } from '../../core';
import { notebookToolbarItems } from './items';
import { NOTEBOOK_TOOLBAR_PLUGIN_NAME } from './names';

export const NotebookToolbarPlugin = definePlugin({
  name: NOTEBOOK_TOOLBAR_PLUGIN_NAME,
  contributes: [
    contribution(
      LoopNotebookToolbar,
      { items: ({ editorId }) => notebookToolbarItems(editorId) },
      { id: 'toolbar', order: 100 },
    ),
  ],
});

export default NotebookToolbarPlugin;
