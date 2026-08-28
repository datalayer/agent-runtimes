/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-notebook` — a notebook the agent can drive.
 *
 * It declares the sandbox plugin as a dependency, which is the point: the
 * relationship is in the extension graph rather than in prose, and the reactor
 * pulls the base plugin in whether or not the host remembered to mount it.
 *
 * @module loop/plugins/notebook
 */

import { RowsIcon } from '@primer/octicons-react';
import { contribution, defineExtension } from '@datalayer/reactor';
import { LoopCommand, LoopViewType } from '../../core';
import { CodeSandboxExtension } from '../code-sandbox';

export const NOTEBOOK_EXTENSION_NAME = '@datalayer/loop-plugin-notebook';

export const NotebookExtension = defineExtension({
  name: NOTEBOOK_EXTENSION_NAME,
  dependencies: [CodeSandboxExtension],
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'notebook',
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
        description: 'Open the notebook',
        group: 'Open',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('notebook');
        },
      },
      { id: 'notebook' },
    ),
  ],
});

export default NotebookExtension;
