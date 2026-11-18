/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A spreadsheet an agent fills in the page (the user, 18 November 2026: "add
 * to the accountant the frontend tools to create spreadsheets").
 *
 * The tools work on a real Datalayer Cells model: each is one of the model's
 * own commands, so what the agent writes, what the person types in the grid
 * and what a read answers are one workbook. A formula is a text starting
 * with `=`, computed by Cells' engine and by nothing else; every other cell
 * is a number, a text or a boolean, drawn as such.
 *
 * It began as the sheet arena of Datalayer's Battles, which still plays on
 * it with three of these tools (`SHEET_ARENA_TOOL_NAMES`); the chat's
 * `page-sheet` plugin binds all of them to the conversation's workbook
 * (`apps/plugins/page-sheet`).
 *
 * Everything a tool takes is checked here, in the page, and refused in a
 * sentence the model can act on.
 *
 * @module apps/pageTools/sheet
 */

import {
  BUILTIN_CHART_TYPES,
  inferChartData,
  parseA1,
  parseZone,
  zoneToA1,
  type CellsModel,
  type CellValue,
  type Zone,
} from '@datalayer/cells';
import type { FrontendToolDefinition } from '../../types/tools';
import {
  SHEET_ALIGNS,
  SHEET_ARENA_TOOL_NAMES,
  SHEET_FORMATS,
  SHEET_LIMITS,
  sheetToolSpecs,
  type SheetFormat,
  type SheetToolName,
} from './sheetSchemas';

export * from './sheetSchemas';

export const SHEET_WORDS = {
  title: 'The sheet',
  empty: 'No cell written yet.',
} as const;

/** How many cells a read answers at most. */
export const SHEET_READ_CAP = 400;

type Refusable = { ok: boolean; refusals?: { message: string }[] };

const text = (value: unknown, what: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${what} is a non-empty text.`);
  }
  return value.trim();
};

const only = (
  args: Record<string, unknown>,
  allowed: readonly string[],
  what: string,
): void => {
  const unknown = Object.keys(args).filter(key => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      `${what} takes ${allowed.join(', ')}; not ${unknown.join(', ')}.`,
    );
  }
};

/** A cell as a tool writes it: a number, a text (a formula when it starts with `=`), a boolean, or empty. */
export const cellInput = (value: unknown): string | number | boolean | null =>
  value === null || value === undefined
    ? null
    : typeof value === 'number' || typeof value === 'boolean'
      ? value
      : String(value);

/** A cell checked: a finite number, a text of a cell's length, a boolean or empty; nothing nested. */
function checkedCell(
  value: unknown,
  at: string,
): string | number | boolean | null {
  if (value !== null && typeof value === 'object') {
    throw new Error(
      `The cell ${at} is a number, a text, a boolean or null; not a list or an object.`,
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`The cell ${at} is not a finite number.`);
  }
  const cell = cellInput(value);
  if (typeof cell === 'string' && cell.length > SHEET_LIMITS.text) {
    throw new Error(
      `The cell ${at} holds ${cell.length} characters; ${SHEET_LIMITS.text} at most.`,
    );
  }
  return cell;
}

/** A cell as the model takes it: a text starting with `=` its formula, anything else its value. */
export const formulaOrValue = (
  cell: string | number | boolean | null,
): string | number | boolean | null | { formula: string } =>
  typeof cell === 'string' && cell.startsWith('=') && cell.length > 1
    ? { formula: cell.slice(1) }
    : cell;

type ColumnStyle = { format: string; align?: 'right' } | undefined;

/** The format of each column of a sheet made with named columns, by workbook and tab. */
const COLUMN_FORMATS = new WeakMap<CellsModel, Map<string, ColumnStyle[]>>();

/** A cell as a tool reads it: an error as its name. */
export const cellOutput = (
  value: CellValue,
): string | number | boolean | null =>
  value !== null && typeof value === 'object'
    ? `#${String((value as { error: string }).error).replace(/^#/, '')}`
    : value;

/** The used range of a sheet, from A1; none when nothing is written. */
export function usedZone(model: CellsModel, sheet: string): Zone | null {
  const cells = model.sheet(sheet).cells;
  let right = -1;
  let bottom = -1;
  for (const col of cells.columnIndexes()) {
    const last = cells.lastRowIn(col);
    if (last < 0) {
      continue;
    }
    right = Math.max(right, col);
    bottom = Math.max(bottom, last);
  }
  return right < 0 ? null : { top: 0, left: 0, bottom, right };
}

const refused = (result: Refusable): void => {
  if (!result.ok) {
    throw new Error(
      (result.refusals ?? []).map(refusal => refusal.message).join(' ') ||
        'The sheet refused it.',
    );
  }
};

const run = (model: CellsModel, command: unknown): void =>
  refused(model.dispatch(command as never) as Refusable);

/** A column's letters, from 0: A, B, … Z, AA. */
export const columnName = (col: number): string =>
  col < 26
    ? String.fromCharCode(65 + col)
    : columnName(Math.floor(col / 26) - 1) +
      String.fromCharCode(65 + (col % 26));

/** The tab a tool means: the one named, else the one shown. */
export function tabOf(model: CellsModel, name?: unknown): string {
  if (name === undefined || name === null || name === '') {
    return model.selection.sheet;
  }
  const wanted = text(name, 'The tab');
  const found = model.sheets.find(
    sheet => sheet.name.toLowerCase() === wanted.toLowerCase(),
  );
  if (!found) {
    throw new Error(
      `There is no tab named “${wanted}”; the tabs are ${tabNames(model).join(', ')}.`,
    );
  }
  return found.id;
}

/** The tabs' names, in order. */
export const tabNames = (model: CellsModel): string[] =>
  model.sheets.map(sheet => sheet.name);

/** Show a tab: what the person sees, and what a tool without `tab` works on. */
export function showTab(model: CellsModel, sheet: string): void {
  if (model.selection.sheet === sheet) {
    return;
  }
  const at = { row: 0, col: 0 };
  model.select({
    sheet,
    zones: [{ top: 0, left: 0, bottom: 0, right: 0 }],
    anchor: at,
    active: at,
  });
}

/** A zone within what a sheet holds here; refused in a sentence beyond it. */
function within(zone: Zone): Zone {
  if (zone.bottom >= SHEET_LIMITS.rows || zone.right >= SHEET_LIMITS.columns) {
    throw new Error(
      `A sheet here reaches row ${SHEET_LIMITS.rows} and column ${columnName(SHEET_LIMITS.columns - 1)}; ${zoneToA1(zone)} goes beyond. Summarise, or split it over tabs.`,
    );
  }
  return zone;
}

/** Write a block of rows from a top-left cell; the range written back. */
export function writeRange(
  model: CellsModel,
  range: string,
  values: unknown[][],
  tab?: unknown,
): string {
  const at = parseZone(text(range, 'The range'));
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    !values.every(row => Array.isArray(row))
  ) {
    throw new Error(
      'The values are a non-empty array of rows, each an array of cells.',
    );
  }
  const width = Math.max(...values.map(row => row.length));
  if (width === 0) {
    throw new Error('Each row holds one cell at least.');
  }
  const count = values.reduce((sum, row) => sum + row.length, 0);
  if (count > SHEET_LIMITS.write) {
    throw new Error(
      `One write takes ${SHEET_LIMITS.write} cells at most; this one has ${count}. Write it in several blocks.`,
    );
  }
  const written = within({
    top: at.top,
    left: at.left,
    bottom: at.top + values.length - 1,
    right: at.left + width - 1,
  });
  const cells = values.map((row, r) =>
    row.map((value, c) =>
      checkedCell(value, `${columnName(at.left + c)}${at.top + r + 1}`),
    ),
  );
  const sheet = tabOf(model, tab);
  const used = usedZone(model, sheet);
  const bottom = Math.max(used?.bottom ?? 0, written.bottom);
  const right = Math.max(used?.right ?? 0, written.right);
  if ((bottom + 1) * (right + 1) > SHEET_LIMITS.cells) {
    throw new Error(
      `A tab holds ${SHEET_LIMITS.cells} cells at most (its used range would be ${zoneToA1({ top: 0, left: 0, bottom, right })}). Summarise, or use another tab.`,
    );
  }
  run(model, {
    type: 'SET_CELLS',
    sheet,
    at: { row: at.top, col: at.left },
    // A text starting with = is a formula, as typing it into the grid makes one.
    cells: cells.map(row => row.map(formulaOrValue)),
  });
  // The columns' own formats, on the rows just written under the header.
  const formats = COLUMN_FORMATS.get(model)?.get(sheet) ?? [];
  formats.forEach((style, col) => {
    const top = Math.max(1, written.top);
    if (
      style &&
      col >= written.left &&
      col <= written.right &&
      top <= written.bottom
    ) {
      run(model, {
        type: 'SET_STYLE',
        sheet,
        zone: { top, left: col, bottom: written.bottom, right: col },
        style,
      });
    }
  });
  return zoneToA1(written);
}

/** The values of a range, row by row; the whole used range when none is named. */
export function readRange(
  model: CellsModel,
  range?: string,
  tab?: unknown,
):
  | {
      range: string;
      values: (string | number | boolean | null)[][];
      more?: string;
    }
  | { empty: true } {
  const sheet = tabOf(model, tab);
  const zone = range
    ? parseZone(text(range, 'The range'))
    : usedZone(model, sheet);
  if (!zone) {
    return { empty: true };
  }
  const width = zone.right - zone.left + 1;
  const rows = Math.max(
    1,
    Math.min(zone.bottom - zone.top + 1, Math.floor(SHEET_READ_CAP / width)),
  );
  const read: Zone = { ...zone, bottom: zone.top + rows - 1 };
  return {
    range: zoneToA1(read),
    values: model.toRows(read, sheet).map(row => row.map(cellOutput)),
    ...(read.bottom < zone.bottom
      ? {
          more: `${zone.bottom - read.bottom} more rows, down to row ${zone.bottom + 1}: read them by range.`,
        }
      : {}),
  };
}

/** How many cells hold a value: what has been done so far. */
export function cellsWritten(model: CellsModel): number {
  const zone = usedZone(model, model.selection.sheet);
  if (!zone) {
    return 0;
  }
  return model
    .toRows(zone)
    .flat()
    .filter(value => value !== null && value !== '').length;
}

// ---- Formats -------------------------------------------------------------

export type SheetFormatArgs = {
  format?: SheetFormat;
  /** A currency's three letters, with `currency`: EUR, USD. */
  currency?: string;
  /** The decimals shown, 0 to 6. */
  decimals?: number;
  bold?: boolean;
  align?: (typeof SHEET_ALIGNS)[number];
};

const zeros = (decimals: number): string =>
  decimals > 0 ? `.${'0'.repeat(decimals)}` : '';

/** The Excel format code of a named format. */
export function formatCode(args: SheetFormatArgs): string | undefined {
  const { format } = args;
  if (format === undefined) {
    return undefined;
  }
  if (!SHEET_FORMATS.includes(format)) {
    throw new Error(`A format is one of ${SHEET_FORMATS.join(', ')}.`);
  }
  let decimals: number | undefined;
  if (args.decimals !== undefined && args.decimals !== null) {
    if (
      !Number.isInteger(args.decimals) ||
      args.decimals < 0 ||
      args.decimals > 6
    ) {
      throw new Error('The decimals are a whole number from 0 to 6.');
    }
    decimals = args.decimals;
  }
  switch (format) {
    case 'number':
      return `#,##0${zeros(decimals ?? 2)}`;
    case 'integer':
      return '#,##0';
    case 'currency': {
      const code = String(args.currency ?? '')
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{3}$/.test(code)) {
        throw new Error(
          'A currency format names its currency in three letters, such as EUR or USD.',
        );
      }
      return `#,##0${zeros(decimals ?? 2)} "${code}"`;
    }
    case 'percent':
      return `0${zeros(decimals ?? 1)}%`;
    case 'date':
      return 'yyyy-mm-dd';
    default:
      return '@';
  }
}

