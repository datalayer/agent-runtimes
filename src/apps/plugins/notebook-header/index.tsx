/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook-header` — the Jupyter Data Analyst's
 * title bar: the dataset it works on, what ran (said by the agent: never a
 * run that did not happen), and a Profile data button that asks for a
 * profile of every column.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/notebook-header.yaml`):
 * the items, the frontend tool `set_notebook_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/notebook-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';

export const NOTEBOOK_HEADER_PLUGIN_NAME =
  '@datalayer/loop-plugin-notebook-header';

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const notebookHeaderPlugin = defineHeaderPlugin({
  id: 'notebook-header',
});

export default notebookHeaderPlugin;
