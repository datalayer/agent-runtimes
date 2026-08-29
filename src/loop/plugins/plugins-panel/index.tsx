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
 * @module loop/plugins/plugins-panel
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';
import PluginsPanel from './PluginsPanel';

export const PLUGINS_PANEL_PLUGIN_NAME = '@datalayer/loop-plugin-plugins-panel';

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
        // Itself locked: unticking the panel would remove the only way to tick
        // anything back on.
        // The slot hands every component the workspace, which is how the
        // panel can move it to the graph and back.
        Component: ({ workspace }: { workspace?: LoopWorkspaceContext }) => (
          <PluginsPanel
            locked={[PLUGINS_PANEL_PLUGIN_NAME]}
            workspace={workspace}
          />
        ),
      },
    ],
  }),
});

export {
  default as PluginsPanel,
  type PluginsPanelProps,
} from './PluginsPanel';
export default PluginsPanelPlugin;
