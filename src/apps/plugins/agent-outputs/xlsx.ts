/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's XLSX, drawn read-only in Cells in the chat message that
 * carries it: the `spreadsheet` output spec's file, as a ```xlsx block (or
 * one whose `# filename:` ends in .xlsx) of base64, a `data:` URL or a URL.
 *
 * Light on purpose, unlike `./sheets`: nothing here imports Cells. The
 * renderer (`XlsxCodeBlock`) loads the grid and its XLSX reader when a
 * workbook is drawn, so the preset mounts this in every chat for nothing
 * until one arrives.
 *
 * @module apps/plugins/agent-outputs/xlsx
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { ChatCodeBlock } from '../../../chat/messages/codeBlocks';
import { XlsxCodeBlock } from '../../../components/outputs/SpreadsheetPreview';
import {
  XLSX_LANGUAGES,
  parseXlsxBlock,
} from '../../../components/outputs/spreadsheetOutput';

export const AGENT_OUTPUTS_XLSX_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-outputs-xlsx';

/** A ```xlsx block of an answer, drawn read-only as its workbook in the message. */
export const AgentOutputsXlsxPlugin = definePlugin({
  name: AGENT_OUTPUTS_XLSX_PLUGIN_NAME,
  displayName: 'Agent Outputs: XLSX',
  description:
    'An XLSX the agent gives, opened read-only in Datalayer Cells in the chat.',
  octicon: 'table',
  emoji: '🧮',
  contributes: [
    contribution(
      ChatCodeBlock,
      {
        id: 'cells-xlsx',
        // A plain fence may name an .xlsx file too; `match` decides.
        languages: [...XLSX_LANGUAGES, 'text', 'base64'],
        match: block => parseXlsxBlock(block.language, block.code) !== null,
        Component: XlsxCodeBlock,
      },
      { id: 'cells-xlsx' },
    ),
  ],
});

export default AgentOutputsXlsxPlugin;
