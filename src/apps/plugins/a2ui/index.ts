/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-a2ui` — a prompt runs code, and the result is a UI.
 *
 * @module apps/plugins/a2ui
 */

import { BrowserIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { AgentCommand, AgentViewType } from '../../core';
import { AgentsPlugin } from '../agents';
import { uiManifestOf } from '../../uiManifest';

export const A2UI_PLUGIN_NAME = '@datalayer/agent-plugin-a2ui';

export const A2uiPlugin = definePlugin({
  name: A2UI_PLUGIN_NAME,
  ...uiManifestOf('a2ui-view'),
  dependencies: [AgentsPlugin],
  contributes: [
    contribution(
      AgentViewType,
      {
        viewType: 'a2ui',
        title: 'Surface',
        icon: BrowserIcon,
        order: 30,
        canOpen: workspace =>
          workspace.sandbox.state === 'running' &&
          // The converter that turns an execution into a surface lives on the
          // server (D20), so a browser sandbox has nothing to render with.
          // Saying so is better than an empty panel.
          workspace.sandbox.variant !== 'pyodide',
        unavailableReason: workspace =>
          workspace.sandbox.variant === 'pyodide'
            ? 'Surfaces are rendered by the server; this sandbox runs in the browser'
            : 'Needs a running sandbox',
        load: () => import('./A2uiView'),
      },
      { id: 'a2ui', order: 30 },
    ),
    contribution(
      AgentCommand,
      {
        name: 'a2ui',
        aliases: ['surface'],
        description: 'Show the last execution as a rendered surface',
        group: 'Open',
        keybinding: 'Mod+Alt+U',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('a2ui');
        },
      },
      { id: 'a2ui' },
    ),
  ],
});

export default A2uiPlugin;
