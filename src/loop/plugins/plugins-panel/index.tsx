/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-plugins-panel` — the plugin list, as a plugin.
 *
 * It fills the sidebar slot like any other contribution, which is the joke and
 * also the proof: the thing that switches plugins on and off is itself one, and
 * can be left out of a host that does not want it.
 *
 * The list itself is no longer written here. `@datalayer/reactor-manager` is
 * the same surface, generic — a filter, a row per plugin, a switch each — and
 * the workspace had grown its own copy that answered the same questions
 * slightly differently. This plugin is now the loop's placement of it: which
 * slot it goes in, and which plugin may not be switched off.
 *
 * What went with the rewrite is the graph button. The panel used to draw it,
 * which meant asking by name whether a graph view was mounted; the graph
 * plugin contributes it to the manager's action slot now, so it appears and
 * disappears with the thing it opens.
 *
 * @module loop/plugins/plugins-panel
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { GraphPlugin } from '@datalayer/reactor-graph';
import { PluginsManagerView } from '@datalayer/reactor-manager';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';

export const PLUGINS_PANEL_PLUGIN_NAME = '@datalayer/loop-plugin-plugins-panel';

/**
 * How wide the panel is, and the aside around it.
 *
 * Declared here rather than in the shell so the two cannot disagree: the panel
 * truncates its descriptions to the width it was given, and truncating to a
 * width the container does not actually have is how text ends up cut short in
 * the middle of empty space.
 */
export const SIDEBAR_WIDTH = 420;

/** The generic graph plugin, which the loop's own adapter wraps. */
const REACTOR_GRAPH_PLUGIN_NAME = GraphPlugin.name;

export const PluginsPanelPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: PLUGINS_PANEL_PLUGIN_NAME,
  displayName: 'Plugins panel',
  description: 'Switch plugins on and off while the workspace runs.',
  octicon: 'plug',
  emoji: '\u{1F50C}',
  build: () => ({
    components: [
      {
        id: 'plugins-panel',
        slot: LoopSlots.sidebar,
        // Itself protected: switching the panel off would remove the only way
        // to switch anything back on.
        //
        // The workspace is forwarded rather than used here — the manager
        // passes whatever it is given to the plugins contributing actions, and
        // the graph button is the one that needs it.
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
          <PluginsManagerView
            protectedPlugins={[PLUGINS_PANEL_PLUGIN_NAME]}
            // `@datalayer/loop-plugin-graph` is the switch that matters: it
            // places the graph in this workspace and pulls the generic plugin
            // in as a dependency. Listing both put two switches in front of
            // one feature, with no way to tell which to use.
            hiddenPlugins={[REACTOR_GRAPH_PLUGIN_NAME]}
            width={SIDEBAR_WIDTH}
            workspace={workspace}
          />
        ),
      },
    ],
  }),
});

export { PluginsManagerView as PluginsPanel } from '@datalayer/reactor-manager';
export default PluginsPanelPlugin;