/** Format a range: a named number format, bold, an alignment. */
export function formatRange(
  model: CellsModel,
  range: string,
  args: SheetFormatArgs,
  tab?: unknown,
): string {
  const zone = within(parseZone(text(range, 'The range')));
  const code = formatCode(args);
  if (args.bold !== undefined && typeof args.bold !== 'boolean') {
    throw new Error('Bold is true or false.');
  }
  if (args.align !== undefined && !SHEET_ALIGNS.includes(args.align)) {
    throw new Error(`An alignment is one of ${SHEET_ALIGNS.join(', ')}.`);
  }
  const style = {
    ...(code ? { format: code } : {}),
    ...(args.bold !== undefined ? { bold: args.bold } : {}),
    ...(args.align ? { align: args.align } : {}),
  };
  if (Object.keys(style).length === 0) {
    throw new Error(
      `Name a format (${SHEET_FORMATS.join(', ')}), bold, or an align.`,
    );
  }
  run(model, { type: 'SET_STYLE', sheet: tabOf(model, tab), zone, style });
  return zoneToA1(zone);
}

/** Keep the first rows and columns in sight while the rest scrolls. */
export function freezePanes(
  model: CellsModel,
  rows: unknown,
  columns: unknown,
  tab?: unknown,
): { rows: number; columns: number } {
  const count = (value: unknown, what: string): number => {
    if (value === undefined || value === null) {
      return 0;
    }
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > 10
    ) {
      throw new Error(`${what} frozen are a whole number from 0 to 10.`);
    }
    return value;
  };
  const frozen = {
    rows: count(rows, 'The rows'),
    columns: count(columns, 'The columns'),
  };
  run(model, {
    type: 'FREEZE',
    sheet: tabOf(model, tab),
    rows: frozen.rows,
    cols: frozen.columns,
  });
  return frozen;
}

