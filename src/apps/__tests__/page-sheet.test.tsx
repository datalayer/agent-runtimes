/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A spreadsheet filled in the page with frontend tools (the user, 18
 * November 2026: "add to the accountant the frontend tools to create
 * spreadsheets").
 *
 * - the tools are typed, and each checks what it is given in the page: a
 *   refusal is a sentence, and nothing is half written;
 * - a formula is computed by Datalayer Cells' engine and by nothing else;
 *   every other cell is a number, a text or a boolean;
 * - a read answers what is on screen, the person's own edits included;
 * - a sheet holds so many cells and tabs, and says so;
 * - the workbook is the conversation's: built again from the recorded calls
 *   of a restored conversation (the person's edits are not kept), emptied
 *   when the conversation starts over;
 * - the tab shown is exported by Cells' own CSV writer;
 * - a Battle's sheet arena is three of these tools.
 */

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCellsModel, type CellsModel } from '@datalayer/cells';
import { CellsChartsPlugin } from '@datalayer/cells/charts';
import {
  SHEET_ARENA_TOOL_NAMES,
  SHEET_LIMITS,
  SHEET_TOOL_NAMES,
  applySheetCall,
  columnWidth,
  formatCode,
  sheetArenaTools,
  sheetSays,
  sheetTools,
  tabNames,
} from '../pageTools/sheet';
import { sheetToolSpecs } from '../pageTools/sheetSchemas';
import { LoopChatExtras } from '../core';
import { PAGE_TOOL_RESULTS } from '../toolCards/toolResults';
import {
  PageSheetCard,
  PageSheetPlugin,
  sheetCallSays,
} from '../plugins/page-sheet';
import { PAGE_SHEET, pageSheetTools } from '../plugins/page-sheet/store';
import { csvFileName, sheetCsv } from '../plugins/page-sheet/SheetStage';
import type { ToolCallRenderContext } from '../../types/chat';

// The grid draws on a canvas a test's document does not have: the stage is
// stood in for by the workbook it was given.
vi.mock('../plugins/page-sheet/SheetStage', async () => {
  const actual = await vi.importActual<
    typeof import('../plugins/page-sheet/SheetStage')
  >('../plugins/page-sheet/SheetStage');
  return {
    ...actual,
    default: ({ model }: { model: CellsModel }) => (
      <div
        data-testid="sheet-stage"
        data-tab={model.sheet(model.selection.sheet).name}
      />
    ),
  };
});

type Tool = { name: string; handler?: (args: never) => Promise<unknown> };

const call = (tools: Tool[], name: string, args: Record<string, unknown>) => {
  const tool = tools.find(each => each.name === name);
  if (!tool?.handler) {
    throw new Error(`No tool ${name}`);
  }
  return tool.handler(args as never) as Promise<Record<string, unknown>>;
};

const workbook = () => {
  const model = createCellsModel({ plugins: [CellsChartsPlugin] });
  return { model, tools: sheetTools(() => model) };
};

/** The example roaster's open invoices, as the demo's Accountant would write them. */
const RECEIVABLES = {
  name: 'Aged receivables',
  columns: [
    { name: 'Invoice' },
    { name: 'Customer' },
    { name: 'Due', format: 'date' },
    { name: 'Amount', format: 'currency', currency: 'EUR' },
  ],
};
const ROWS = [
  ['INV/2026/0141', 'Café Aurora', '2026-09-11', 2480],
  ['INV/2026/0156', 'Lisbon Hotels Group', '2026-10-02', 6950],
  ['INV/2026/0163', 'Mercado Verde', '2026-10-19', 1215.5],
  ['INV/2026/0170', 'Café Aurora', '2026-11-02', 3100],
  ['INV/2026/0174', 'Padaria Sol', '2026-11-14', 840],
  ['Total', null, null, '=SUM(D2:D6)'],
];

let ids = 0;
const recorded = (
  toolName: string,
  args: Record<string, unknown>,
  result: unknown = { ok: true },
): string => {
  ids += 1;
  const toolCallId = `sheet-call-${ids}`;
  act(() => {
    PAGE_TOOL_RESULTS.record([
      {
        type: 'tool-call',
        status: 'complete',
        toolCallId,
        toolName,
        args,
        result,
      },
    ]);
  });
  return toolCallId;
};

const context = (
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  more: Partial<ToolCallRenderContext> = {},
): ToolCallRenderContext => ({
  toolCallId,
  toolName,
  name: toolName,
  args,
  status: 'complete',
  result: { ok: true },
  defaultUI: <span data-testid="default-row">row</span>,
  ...more,
});

afterEach(() => {
  cleanup();
  act(() => {
    PAGE_TOOL_RESULTS.clear();
    PAGE_SHEET.reset();
  });
});

describe('the sheet tools', () => {
  it('are eight, typed, described without the grid, each with a handler', () => {
    const { tools } = workbook();
    expect(tools.map(tool => tool.name)).toEqual([...SHEET_TOOL_NAMES]);
    expect(sheetToolSpecs().map(spec => spec.name)).toEqual([
      ...SHEET_TOOL_NAMES,
    ]);
    for (const tool of tools) {
      expect(tool.parameters).toMatchObject({ type: 'object' });
      expect(typeof tool.handler).toBe('function');
    }
    const create = tools.find(tool => tool.name === 'sheet_create')!;
    expect(create.parameters).toMatchObject({
      required: ['columns'],
      additionalProperties: false,
      properties: {
        columns: { items: { required: ['name'], additionalProperties: false } },
      },
    });
  });

  it('make a sheet with named columns: the header bold and kept in sight, each column in its format', async () => {
    const { model, tools } = workbook();
    const made = await call(tools, 'sheet_create', RECEIVABLES);
    expect(made).toMatchObject({
      ok: true,
      tab: 'Aged receivables',
      header: 'A1:D1',
      columns: ['A Invoice', 'B Customer', 'C Due', 'D Amount'],
      tabs: ['Aged receivables'],
    });
    const sheet = model.selection.sheet;
    expect(model.toRows({ top: 0, left: 0, bottom: 0, right: 3 })).toEqual([
      ['Invoice', 'Customer', 'Due', 'Amount'],
    ]);
    expect(model.style(sheet, 0, 0).bold).toBe(true);
    expect(model.sheet(sheet).frozen).toEqual({ rows: 1, cols: 0 });
    // Words get more room than figures.
    expect(columnWidth({ name: 'Customer' })).toBe(168);
    expect(
      columnWidth({ name: 'Amount', format: 'currency', currency: 'EUR' }),
    ).toBe(128);
    expect(columnWidth({ name: 'Due', format: 'date' })).toBe(104);
    expect(
      columnWidth({
        name: 'A very long header for a narrow figure',
        format: 'integer',
      }),
    ).toBe(240);
    // Nothing is written under the header yet: the sheet's used range is its header.
    expect(await call(tools, 'sheet_read_range', {})).toMatchObject({
      range: 'A1:D1',
    });
    // Each column's format lands on the rows written under it.
    await call(tools, 'sheet_write_range', { range: 'A2', values: ROWS });
    expect(model.style(sheet, 1, 3).format).toBe('#,##0.00 "EUR"');
    expect(model.style(sheet, 6, 3).format).toBe('#,##0.00 "EUR"');
    expect(model.style(sheet, 1, 3).align).toBe('right');
    expect(model.style(sheet, 1, 2).format).toBe('yyyy-mm-dd');
    expect(model.style(sheet, 1, 0).format).toBeUndefined();
    expect(model.style(sheet, 0, 3).format).toBeUndefined();
  });

  it('write rows, and Cells’ engine computes the total', async () => {
    const { model, tools } = workbook();
    await call(tools, 'sheet_create', RECEIVABLES);
    const wrote = await call(tools, 'sheet_write_range', {
      range: 'A2',
      values: ROWS,
    });
    expect(wrote).toEqual({ ok: true, range: 'A2:D7' });
    const sheet = model.selection.sheet;
    expect(model.value(sheet, 6, 3)).toBe(14585.5);
    expect(model.content(sheet, 6, 3)?.formula).toBe('SUM(D2:D6)');
    const read = await call(tools, 'sheet_read_range', { range: 'D6:D7' });
    expect(read).toMatchObject({
      range: 'D6:D7',
      values: [[840], [14585.5]],
      tabs: ['Aged receivables'],
    });
    expect(sheetSays(model)).toContain('D7 =SUM(D2:D6) → 14585.5');
  });

  it('keep a cell a value: markup is text, an error has its name, nothing is run', async () => {
    const { model, tools } = workbook();
    await call(tools, 'sheet_write_range', {
      range: 'A1',
      values: [
        ['<img src=x onerror=alert(1)>', '=1/0', '=NOSUCHFUNCTION(1)', true],
      ],
    });
    const sheet = model.selection.sheet;
    expect(model.value(sheet, 0, 0)).toBe('<img src=x onerror=alert(1)>');
    const read = (await call(tools, 'sheet_read_range', {})) as {
      values: unknown[][];
    };
    expect(read.values[0][0]).toBe('<img src=x onerror=alert(1)>');
    expect(String(read.values[0][1])).toMatch(/^#/);
    expect(String(read.values[0][2])).toMatch(/^#/);
    expect(read.values[0][3]).toBe(true);
  });

  it('read what is on screen, the person’s own edits included', async () => {
    const { model, tools } = workbook();
    await call(tools, 'sheet_create', RECEIVABLES);
    await call(tools, 'sheet_write_range', { range: 'A2', values: ROWS });
    // The person corrects an amount in the grid, and adds a note beside it.
    const sheet = model.selection.sheet;
    expect(
      model.dispatch({
        type: 'SET_CELLS',
        sheet,
        at: { row: 1, col: 3 },
        cells: [[2500, 'checked by me']],
      } as never).ok,
    ).toBe(true);
    const read = (await call(tools, 'sheet_read_range', {})) as {
      range: string;
      values: unknown[][];
    };
    expect(read.range).toBe('A1:E7');
    expect(read.values[1]).toEqual([
      'INV/2026/0141',
      'Café Aurora',
      '2026-09-11',
      2500,
      'checked by me',
    ]);
    // The total follows the person's figure: the agent reads 14,605.50, not what it wrote.
    expect(read.values[6][3]).toBe(14605.5);
    // A later write beside it leaves the person's cells as they are.
    await call(tools, 'sheet_write_range', {
      range: 'F2',
      values: [['over 60 days']],
    });
    expect(model.value(sheet, 1, 3)).toBe(2500);
    expect(model.value(sheet, 1, 4)).toBe('checked by me');
  });

  it('format by name, freeze, and work over several tabs', async () => {
    const { model, tools } = workbook();
    await call(tools, 'sheet_create', RECEIVABLES);
    await call(tools, 'sheet_write_range', { range: 'A2', values: ROWS });
    expect(
      await call(tools, 'sheet_format_range', { range: 'A7:D7', bold: true }),
    ).toEqual({ ok: true, range: 'A7:D7' });
    await call(tools, 'sheet_format_range', {
      range: 'E2:E6',
      format: 'percent',
      decimals: 0,
    });
    const first = model.selection.sheet;
    expect(model.style(first, 6, 0).bold).toBe(true);
    expect(model.style(first, 1, 4).format).toBe('0%');
    expect(await call(tools, 'sheet_freeze', { rows: 1, columns: 2 })).toEqual({
      ok: true,
      frozen: { rows: 1, columns: 2 },
    });
    expect(model.sheet(first).frozen).toEqual({ rows: 1, cols: 2 });

    // A second sheet on a workbook that holds one: a new tab, shown.
    const second = await call(tools, 'sheet_create', {
      name: 'Trial balance',
      columns: [
        { name: 'Account' },
        { name: 'Debit', format: 'number' },
        { name: 'Credit', format: 'number' },
      ],
    });
    expect(second).toMatchObject({
      tab: 'Trial balance',
      tabs: ['Aged receivables', 'Trial balance'],
    });
    expect(model.sheet(model.selection.sheet).name).toBe('Trial balance');
    await call(tools, 'sheet_write_range', {
      range: 'A2',
      values: [['Bank', 39320, null]],
    });
    // A tool names the tab it means without showing it.
    await call(tools, 'sheet_write_range', {
      range: 'F1',
      values: [['Note']],
      tab: 'aged receivables',
    });
    expect(model.value(first, 0, 5)).toBe('Note');
    expect(
      await call(tools, 'sheet_add_tab', { name: 'Unmatched payments' }),
    ).toMatchObject({ tab: 'Unmatched payments' });
    expect(
      await call(tools, 'sheet_show_tab', { name: 'Aged receivables' }),
    ).toMatchObject({ tab: 'Aged receivables' });
    expect(model.selection.sheet).toBe(first);
    expect(tabNames(model)).toEqual([
      'Aged receivables',
      'Trial balance',
      'Unmatched payments',
    ]);
  });

  it('name their formats, never take a code of the model’s own', () => {
    expect(formatCode({ format: 'number' })).toBe('#,##0.00');
    expect(formatCode({ format: 'integer' })).toBe('#,##0');
    expect(
      formatCode({ format: 'currency', currency: 'usd', decimals: 0 }),
    ).toBe('#,##0 "USD"');
    expect(formatCode({ format: 'percent' })).toBe('0.0%');
    expect(formatCode({ format: 'text' })).toBe('@');
    expect(formatCode({})).toBeUndefined();
    expect(() => formatCode({ format: 'currency' })).toThrow(/three letters/);
    expect(() =>
      formatCode({ format: 'currency', currency: '"];[Red]' }),
    ).toThrow(/three letters/);
    expect(() => formatCode({ format: '0.00;[Red]' as never })).toThrow(
      /A format is one of/,
    );
    expect(() => formatCode({ format: 'number', decimals: 9 })).toThrow(
      /0 to 6/,
    );
  });

  it('refuse in a sentence, and write nothing', async () => {
    const { model, tools } = workbook();
    const wide = [
      Array.from({ length: SHEET_LIMITS.columns + 1 }, (_, i) => i),
    ];
    const big = Array.from({ length: 51 }, () =>
      Array.from({ length: 40 }, () => 1),
    );
    const refusals: [string, Record<string, unknown>, RegExp][] = [
      ['sheet_create', { columns: [] }, /A sheet takes columns/],
      [
        'sheet_create',
        { columns: [{ name: 'Amount', format: 'currency' }] },
        /three letters/,
      ],
      [
        'sheet_create',
        { columns: [{ name: 'A', width: 3 }] },
        /Column 1 takes name, format, currency, decimals; not width/,
      ],
      [
        'sheet_create',
        { name: 'a/b', columns: [{ name: 'A' }] },
        /A tab’s name/,
      ],
      [
        'sheet_write_range',
        { range: 'A1', values: [] },
        /non-empty array of rows/,
      ],
      [
        'sheet_write_range',
        { range: 'A1', values: [[{ html: '<b>' }]] },
        /The cell A1 is a number, a text, a boolean or null/,
      ],
      [
        'sheet_write_range',
        { range: 'A1', values: [['x'.repeat(SHEET_LIMITS.text + 1)]] },
        /2000 at most/,
      ],
      ['sheet_write_range', { range: 'A1', values: wide }, /goes beyond/],
      [
        'sheet_write_range',
        { range: 'A1', values: big },
        /One write takes 2000 cells at most; this one has 2040/,
      ],
      [
        'sheet_write_range',
        { range: 'A1990', values: Array.from({ length: 20 }, () => [1]) },
        /reaches row 2000/,
      ],
      [
        'sheet_write_range',
        { range: 'A1', values: [[1]], tab: 'Nowhere' },
        /There is no tab named “Nowhere”; the tabs are Sheet1/,
      ],
      [
        'sheet_format_range',
        { range: 'A1', format: 'number', code: '0.00' },
        /not code/,
      ],
      ['sheet_format_range', { range: 'A1' }, /Name a format/],
      ['sheet_freeze', { rows: 50 }, /0 to 10/],
      ['sheet_show_tab', { name: 'Nowhere' }, /There is no tab named/],
    ];
    for (const [name, args, why] of refusals) {
      await expect(
        call(tools, name, args),
        `${name} ${JSON.stringify(args).slice(0, 60)}`,
      ).rejects.toThrow(why);
    }
    expect(await call(tools, 'sheet_read_range', {})).toMatchObject({
      empty: true,
    });
    expect(tabNames(model)).toEqual(['Sheet1']);
  });

  it('hold eight tabs, and twenty thousand cells a tab, and say so to the model', async () => {
    const { tools } = workbook();
    for (let i = 2; i <= SHEET_LIMITS.tabs; i += 1) {
      await call(tools, 'sheet_add_tab', { name: `Tab ${i}` });
    }
    await expect(
      call(tools, 'sheet_add_tab', { name: 'One more' }),
    ).rejects.toThrow(/holds 8 tabs at most/);
    // 40 columns by 501 rows is over twenty thousand cells of used range.
    await call(tools, 'sheet_write_range', {
      range: 'A1',
      values: [Array.from({ length: 40 }, () => 1)],
    });
    await expect(
      call(tools, 'sheet_write_range', { range: 'A501', values: [[1]] }),
    ).rejects.toThrow(
      /A tab holds 20000 cells at most \(its used range would be A1:AN501\)\. Summarise, or use another tab\./,
    );
  });

  it('are, for a Battle, three tools on the tab shown', async () => {
    const model = createCellsModel({ plugins: [CellsChartsPlugin] });
    const changed = vi.fn();
    const tools = sheetArenaTools(() => model, changed);
    expect(tools.map(tool => tool.name)).toEqual([...SHEET_ARENA_TOOL_NAMES]);
    const write = tools.find(tool => tool.name === 'sheet_write_range')!;
    expect(
      (write.parameters as { properties: Record<string, unknown> }).properties
        .tab,
    ).toBeUndefined();
    expect(write.description).toBe(
      'Write a block of values, row by row, from the top-left cell of a range such as `A1`. A text starting with = is a formula (=SUM(B2:B8)); numbers, booleans and null (an empty cell) are written as they are.',
    );
    await call(tools, 'sheet_write_range', {
      range: 'A1',
      values: [
        ['Month', 'Sales'],
        ['Jan', 10],
        ['Feb', 12],
      ],
    });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await call(tools, 'sheet_read_range', {})).toEqual({
      range: 'A1:B3',
      values: [
        ['Month', 'Sales'],
        ['Jan', 10],
        ['Feb', 12],
      ],
    });
    expect(
      await call(tools, 'sheet_insert_chart', {
        range: 'A1:B3',
        title: 'Sales',
      }),
    ).toEqual({ ok: true, range: 'A1:B3', type: 'column' });
  });
});

describe('the conversation’s workbook', () => {
  it('is the same filled by the tools and replayed from the calls', async () => {
    const { model, tools } = workbook();
    const replayed = createCellsModel({ plugins: [CellsChartsPlugin] });
    const calls: [string, Record<string, unknown>][] = [
      ['sheet_create', RECEIVABLES],
      ['sheet_write_range', { range: 'A2', values: ROWS }],
      ['sheet_format_range', { range: 'A7:D7', bold: true }],
    ];
    for (const [name, args] of calls) {
      await call(tools, name, args);
      await applySheetCall(replayed, name, args);
    }
    expect(sheetSays(replayed)).toBe(sheetSays(model));
    await expect(
      applySheetCall(replayed, 'sheet_delete_everything', {}),
    ).rejects.toThrow(/no sheet tool named/);
  });

  it('is made on the first call, read with the person’s edits, and exported by Cells’ CSV writer', async () => {
    const tools = pageSheetTools();
    expect(PAGE_SHEET.read()).toBeNull();
    await call(tools, 'sheet_create', RECEIVABLES);
    await call(tools, 'sheet_write_range', { range: 'A2', values: ROWS });
    const { model } = PAGE_SHEET.read()!;
    model.dispatch({
      type: 'SET_CELLS',
      sheet: model.selection.sheet,
      at: { row: 1, col: 3 },
      cells: [[2500]],
    } as never);
    const read = (await call(tools, 'sheet_read_range', {
      range: 'D2:D7',
    })) as { values: unknown[][] };
    expect(read.values).toEqual([
      [2500],
      [6950],
      [1215.5],
      [3100],
      [840],
      [14605.5],
    ]);
    const csv = sheetCsv(model).split('\r\n');
    expect(csv[0]).toBe('Invoice,Customer,Due,Amount');
    expect(csv[1]).toBe('INV/2026/0141,Café Aurora,2026-09-11,2500');
    expect(csv[6]).toBe('Total,,,14605.5');
    expect(csvFileName('Aged receivables')).toBe('aged-receivables.csv');
    expect(csvFileName(' / ')).toBe('sheet.csv');
  });

  it('is built again from the recorded calls of a restored conversation, without the person’s edits; emptied when it starts over', async () => {
    recorded('sheet_create', RECEIVABLES);
    recorded('sheet_write_range', { range: 'A2', values: ROWS });
    recorded(
      'sheet_write_range',
      { range: 'A1', values: [] },
      'The values are a non-empty array of rows.',
    );
    const tools = pageSheetTools();
    // The next call lands on the restored workbook.
    const read = (await call(tools, 'sheet_read_range', { range: 'D7' })) as {
      values: unknown[][];
    };
    expect(read.values).toEqual([[14585.5]]);
    expect(
      PAGE_SHEET.read()!.model.sheet(PAGE_SHEET.read()!.model.selection.sheet)
        .name,
    ).toBe('Aged receivables');
    act(() => PAGE_TOOL_RESULTS.clear());
    await act(() =>
      PAGE_SHEET.sync(PAGE_TOOL_RESULTS.callsOf(SHEET_TOOL_NAMES)),
    );
    expect(PAGE_SHEET.read()).toBeNull();
  });
});

describe('the page-sheet plugin', () => {
  it('hands the chat the sheet tools with its extras', () => {
    const contributes = (
      PageSheetPlugin as unknown as {
        contributes: { point: unknown; value: unknown }[];
      }
    ).contributes;
    const extras = contributes.find(entry => entry.point === LoopChatExtras);
    const tools = (
      extras?.value as { extras: { value: { frontendTools: Tool[] } } }
    ).extras.value.frontendTools;
    expect(tools.map(tool => tool.name)).toEqual([...SHEET_TOOL_NAMES]);
    expect((PageSheetPlugin as { name: string }).name).toBe(
      '@datalayer/loop-plugin-page-sheet',
    );
  });

  it('draws the workbook at the last call that changed it, and a line at each call before', async () => {
    const tools = pageSheetTools();
    await call(tools, 'sheet_create', RECEIVABLES);
    await call(tools, 'sheet_write_range', { range: 'A2', values: ROWS });
    const first = recorded('sheet_create', RECEIVABLES);
    const second = recorded('sheet_write_range', { range: 'A2', values: ROWS });
    const third = recorded(
      'sheet_read_range',
      {},
      { range: 'A1:D7', values: [] },
    );
    render(
      <ThemeProvider>
        <PageSheetCard context={context(first, 'sheet_create', RECEIVABLES)} />
        <PageSheetCard
          context={context(second, 'sheet_write_range', {
            range: 'A2',
            values: ROWS,
          })}
        />
        <PageSheetCard
          context={context(
            third,
            'sheet_read_range',
            {},
            { result: { range: 'A1:D7', values: [] } },
          )}
        />
      </ThemeProvider>,
    );
    expect(
      screen.getByText('Started the sheet “Aged receivables”, 4 columns'),
    ).toBeTruthy();
    expect(screen.getByText('Wrote 6 rows from A2')).toBeTruthy();
    // A read changes nothing: a line of its own, the sheet staying at the last write.
    expect(screen.getByText('Read the sheet')).toBeTruthy();
    expect(screen.queryByTestId('default-row')).toBeNull();
    const stages = await screen.findAllByTestId('sheet-stage');
    expect(stages).toHaveLength(1);
    expect(stages[0].getAttribute('data-tab')).toBe('Aged receivables');
  });

  it('says each call in a line', () => {
    expect(
      sheetCallSays('sheet_format_range', {
        range: 'D2:D7',
        format: 'currency',
        currency: 'eur',
        bold: true,
      }),
    ).toBe('Formatted D2:D7: currency, EUR, bold');
    expect(sheetCallSays('sheet_freeze', { rows: 1 })).toBe(
      'Froze 1 rows and 0 columns',
    );
    expect(sheetCallSays('sheet_add_tab', { name: 'Trial balance' })).toBe(
      'Added the tab “Trial balance”',
    );
    expect(
      sheetCallSays('sheet_read_range', {
        range: 'A1:B2',
        tab: 'Trial balance',
      }),
    ).toBe('Read A1:B2 on “Trial balance”');
    expect(sheetCallSays('sheet_insert_chart', { range: 'A1:B6' })).toBe(
      'Drew a column chart of A1:B6',
    );
  });
});
