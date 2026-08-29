/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-a2ui` — a prompt runs code, and the result is a UI.
 *
 * @module loop/plugins/a2ui
 */

import { BrowserIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand, LoopViewType } from '../../core';
import { AgentsPlugin } from '../agents';

export const A2UI_PLUGIN_NAME = '@datalayer/loop-plugin-a2ui';

export const A2uiPlugin = definePlugin({
  name: A2UI_PLUGIN_NAME,
  displayName: 'A2UI surfaces',
  description: 'The last execution, rendered as a surface rather than dumped.',
  octicon: 'browser',
  emoji: '\u{1F5BC}',
  dependencies: [AgentsPlugin],
  contributes: [
    contribution(
      LoopViewType,
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
      LoopCommand,
      {
        name: 'a2ui',
        aliases: ['surface'],
        description: 'Show the last execution as a rendered surface',
        group: 'Open',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('a2ui');
        },
      },
      { id: 'a2ui' },
    ),
  ],
});

export default A2uiPlugin;
