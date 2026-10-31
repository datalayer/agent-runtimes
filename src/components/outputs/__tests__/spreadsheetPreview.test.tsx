/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's XLSX output (the `spreadsheet` output spec), read-only in
 * Cells wherever outputs are shown: a ```xlsx block in the chat is drawn as
 * its workbook, nothing can be typed into it, and Cells is loaded only when
 * one is drawn — the modules a chat mounts never import it.
 */

import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { createCellsModel, fromRows } from '@datalayer/cells';
import { writeXlsx } from '@datalayer/cells/xlsx';
import {
  ChatCodeBlock,
  codeBlockRenderer,
} from '../../../chat/messages/codeBlocks';
import { OUTPUT_CATALOG } from '../../../specs/outputs';
import { loopPlugins } from '../../../apps/presets';
import {
  AgentOutputsXlsxPlugin,
  AGENT_OUTPUTS_XLSX_PLUGIN_NAME,
} from '../../../apps/plugins/agent-outputs/xlsx';
import {
  SPREADSHEET_MEDIA_TYPE,
  parseXlsxBlock,
  xlsxBytes,
} from '../spreadsheetOutput';
import { XlsxCodeBlock } from '../SpreadsheetPreview';
import { readOnlyWorkbook } from '../SpreadsheetPreviewView';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A real XLSX, written by Cells: Month and Sales, with a total. */
function salesXlsx(): Uint8Array {
  const model = createCellsModel({
    data: fromRows(
      [
        ['Month', 'Sales'],
        ['Jan', 10],
        ['Feb', 12],
      ],
      'Sales',
    ),
  });
  return writeXlsx(model);
}

function base64Of(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

describe('the spreadsheet output and its blocks', () => {
  it('is the output spec’s XLSX', () => {
    expect(OUTPUT_CATALOG.spreadsheet.mime_types).toContain(
      SPREADSHEET_MEDIA_TYPE,
    );
  });

  it('reads a ```xlsx block, and a named .xlsx in another fence', () => {
    expect(parseXlsxBlock('xlsx', '# filename: q3.xlsx\nUEsDBA==\n')).toEqual({
      name: 'q3.xlsx',
      source: 'UEsDBA==',
    });
    expect(parseXlsxBlock('xlsx', 'UEsDBA==')?.name).toBe('output.xlsx');
    expect(parseXlsxBlock('text', '# filename: q3.xlsx\nUEsDBA==')?.name).toBe(
      'q3.xlsx',
    );
    expect(parseXlsxBlock('text', '# filename: q3.csv\na,b')).toBeNull();
    expect(parseXlsxBlock('python', 'print(1)')).toBeNull();
    expect(parseXlsxBlock('xlsx', '# filename: empty.xlsx\n')).toBeNull();
  });

  it('takes the bytes as an output carries them, and refuses the rest', async () => {
    const bytes = salesXlsx();
    const b64 = base64Of(bytes);
    expect(await xlsxBytes(bytes)).toBe(bytes);
    expect(await xlsxBytes(b64)).toEqual(bytes);
    // Wrapped, as a model writes a long line.
    expect(await xlsxBytes(b64.replace(/(.{76})/g, '$1\n'))).toEqual(bytes);
    expect(
      await xlsxBytes(`data:${SPREADSHEET_MEDIA_TYPE};base64,${b64}`),
    ).toEqual(bytes);
    await expect(xlsxBytes('not base64!')).rejects.toThrow(/not base64/);
    await expect(xlsxBytes(42)).rejects.toThrow(/no bytes/);
  });

  it('opens the workbook read-only', async () => {
    const { model } = await readOnlyWorkbook(base64Of(salesXlsx()));
    expect(model.readOnly).toBe(true);
    const sheet = model.sheets[0];
    expect(sheet.name).toBe('Sales');
    expect(model.value(sheet.id, 1, 1)).toBe(10);
    const result = model.dispatch({
      type: 'SET_CELLS',
      sheet: sheet.id,
      at: { row: 0, col: 0 },
      cells: [['typed']],
    } as never);
    expect(result.ok).toBe(false);
    expect(model.value(sheet.id, 0, 0)).toBe('Month');
  });
});

describe('in the chat', () => {
  let hadObserver = true;
  beforeEach(() => {
    // jsdom has no ResizeObserver, which the grid sizes itself with.
    hadObserver = 'ResizeObserver' in globalThis;
    if (!hadObserver) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
  });
  afterEach(() => {
    if (!hadObserver) {
      delete (globalThis as any).ResizeObserver;
    }
  });

  it('every Loop chat takes a ```xlsx block, by the preset', () => {
    expect(
      buildReactorFromPlugins(loopPlugins({})).hasPlugin(
        AGENT_OUTPUTS_XLSX_PLUGIN_NAME,
      ),
    ).toBe(true);
    const reactor = buildReactorFromPlugins([AgentOutputsXlsxPlugin]);
    reactor.start();
    const contributions = reactor.getContributions(ChatCodeBlock);
    const code = `# filename: sales.xlsx\n${base64Of(salesXlsx())}`;
    expect(
      codeBlockRenderer(contributions, { language: 'xlsx', code })?.id,
    ).toBe('cells-xlsx');
    expect(
      codeBlockRenderer(contributions, { language: 'text', code })?.id,
    ).toBe('cells-xlsx');
    expect(
      codeBlockRenderer(contributions, { language: 'text', code: 'hello' }),
    ).toBeUndefined();
  });

  it('draws the block as its workbook, read-only, once Cells has loaded', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const code = `# filename: sales.xlsx\n${base64Of(salesXlsx())}`;
    try {
      await act(async () => {
        root.render(<XlsxCodeBlock language="xlsx" code={code} />);
      });
      for (
        let tries = 0;
        tries < 50 && !host.querySelector('[role="grid"]');
        tries += 1
      ) {
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
        });
      }
      expect(
        host.querySelector('[data-spreadsheet-preview="sales.xlsx"]'),
      ).not.toBeNull();
      const grid = host.querySelector('[role="grid"]');
      expect(grid).not.toBeNull();
      expect(grid!.getAttribute('aria-label')).toBe('sales.xlsx, read-only');
      expect(host.textContent).toContain('Download sales.xlsx');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

describe('Cells loads only when a workbook is drawn', () => {
  const root = join(__dirname, '..', '..', '..');
  it.each([
    'components/outputs/spreadsheetOutput.ts',
    'components/outputs/SpreadsheetPreview.tsx',
    'components/outputs/index.ts',
    'apps/plugins/agent-outputs/xlsx.ts',
    'apps/plugins/spreadsheet/index.ts',
  ])('%s imports no Cells', file => {
    const source = readFileSync(join(root, file), 'utf8');
    expect(source).not.toMatch(/from '@datalayer\/cells/);
  });
});
