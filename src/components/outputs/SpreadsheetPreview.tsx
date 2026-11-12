/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's XLSX output, read-only, in Datalayer Cells: the `spreadsheet`
 * output spec's file, wherever outputs are shown — in the chat message that
 * carries it ({@link XlsxCodeBlock}), and in a page's own panels.
 *
 * As the notebook preview does with jupyter-react, the grid is imported
 * only when a workbook is drawn (`SpreadsheetPreviewView`, its own chunk):
 * a chat, and the page it is on, stay light until one arrives.
 *
 * @module components/outputs/SpreadsheetPreview
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ChatCodeBlockProps } from '../../chat/messages/codeBlocks';
import { parseXlsxBlock } from './spreadsheetOutput';

/** Cells and its XLSX reader: loaded when a workbook is drawn. */
const SpreadsheetPreviewView = lazy(() => import('./SpreadsheetPreviewView'));

export type SpreadsheetPreviewProps = {
  /**
   * The XLSX: bytes, an `ArrayBuffer`, base64, a `data:` URL or an
   * `http(s)` URL (`xlsxBytes`).
   */
  data: unknown;
  /** Its file name: said to a screen reader, and the download's name. */
  name: string;
  /** The tallest it grows, in pixels; it scrolls within. */
  maxHeight?: number;
};

/** An XLSX, read-only, in a Cells grid, with a button to download it. */
export function SpreadsheetPreview({
  data,
  name,
  maxHeight = 420,
}: SpreadsheetPreviewProps): JSX.Element {
  return (
    // The whole measure of the message, and wide enough for a few columns
    // in a bubble that hugs its text: a grid has no width of its own.
    <Box
      data-spreadsheet-preview={name}
      my={2}
      width="100%"
      minWidth="min(560px, 90vw)"
    >
      <Suspense
        fallback={
          <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, m: 0 }}>
            Opening the spreadsheet…
          </Text>
        }
      >
        <SpreadsheetPreviewView data={data} name={name} maxHeight={maxHeight} />
      </Suspense>
    </Box>
  );
}

/**
 * A ```xlsx block of an answer (or one whose `# filename:` ends in .xlsx),
 * drawn as the workbook it carries, for the chat's `ChatCodeBlock` point.
 */
export function XlsxCodeBlock({
  language,
  code,
}: ChatCodeBlockProps): JSX.Element | null {
  const block = parseXlsxBlock(language, code);
  if (!block) {
    return null;
  }
  return <SpreadsheetPreview data={block.source} name={block.name} />;
}

export default SpreadsheetPreview;
