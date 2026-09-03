/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook-view` — the notebook, one click away.
 *
 * The footer icon that opens the notebook beside the conversation. It shows
 * only while a notebook is actually contributed, and requires the
 * input-prompt plugin, whose footer the icon sits in.
 *
 * @module loop/plugins/notebook-view
 */

// The same icon the notebook's own editor view declares, so the footer
// button and the selector entry read as one thing.
import { RowsIcon } from '@primer/octicons-react';
import { defineViewPlugin } from '../view-switch';

export const NOTEBOOK_VIEW_PLUGIN_NAME = '@datalayer/loop-plugin-notebook-view';

export const NotebookViewPlugin = defineViewPlugin({
  key: 'notebook',
  viewId: 'notebook',
  displayName: 'Notebook View',
  description: 'The notebook beside the chat, from the composer footer.',
  icon: RowsIcon,
  tooltip: 'Show the notebook',
  octicon: 'rows',
  emoji: '\u{1F4D3}',
  order: 11,
});

export default NotebookViewPlugin;
