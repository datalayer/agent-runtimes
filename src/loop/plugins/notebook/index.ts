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
import {
  LoopCommand,
  LoopEditorView,
  LoopFrontendTool,
  LoopOpeningNotebook,
  requestSurface,
  LoopNotebookToolbar,
} from '../../core';
import { AgentsPlugin } from '../agents';

export const NOTEBOOK_PLUGIN_NAME = '@datalayer/loop-plugin-notebook';

export const NotebookPlugin = definePlugin({
  name: NOTEBOOK_PLUGIN_NAME,
  displayName: 'Notebook editor',
  description: 'A notebook beside the chat, on the session\u2019s kernel.',
  octicon: 'rows',
  emoji: '\u{1F4D3}',
  // The sandbox is a hard dependency: a notebook with no kernel is a text
  // file. The shell and the chat are extended through their points instead —
  // a dependency would take this plugin down with them, and unticking the
  // chat must leave the notebook standing.
  dependencies: [AgentsPlugin],
  // Declared, not merely used: the registry knows who contributed to a
  // point, it cannot know who opened it. Declaring it is also what makes
  // the notebook toolbar visible on the plugin graph before anything has
  // filled it — which is exactly when knowing it exists is most useful.
  // And the opening notebook: what the editor holds before anyone types. The
  // plugin ships one cell with a result; a host whose argument needs several
  // contributes its own, and the view opens on that instead.
  contributionPoints: [LoopNotebookToolbar, LoopOpeningNotebook],
  contributes: [
    // The editor: one entry in the shell's segmented control, one view in
    // the editor column.
    contribution(
      LoopEditorView,
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
        keybinding: 'Mod+Alt+N',
        run: async ({ workspace }) => {
          // The chat first, because the surface lives beside it; then the
          // surface itself. Switching the view alone leaves whichever surface
          // was already open, so on the chat view — where a reader usually is
          // — this used to do nothing at all.
          workspace.setActiveViewType('chat');
          if (!requestSurface('notebook')) {
            throw new Error(
              'No chat is on screen to open the notebook beside.',
            );
          }
        },
      },
      { id: 'notebook' },
    ),
  ],
  build: ctx => {
    /*
     * The tools — what lets the agent create, edit and run cells —
     * contributed when their module arrives. `notebookHooks` imports
     * `@datalayer/jupyter-react` at module load, which is most of Jupyter's
     * frontend; a static contribution would put that whole graph in front
     * of the shell's first paint. The reactor takes contributions at any
     * time and bumps its revision, so the chat re-reads its tools point
     * the moment these land — the same arrangement as the document's
     * lexical tools.
     */
    void import('../../../tools/adapters/agent-runtimes/notebookHooks').then(
      ({ createNotebookTools }) => {
        ctx.contribute(
          LoopFrontendTool,
          {
            id: 'notebook-tools',
            tools: workspace => createNotebookTools(workspace.surfaceId),
          },
          { id: 'notebook-tools' },
        );
      },
    );
    return {};
  },
});

export default NotebookPlugin;
