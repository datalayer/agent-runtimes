/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The half of the sheet tools that needs Datalayer Cells: a workbook, and a
 * call applied to it. Reached by a dynamic import on the first call, so the
 * grid's engine is not in a chat's bundle until an agent makes a sheet.
 *
 * @module apps/plugins/page-sheet/workbook
 */

import { createCellsModel, type CellsModel } from '@datalayer/cells';
import { CellsChartsPlugin } from '@datalayer/cells/charts';

export { applySheetCall } from '../../pageTools/sheet';

/** A blank workbook, with the charts a sheet may draw: as the Spreadsheet editor makes one. */
export const newWorkbook = (): CellsModel =>
  createCellsModel({ plugins: [CellsChartsPlugin] });