const tabName = (value: unknown): string => {
  const name = text(value, 'The tab’s name');
  if (name.length > SHEET_LIMITS.name || /[\\/?*[\]:]/.test(name)) {
    throw new Error(
      `A tab’s name is ${SHEET_LIMITS.name} characters at most, without \\ / ? * [ ] or :.`,
    );
  }
  return name;
};

/** Add a tab and show it. */
export function addTab(model: CellsModel, name: unknown): string {
  const wanted = tabName(name);
  if (model.sheets.length >= SHEET_LIMITS.tabs) {
    throw new Error(
      `A workbook here holds ${SHEET_LIMITS.tabs} tabs at most, and has them: ${tabNames(model).join(', ')}.`,
    );
  }
  run(model, { type: 'ADD_SHEET', name: wanted });
  const added = tabOf(model, wanted);
  showTab(model, added);
  return wanted;
}

export type SheetColumnArgs = {
  name: string;
  format?: SheetFormat;
  currency?: string;
  decimals?: number;
};

/** A column's width in pixels, from what it holds and how long its header is. */
export function columnWidth(column: SheetColumnArgs): number {
  const header = column.name.length * 8 + 28;
  const body =
    column.format === undefined || column.format === 'text'
      ? 168
      : column.format === 'currency'
        ? 128
        : 104;
  return Math.min(240, Math.max(header, body));
}

