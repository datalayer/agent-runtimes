/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The XLSX in a Cells grid, read-only: loaded by `SpreadsheetPreview` when
 * a workbook is drawn, never before, so `@datalayer/cells` and its XLSX
 * reader are a chunk of their own.
 *
 * The model is read-only (every command refused, the formulas computed as
 * the file says) and runs no code cells. The sheet tabs switch between the
 * workbook's sheets; the button saves the file as it came.
 *
 * @module components/outputs/SpreadsheetPreviewView
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Button, Text } from '@primer/react';
import { DownloadIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  CellsProvider,
  createCellsModel,
  Spreadsheet,
  type CellsModel,
} from '@datalayer/cells';
import { CellsChartsPlugin } from '@datalayer/cells/charts';
import { SheetTabs } from '@datalayer/cells/chrome';
import { readXlsx } from '@datalayer/cells/xlsx';
import { useFitHeight } from '../../apps/plugins/agent-outputs/sheets';
import { downloadXlsx, xlsxBytes } from './spreadsheetOutput';

export type SpreadsheetPreviewViewProps = {
  data: unknown;
  name: string;
  maxHeight: number;
};

type Read = {
  model: CellsModel | null;
  bytes: Uint8Array | null;
  error: string;
};

/** The workbook an XLSX holds, read-only, or the sentence why it could not be read. */
export async function readOnlyWorkbook(
  data: unknown,
): Promise<{ model: CellsModel; bytes: Uint8Array }> {
  const bytes = await xlsxBytes(data);
  const { workbook } = readXlsx(bytes);
  const model = createCellsModel({
    data: workbook,
    readOnly: true,
    codeCells: false,
    plugins: [CellsChartsPlugin],
  });
  return { model, bytes };
}

export function SpreadsheetPreviewView({
  data,
  name,
  maxHeight,
}: SpreadsheetPreviewViewProps): JSX.Element {
  const [read, setRead] = useState<Read>({
    model: null,
    bytes: null,
    error: '',
  });
  useEffect(() => {
    let cancelled = false;
    readOnlyWorkbook(data).then(
      ({ model, bytes }) => !cancelled && setRead({ model, bytes, error: '' }),
      (e: unknown) =>
        !cancelled &&
        setRead({
          model: null,
          bytes: null,
          error: e instanceof Error ? e.message : String(e),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [data]);
  const height = useFitHeight(read.model, 160, maxHeight);
  if (read.error) {
    return (
      <Text sx={{ color: 'danger.fg', fontSize: 0 }}>
        Could not read the spreadsheet: {read.error}
      </Text>
    );
  }
  if (!read.model) {
    return (
      <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, m: 0 }}>
        Reading the spreadsheet…
      </Text>
    );
  }
  const several = read.model.sheets.length > 1;
  return (
    <CellsProvider model={read.model}>
      <Box
        data-spreadsheet-preview-sheets={read.model.sheets.length}
        border="1px solid"
        borderColor="border.muted"
        borderRadius={2}
        overflow="hidden"
      >
        <Box height={height}>
          <Spreadsheet model={read.model} aria-label={`${name}, read-only`} />
        </Box>
        {several ? <SheetTabs aria-label={`The sheets of ${name}`} /> : null}
      </Box>
      <Box mt={1}>
        <Button
          size="small"
          variant="invisible"
          leadingVisual={DownloadIcon}
          onClick={() => read.bytes && downloadXlsx(read.bytes, name)}
        >
          Download {name}
        </Button>
      </Box>
    </CellsProvider>
  );
}

export default SpreadsheetPreviewView;
