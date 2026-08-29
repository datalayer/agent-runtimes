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
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { GraphPlugin } from '@datalayer/reactor-graph';
import { MANAGER_ACTIONS_SLOT } from '@datalayer/reactor-manager';
import { LoopCommand, LoopViewType, type LoopWorkspaceContext } from '../../core';
import GraphToggle from './GraphToggle';
import { GRAPH_VIEW_TYPE } from './viewType';

export { GRAPH_VIEW_TYPE } from './viewType';
export const GRAPH_PLUGIN_NAME = '@datalayer/loop-plugin-graph';

export const GraphViewPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: GRAPH_PLUGIN_NAME,
  displayName: 'Plugin graph',
  description:
    'Draws the plugins, their dependencies and their extension points.',
  octicon: 'workflow',
  emoji: '\u{1F578}',
  // The generic graph plugin is pulled in rather than assumed: mounting this
  // one is enough, whether or not the host remembered the other.
  dependencies: [GraphPlugin],
  /*
   * The way in, contributed beside the view it opens.
   *
   * It used to be drawn by the plugins panel, which had to ask whether a graph
   * view existed before showing it — a panel checking for a plugin it knows by
   * name. Owning the button here means switching this plugin off takes the
   * button with it, and the manager needs to know nothing about graphs.
   */
  build: () => ({
    components: [
      {
        id: 'graph-toggle',
        slot: MANAGER_ACTIONS_SLOT,
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
          <GraphToggle workspace={workspace} />
        ),
      },
    ],
  }),
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