/**
 * A sheet with named columns: the tab shown when it is still empty (given
 * the name), a new tab otherwise; the header row written bold and kept in
 * sight, each column's format set down the rows it may fill.
 */
export function createSheet(
  model: CellsModel,
  args: { name?: unknown; columns?: unknown; freeze_header?: unknown },
): { tab: string; header: string; columns: string[] } {
  only(
    args as Record<string, unknown>,
    ['name', 'columns', 'freeze_header'],
    'A new sheet',
  );
  const { columns } = args;
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error(
      'A sheet takes columns: each a name, and a format if its cells are numbers.',
    );
  }
  if (columns.length > SHEET_LIMITS.columns) {
    throw new Error(
      `A sheet takes ${SHEET_LIMITS.columns} columns at most; this one has ${columns.length}.`,
    );
  }
  const read = columns.map((each, index): SheetColumnArgs => {
    const column = (
      typeof each === 'string' ? { name: each } : (each ?? {})
    ) as Record<string, unknown>;
    only(
      column,
      ['name', 'format', 'currency', 'decimals'],
      `Column ${index + 1}`,
    );
    const checked: SheetColumnArgs = {
      ...(column as SheetColumnArgs),
      name: text(column.name, `Column ${index + 1}'s name`),
    };
    // Refused before anything is written, so that a wrong column leaves no half sheet.
    formatCode(checked);
    return checked;
  });
  const name =
    args.name === undefined || args.name === null || args.name === ''
      ? undefined
      : tabName(args.name);
  let sheet = model.selection.sheet;
  if (usedZone(model, sheet)) {
    addTab(model, name ?? `Sheet ${model.sheets.length + 1}`);
    sheet = model.selection.sheet;
  } else if (name && model.sheet(sheet).name !== name) {
    run(model, { type: 'RENAME_SHEET', sheet, name });
  }
  const right = read.length - 1;
  run(model, {
    type: 'SET_CELLS',
    sheet,
    at: { row: 0, col: 0 },
    cells: [read.map(column => column.name)],
  });
  run(model, {
    type: 'SET_STYLE',
    sheet,
    zone: { top: 0, left: 0, bottom: 0, right },
    style: { bold: true },
  });
  // Each column's format, set on its cells as rows are written under the header.
  const kept = COLUMN_FORMATS.get(model) ?? new Map<string, ColumnStyle[]>();
  kept.set(
    sheet,
    read.map(column => {
      const code = formatCode(column);
      return code
        ? {
            format: code,
            ...(column.format === 'text' ? {} : { align: 'right' as const }),
          }
        : undefined;
    }),
  );
  COLUMN_FORMATS.set(model, kept);
  // Room for what a column holds: words want more than a figure does.
  read.forEach((column, col) => {
    run(model, {
      type: 'RESIZE_AXIS',
      sheet,
      axis: 'cols',
      from: col,
      to: col,
      size: columnWidth(column),
    });
  });
  if (args.freeze_header !== false) {
    run(model, { type: 'FREEZE', sheet, rows: 1, cols: 0 });
  }
  return {
    tab: model.sheet(sheet).name,
    header: zoneToA1({ top: 0, left: 0, bottom: 0, right }),
    columns: read.map((column, col) => `${columnName(col)} ${column.name}`),
  };
}

