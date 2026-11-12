/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-spreadsheet` — a workbook beside the chat.
 *
 * The same shape as the notebook and document plugins, contributed to the
 * same point: an editor the conversation is about, drawn by Datalayer Cells.
 * Unlike those two it needs no sandbox — the grid computes its formulas in
 * the page — so it can always be opened.
 *
 * Nothing here imports `@datalayer/cells`: the view is reached through its
 * `load()` thunk, so a workspace pays for the grid only when a workbook is
 * opened.
 *
 * @module apps/plugins/spreadsheet
 */

import { TableIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopCommand, LoopEditorView, requestSurface } from '../../core';

export const SPREADSHEET_PLUGIN_NAME = '@datalayer/loop-plugin-spreadsheet';

/** The editor's surface id: what `/editor spreadsheet` and the selector name. */
export const SPREADSHEET_SURFACE_ID = 'spreadsheet';

export const SpreadsheetPlugin = definePlugin({
  name: SPREADSHEET_PLUGIN_NAME,
  displayName: 'Spreadsheet editor',
  description: 'A workbook beside the chat, drawn by Datalayer Cells.',
  octicon: 'table',
  emoji: '\u{1F9EE}',
  contributes: [
    contribution(
      LoopEditorView,
      {
        surfaceId: SPREADSHEET_SURFACE_ID,
        title: 'Spreadsheet',
        icon: TableIcon,
        // After the notebook (10) and the document (20), before a deck (30).
        order: 25,
        load: () => import('./SpreadsheetView'),
      },
      { id: SPREADSHEET_SURFACE_ID, order: 25 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'spreadsheet',
        description: 'Open the spreadsheet beside the chat',
        group: 'Open',
        keybinding: 'Mod+Alt+S',
        run: async ({ workspace }) => {
          // The chat first, because the editor lives beside it — as the
          // notebook and document commands do.
          workspace.setActiveViewType('chat');
          if (!requestSurface(SPREADSHEET_SURFACE_ID)) {
            throw new Error(
              'No chat is on screen to open the spreadsheet beside.',
            );
          }
        },
      },
      { id: 'spreadsheet' },
    ),
  ],
});

export default SpreadsheetPlugin;
