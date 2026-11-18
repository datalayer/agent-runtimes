/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workbook drawn, as Datalayer Cells draws one: the grid, its formula
 * bar and its tabs, editable by the person. Reached only through the card's
 * lazy import, so the grid is not in a chat's bundle until a sheet is on
 * screen.
 *
 * Export is Cells' own CSV writer (`@datalayer/cells/csv`), of the tab
 * shown: values as computed.
 *
 * @module apps/plugins/page-sheet/SheetStage
 */

import { useCallback, useSyncExternalStore, type JSX } from 'react';
import { DownloadIcon } from '@primer/octicons-react';
import { Button, Text } from '@primer/react';
import { Box, Card } from '@datalayer/primer-addons';
import { CellsProvider, Spreadsheet, type CellsModel } from '@datalayer/cells';
import { FormulaBar, SheetTabs } from '@datalayer/cells/chrome';
import { toCsv } from '@datalayer/cells/csv';
import { cellsWritten } from '../../pageTools/sheet';

export const PAGE_SHEET_WORDS = {
  kicker: 'Sheet',
  export: 'Export CSV',
  exportTitle: 'Download the tab shown as a CSV file',
  cells: (n: number): string => (n === 1 ? '1 cell' : `${n} cells`),
  kept: 'You can edit the cells. Your edits stay on this page: export to keep them.',
} as const;

/** The height of the grid in a conversation: some twelve rows in sight. */
export const PAGE_SHEET_GRID_HEIGHT = 340;

/** A file name from a tab's name: letters, digits, dashes. */
export const csvFileName = (tab: string): string =>
  `${
    tab
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sheet'
  }.csv`;

/** The tab shown as CSV text, by Cells' own writer. */
export const sheetCsv = (model: CellsModel): string =>
  toCsv(model, { sheet: model.selection.sheet });

function download(name: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SheetStage({
  model,
}: {
  model: CellsModel;
}): JSX.Element {
  const subscribe = useCallback(
    (listener: () => void) => {
      const changes = model.subscribe(listener);
      const selections = model.subscribeSelection(listener);
      return () => {
        changes();
        selections();
      };
    },
    [model],
  );
  // The tab shown and how much it holds, kept current as the agent or the person writes.
  const facts = useSyncExternalStore(
    subscribe,
    () => `${model.revision}:${model.selection.sheet}`,
    () => '',
  );
  const tab = model.sheet(model.selection.sheet).name;
  const written = cellsWritten(model);
  return (
    <Card
      as="section"
      aria-label={`${PAGE_SHEET_WORDS.kicker}: ${tab}`}
      data-page-sheet=""
      data-page-sheet-tab={tab}
      data-page-sheet-cells={written}
      data-page-sheet-facts={facts}
      border
      shadow="none"
      overflow="hidden"
      my={2}
      width="100%"
      maxWidth={760}
    >
      <Box
        display="flex"
        alignItems="center"
        px={3}
        py={2}
        borderBottom="1px solid"
        borderColor="border.muted"
        sx={{ gap: 2, minWidth: 0 }}
      >
        <Text
          sx={{
            fontSize: 0,
            fontWeight: 'semibold',
            color: 'success.fg',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {PAGE_SHEET_WORDS.kicker}
        </Text>
        <Text
          as="h4"
          sx={{
            m: 0,
            fontSize: 2,
            fontWeight: 'semibold',
            color: 'fg.default',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
        >
          {tab}
        </Text>
        <Text
          sx={{
            fontSize: 0,
            color: 'fg.muted',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {PAGE_SHEET_WORDS.cells(written)}
        </Text>
        <Button
          size="small"
          leadingVisual={DownloadIcon}
          title={PAGE_SHEET_WORDS.exportTitle}
          disabled={written === 0}
          onClick={() => download(csvFileName(tab), sheetCsv(model))}
          data-page-sheet-export=""
        >
          {PAGE_SHEET_WORDS.export}
        </Button>
      </Box>
      <CellsProvider model={model}>
        <FormulaBar />
        {/* The grid fills the box it is given: it has no size of its own. */}
        <Box height={PAGE_SHEET_GRID_HEIGHT} position="relative">
          <Spreadsheet model={model} aria-label={`Spreadsheet: ${tab}`} />
        </Box>
        <SheetTabs />
      </CellsProvider>
      <Box
        px={3}
        py={2}
        borderTop="1px solid"
        borderColor="border.muted"
        bg="canvas.subtle"
      >
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {PAGE_SHEET_WORDS.kept}
        </Text>
      </Box>
    </Card>
  );
}