/**
 * A chart of a range, as the Cells plugin inserts one: its data inferred by
 * Cells itself (`inferChartData`: the first row the names, the first
 * column the categories, the series by columns), drawn under the data.
 */
export function insertChart(
  model: CellsModel,
  range: string,
  type = 'column',
  title?: string,
): { ok: true; range: string; type: string } {
  const zone = parseZone(text(range, 'The range'));
  if (!(BUILTIN_CHART_TYPES as readonly string[]).includes(type)) {
    throw new Error(
      `'${type}' is not a chart type; there are ${BUILTIN_CHART_TYPES.join(', ')}.`,
    );
  }
  const sheet = model.selection.sheet;
  const inferred = inferChartData(
    (row, col) => model.value(sheet, row, col),
    model.sheet(sheet).name,
    zone,
    (row, col) => /[dmy]/i.test(model.style(sheet, row, col).format ?? ''),
  );
  if (!inferred.ok) {
    throw new Error(inferred.message);
  }
  const from = parseA1(
    zoneToA1({
      top: zone.bottom + 2,
      left: zone.left,
      bottom: zone.bottom + 2,
      right: zone.left,
    }).split(':')[0],
  );
  const chart = {
    type,
    anchor: {
      kind: 'cells' as const,
      from: { row: from.row, col: from.col, dx: 0, dy: 0 },
      to: { row: from.row + 12, col: from.col + 6, dx: 0, dy: 0 },
    },
    data: inferred.data,
    legend: 'bottom' as const,
    ...(title ? { title } : {}),
  };
  run(model, { type: 'INSERT_CHART', sheet, chart });
  return { ok: true, range: zoneToA1(zone), type };
}

/** How many rows of the sheet are said at most. */
export const SHEET_SAYS_ROWS = 40;

/**
 * The sheet shown in words: each written cell by its address — a formula as
 * typed and what it computes — row by row, then each chart, its type, title
 * and series.
 */
export function sheetSays(model: CellsModel): string {
  const sheet = model.selection.sheet;
  const zone = usedZone(model, sheet);
  const lines: string[] = [];
  if (!zone) {
    lines.push(SHEET_WORDS.empty);
  } else {
    const bottom = Math.min(zone.bottom, zone.top + SHEET_SAYS_ROWS - 1);
    for (let row = zone.top; row <= bottom; row++) {
      const cells: string[] = [];
      for (let col = zone.left; col <= zone.right; col++) {
        const content = model.content(sheet, row, col);
        if (
          !content ||
          ((content.value === null || content.value === '') && !content.formula)
        ) {
          continue;
        }
        const at = `${columnName(col)}${row + 1}`;
        cells.push(
          content.formula
            ? `${at} =${content.formula} → ${String(cellOutput(model.value(sheet, row, col)))}`
            : `${at} ${String(cellOutput(content.value))}`,
        );
      }
      if (cells.length) {
        lines.push(cells.join(' | '));
      }
    }
    if (zone.bottom > bottom) {
      lines.push(`… ${zone.bottom - bottom} more rows.`);
    }
  }
  const charts = [...model.sheet(sheet).charts.values()];
  for (const chart of charts) {
    let series: string;
    try {
      series = model
        .chartData(sheet, chart.id)
        .series.map(
          one =>
            `${one.name}: ${one.values.map(value => (value === null ? '—' : String(value))).join(', ')}`,
        )
        .join('; ');
    } catch {
      series = '(its data not read)';
    }
    lines.push(
      `Chart: ${chart.type}${chart.title ? ` “${chart.title}”` : ''}; ${series}.`,
    );
  }
  if (charts.length === 0) {
    lines.push('No chart.');
  }
  return lines.join('\n');
}

