/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook` — a notebook editor, beside the chat.
 *
 * Contributed to the chat rather than to the workspace: a notebook is what the
 * conversation is about, and a person reading a reply wants the cell it just
 * changed in view, not one tab away.
 *
 * It declares the sandbox plugin as a dependency, which is the point: the
 * relationship is in the extension graph rather than in prose, and the reactor
 * pulls the base plugin in whether or not the host remembered to mount it.
 *
 * @module loop/plugins/notebook
 */

import { RowsIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopChatSurface, LoopCommand, LoopNotebookToolbar } from '../../core';
import { CodeSandboxPlugin } from '../code-sandbox';

export const NOTEBOOK_PLUGIN_NAME = '@datalayer/loop-plugin-notebook';

export const NotebookPlugin = definePlugin({
  name: NOTEBOOK_PLUGIN_NAME,
  displayName: 'Notebook editor',
  description: 'A notebook beside the chat, on the session\u2019s kernel.',
  octicon: 'rows',
  emoji: '\u{1F4D3}',
  dependencies: [CodeSandboxPlugin],
  // Declared, not merely used: the registry knows who contributed to a
  // point, it cannot know who opened it. Declaring it is also what makes
  // the notebook toolbar visible on the plugin graph before anything has
  // filled it — which is exactly when knowing it exists is most useful.
  contributionPoints: [LoopNotebookToolbar],
  contributes: [
    contribution(
      LoopChatSurface,
      {
        surfaceId: 'notebook',
        title: 'Notebook',
        icon: RowsIcon,
        order: 10,
        canOpen: workspace => workspace.sandbox.state === 'running',
        unavailableReason: () => 'Needs a running sandbox',
        load: () => import('./NotebookView'),
      },
      { id: 'notebook', order: 10 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'notebook',
        description: 'Open the notebook beside the chat',
        group: 'Open',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('chat');
        },
      },
      { id: 'notebook' },
    ),
  ],
});

export default NotebookPlugin;
