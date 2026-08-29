/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-graph` — the plugin graph, as a view.
 *
 * A thin adapter over the reusable `@datalayer/reactor-graph`: that plugin
 * draws the graph into a `graph` slot, and this one gives the slot a place in
 * the workspace. Keeping them apart is what lets the graph stay generic — it
 * is drawn the same way in a music store and in an agent workspace.
 *
 * @module loop/plugins/graph
 */

import { WorkflowIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { GraphPlugin } from '@datalayer/reactor-graph';
import { LoopCommand, LoopViewType } from '../../core';

export const GRAPH_VIEW_TYPE = 'graph';
export const GRAPH_PLUGIN_NAME = '@datalayer/loop-plugin-graph';

export const GraphViewPlugin = definePlugin({
  name: GRAPH_PLUGIN_NAME,
  displayName: 'Plugin graph',
  description:
    'Draws the plugins, their dependencies and their extension points.',
  octicon: 'workflow',
  emoji: '\u{1F578}',
  // The generic graph plugin is pulled in rather than assumed: mounting this
  // one is enough, whether or not the host remembered the other.
  dependencies: [GraphPlugin],
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: GRAPH_VIEW_TYPE,
        title: 'Plugin graph',
        icon: WorkflowIcon,
        // Last: it is about the workspace rather than part of the work.
        order: 900,
        load: () => import('./GraphView'),
      },
      { id: 'graph', order: 900 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'graph',
        description: 'Show the plugin graph',
        group: 'Session',
        run: async ({ workspace }) => {
          workspace.setActiveViewType(GRAPH_VIEW_TYPE);
        },
      },
      { id: 'graph' },
    ),
  ],
});

export default GraphViewPlugin;
