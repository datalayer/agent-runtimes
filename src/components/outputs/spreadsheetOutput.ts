/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's spreadsheet output, as bytes: the `spreadsheet` output spec's
 * XLSX, wherever it arrives from.
 *
 * Pure, and free of Cells: what decides whether something is a workbook and
 * reads its bytes is here, so a page that never shows one loads nothing
 * more. Drawing it is `SpreadsheetPreview`'s, which loads Cells when a
 * workbook is drawn.
 *
 * @module components/outputs/spreadsheetOutput
 */

import { OUTPUT_CATALOG } from '../../specs/outputs';

/** The XLSX media type, as the `spreadsheet` output spec says it. */
export const SPREADSHEET_MEDIA_TYPE: string =
  OUTPUT_CATALOG.spreadsheet.mime_types[0];

/** The fence languages an XLSX is written in, in an answer. */
export const XLSX_LANGUAGES = ['xlsx', 'excel'];

/** An XLSX block of an answer: its file name and where its bytes are. */
export type XlsxBlock = {
  name: string;
  /**
   * The bytes: base64, a `data:` URL, or an `http(s)` URL to read them
   * from. Read by {@link xlsxBytes}.
   */
  source: string;
};

const FILENAME = /^#\s*filename:\s*([\w. -]+?)\s*(?:\n|$)/i;

/**
 * The XLSX a fenced block holds, by its language or by a `# filename:`
 * first line ending in .xlsx; `null` for another block.
 */
export function parseXlsxBlock(
  language: string,
  code: string,
): XlsxBlock | null {
  const text = code.replace(/^\s*\n/, '');
  const named = FILENAME.exec(text)?.[1];
  const byName = named !== undefined && /\.xlsx$/i.test(named);
  if (!XLSX_LANGUAGES.includes(language) && !byName) {
    return null;
  }
  const source = (named ? text.replace(FILENAME, '') : text).trim();
  if (source === '') {
    return null;
  }
  return { name: named ?? 'output.xlsx', source };
}

/** Bytes from base64, spaces and line breaks ignored; refused when it is not base64. */
export function base64Bytes(text: string): Uint8Array {
  const compact = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) {
    throw new Error('The spreadsheet is not base64.');
  }
  const binary = atob(compact.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * The bytes of an XLSX output, as an output may carry them: bytes, an
 * `ArrayBuffer`, base64, a `data:` URL, or an `http(s)` URL (fetched).
 * Anything else is refused in a sentence.
 */
export async function xlsxBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof data !== 'string') {
    throw new Error('The spreadsheet has no bytes to read.');
  }
  const text = data.trim();
  if (text.startsWith('data:')) {
    const comma = text.indexOf(',');
    if (comma < 0 || !text.slice(0, comma).endsWith(';base64')) {
      throw new Error('The spreadsheet’s data URL is not base64.');
    }
    return base64Bytes(text.slice(comma + 1));
  }
  if (/^https?:\/\//i.test(text)) {
    const response = await fetch(text);
    if (!response.ok) {
      throw new Error(
        `The spreadsheet could not be read: ${response.status} ${response.statusText}`.trim(),
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return base64Bytes(text);
}

/** Save an XLSX output as its file. */
export function downloadXlsx(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], {
      type: SPREADSHEET_MEDIA_TYPE,
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
