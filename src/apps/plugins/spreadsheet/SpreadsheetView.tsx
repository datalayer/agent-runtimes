/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The spreadsheet view: a workbook in Datalayer Cells, beside the chat.
 *
 * Reached only through the editor's `load()` thunk, so `@datalayer/cells` is
 * not in the shell's bundle until someone opens a spreadsheet. The workbook
 * is kept per conversation (the workspace's `surfaceId`), not per mount:
 * switching to the notebook and back finds the same cells, as switching
 * back to a document finds the same text.
 *
 * @module apps/plugins/spreadsheet/SpreadsheetView
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  CellsProvider,
  createCellsModel,
  Spreadsheet,
  type CellsModel,
} from '@datalayer/cells';
import { CellsChartsPlugin } from '@datalayer/cells/charts';
import { FormulaBar, SheetTabs, Toolbar } from '@datalayer/cells/chrome';
import type { ChatSurfaceProps } from '../../core';

const workbooks = new Map<string, CellsModel>();

/**
 * The workbook of a conversation, made blank the first time it is asked
 * for and the same model every time after.
 */
export function spreadsheetWorkbook(surfaceId: string): CellsModel {
  let model = workbooks.get(surfaceId);
  if (!model) {
    model = createCellsModel({ plugins: [CellsChartsPlugin] });
    workbooks.set(surfaceId, model);
  }
  return model;
}

/** Forget every workbook (tests). */
export function resetSpreadsheetWorkbooks(): void {
  workbooks.clear();
}

export default function SpreadsheetView({
  workspace,
}: ChatSurfaceProps): JSX.Element {
  const surfaceId = workspace.surfaceId;
  const model = useMemo(() => spreadsheetWorkbook(surfaceId), [surfaceId]);
  return (
    <CellsProvider model={model}>
      <Box
        data-spreadsheet-editor={surfaceId}
        height="100%"
        minHeight={0}
        display="flex"
        flexDirection="column"
      >
        <Toolbar />
        <FormulaBar />
        {/* The grid fills what the chrome leaves: it has no size of its own. */}
        <Box flex={1} minHeight={0} position="relative">
          <Spreadsheet model={model} aria-label="Spreadsheet" />
        </Box>
        <SheetTabs />
      </Box>
    </CellsProvider>
  );
}
