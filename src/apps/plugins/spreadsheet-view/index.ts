/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-spreadsheet-view` — the spreadsheet, one click away.
 *
 * The footer icon that opens the workbook beside the conversation, like the
 * notebook's and the document's. It shows only while the spreadsheet editor
 * is contributed.
 *
 * @module apps/plugins/spreadsheet-view
 */

import { TableIcon } from '@primer/octicons-react';
import { defineViewPlugin } from '../view-switch';

export const SPREADSHEET_VIEW_PLUGIN_NAME =
  '@datalayer/loop-plugin-spreadsheet-view';

export const SpreadsheetViewPlugin = defineViewPlugin({
  key: 'spreadsheet',
  viewId: 'spreadsheet',
  displayName: 'Spreadsheet view',
  description: 'The spreadsheet beside the chat, from the composer footer.',
  icon: TableIcon,
  tooltip: 'Show the spreadsheet',
  octicon: 'table',
  emoji: '\u{1F9EE}',
  order: 13,
});

export default SpreadsheetViewPlugin;
