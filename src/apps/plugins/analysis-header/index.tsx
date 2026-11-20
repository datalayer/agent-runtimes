/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-analysis-header` — the Functional Analyst's title bar: what
 * is being analysed, whether its diagrams parse (said by the agent from what
 * Mermaid's parser answered), and a Draw on the canvas button.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/analysis-header.yaml`):
 * the items, the frontend tool `set_analysis_header` the agent sets them
 * with, and what each item tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/analysis-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';

export const ANALYSIS_HEADER_PLUGIN_NAME =
  '@datalayer/loop-plugin-analysis-header';

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const analysisHeaderPlugin = defineHeaderPlugin({
  id: 'analysis-header',
});

export default analysisHeaderPlugin;