// ---- The tools -----------------------------------------------------------

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

/** What each tool does to a workbook. */
function sheetHandlers(
  model: () => CellsModel,
  changed: () => void,
  tabs: boolean,
): Record<SheetToolName, Handler> {
  return {
    sheet_create: async (args: Record<string, unknown>) => {
      const made = createSheet(model(), args);
      changed();
      return { ok: true, ...made, tabs: tabNames(model()) };
    },
    sheet_write_range: async (args: Record<string, unknown>) => {
      const { range: at, values } = args as {
        range: string;
        values: unknown[][];
      };
      const range = writeRange(
        model(),
        at,
        values,
        tabs ? args.tab : undefined,
      );
      changed();
      return { ok: true, range };
    },
    sheet_read_range: async (args: Record<string, unknown>) => {
      const read = readRange(
        model(),
        (args as { range?: string }).range,
        tabs ? args.tab : undefined,
      );
      return tabs ? { ...read, tabs: tabNames(model()) } : read;
    },
    sheet_format_range: async (args: Record<string, unknown>) => {
      only(
        args,
        ['range', 'format', 'currency', 'decimals', 'bold', 'align', 'tab'],
        'A format',
      );
      const {
        range,
        tab: named,
        ...format
      } = args as { range: string; tab?: string } & SheetFormatArgs;
      const formatted = formatRange(model(), range, format, named);
      changed();
      return { ok: true, range: formatted };
    },
    sheet_freeze: async (args: Record<string, unknown>) => {
      only(args, ['rows', 'columns', 'tab'], 'A freeze');
      const frozen = freezePanes(model(), args.rows, args.columns, args.tab);
      changed();
      return { ok: true, frozen };
    },
    sheet_add_tab: async (args: Record<string, unknown>) => {
      only(args, ['name'], 'A new tab');
      const added = addTab(model(), args.name);
      changed();
      return { ok: true, tab: added, tabs: tabNames(model()) };
    },
    sheet_show_tab: async (args: Record<string, unknown>) => {
      only(args, ['name'], 'Showing a tab');
      const workbook = model();
      showTab(workbook, tabOf(workbook, text(args.name, 'The tab’s name')));
      changed();
      return {
        ok: true,
        tab: workbook.sheet(workbook.selection.sheet).name,
        tabs: tabNames(workbook),
      };
    },
    sheet_insert_chart: async (args: Record<string, unknown>) => {
      const { range, type, title } = args as {
        range: string;
        type?: string;
        title?: string;
      };
      const result = insertChart(model(), range, type, title);
      changed();
      return result;
    },
  };
}

/**
 * The sheet's tools, bound to one workbook. `tabs` adds what a chat's sheet
 * has over a Battle's: the tab a tool works on, by name.
 */
export function sheetTools(
  model: () => CellsModel,
  onChange?: () => void,
  options: { tabs?: boolean } = {},
): FrontendToolDefinition[] {
  const tabs = options.tabs ?? true;
  const handlers = sheetHandlers(model, () => onChange?.(), tabs);
  return sheetToolSpecs(tabs).map(spec => ({
    ...spec,
    handler: handlers[spec.name as SheetToolName],
  }));
}

/** One call applied to a workbook: what a tool's handler does, by its name. */
export async function applySheetCall(
  model: CellsModel,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const handler = sheetHandlers(
    () => model,
    () => undefined,
    true,
  )[name as SheetToolName];
  if (!handler) {
    throw new Error(`There is no sheet tool named ${name}.`);
  }
  return handler(args);
}

/** The sheet arena's three tools, bound to one contestant's workbook. */
export function sheetArenaTools(
  model: () => CellsModel,
  onChange?: () => void,
): FrontendToolDefinition[] {
  return sheetTools(model, onChange, { tabs: false }).filter(tool =>
    (SHEET_ARENA_TOOL_NAMES as readonly string[]).includes(tool.name),
  );
}
