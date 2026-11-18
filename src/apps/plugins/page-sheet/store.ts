/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's workbook and the tools bound to it. Nothing here
 * imports Datalayer Cells: the tools are described from their schemas, and
 * the workbook is made on the first call.
 *
 * What the person types in the grid goes to the same workbook, so a read
 * answers it and a later write lands beside it. It is not kept beyond the
 * page: a restored conversation replays the agent's calls, not the
 * person's edits.
 *
 * @module apps/plugins/page-sheet/store
 */

import type { CellsModel } from '@datalayer/cells';
import type { FrontendToolDefinition } from '../../../types/tools';
import { ConversationBound } from '../../pageTools/conversation';
import {
  SHEET_TOOL_NAMES,
  SHEET_WRITE_TOOL_NAMES,
  sheetToolSpecs,
} from '../../pageTools/sheetSchemas';
import { PAGE_TOOL_RESULTS } from '../../toolCards/toolResults';

export type PageSheet = { model: CellsModel };

/** The workbook of the conversation on the page; none until a tool is called. */
export const PAGE_SHEET = new ConversationBound<PageSheet | null>({
  fresh: () => null,
  writes: SHEET_WRITE_TOOL_NAMES,
  replay: async calls => {
    const { applySheetCall, newWorkbook } = await import('./workbook');
    const model = newWorkbook();
    for (const call of calls) {
      try {
        await applySheetCall(model, call.name, call.args);
      } catch {
        // What was refused then is refused now: the sheet stands without it.
      }
    }
    return { model };
  },
});

/** The sheet's tools, bound to the conversation's workbook. */
export function pageSheetTools(): FrontendToolDefinition[] {
  return sheetToolSpecs(true).map(spec => ({
    ...spec,
    handler: async (args: Record<string, unknown>) => {
      // A restored conversation's workbook first, so that this call adds to it.
      await PAGE_SHEET.sync(PAGE_TOOL_RESULTS.callsOf(SHEET_TOOL_NAMES));
      const { applySheetCall, newWorkbook } = await import('./workbook');
      const sheet =
        PAGE_SHEET.read() ?? PAGE_SHEET.set({ model: newWorkbook() });
      const result = await applySheetCall(sheet!.model, spec.name, args);
      if ((SHEET_WRITE_TOOL_NAMES as readonly string[]).includes(spec.name)) {
        PAGE_SHEET.touch();
      }
      return result;
    },
  }));
}
