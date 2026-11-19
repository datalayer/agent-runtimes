/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sheet tools as a model reads them: names, descriptions, typed
 * parameters and limits, without Datalayer Cells. The chat hands these to
 * the agent at once and loads the grid only when one is called
 * (`apps/plugins/page-sheet`); `./sheet` binds them to a workbook.
 *
 * @module apps/pageTools/sheetSchemas
 */

import type { FrontendToolDefinition } from '../../types/tools';

/** How much a sheet holds: said to the model when it asks for more. */
export const SHEET_LIMITS = {
  /** Cells in one write. */
  write: 2000,
  /** Rows and columns a tab reaches. */
  rows: 2000,
  columns: 52,
  /** Cells of a tab's used range. */
  cells: 20000,
  tabs: 8,
  /** Characters in one cell. */
  text: 2000,
  name: 31,
} as const;

/** The formats a range takes, by name: never a format code of the model's own. */
export const SHEET_FORMATS = [
  'number',
  'integer',
  'currency',
  'percent',
  'date',
  'text',
] as const;

export type SheetFormat = (typeof SHEET_FORMATS)[number];

export const SHEET_ALIGNS = ['left', 'center', 'right'] as const;

/** The three tools a Battle's sheet arena plays with. */
export const SHEET_ARENA_TOOL_NAMES = [
  'sheet_write_range',
  'sheet_read_range',
  'sheet_insert_chart',
] as const;

/** Every sheet tool, in the order an agent would call them. */
export const SHEET_TOOL_NAMES = [
  'sheet_create',
  'sheet_write_range',
  'sheet_read_range',
  'sheet_format_range',
  'sheet_freeze',
  'sheet_add_tab',
  'sheet_show_tab',
  'sheet_insert_chart',
] as const;

export type SheetToolName = (typeof SHEET_TOOL_NAMES)[number];

/** The tools that change the workbook: what a restored conversation replays. */
export const SHEET_WRITE_TOOL_NAMES: readonly SheetToolName[] =
  SHEET_TOOL_NAMES.filter(name => name !== 'sheet_read_range');

const CELL = { type: ['number', 'string', 'boolean', 'null'] };

const TAB = {
  type: 'string',
  description: 'The tab’s name; the tab shown when left out.',
};

const COLUMN_FORMAT = {
  format: { type: 'string', enum: [...SHEET_FORMATS] },
  currency: {
    type: 'string',
    pattern: '^[A-Za-z]{3}$',
    description: 'With the currency format: its three letters, such as EUR.',
  },
  decimals: { type: 'integer', minimum: 0, maximum: 6 },
};

export type SheetToolSpec = Omit<FrontendToolDefinition, 'handler'>;

/**
 * The sheet's tools, described. `tabs` adds what a chat's sheet has over a
 * Battle's: the tab a tool works on, by name.
 */
export function sheetToolSpecs(tabs = true): SheetToolSpec[] {
  const tab = tabs ? { tab: TAB } : {};
  return [
    {
      name: 'sheet_create',
      description: `Start a sheet in the page with named columns: the person sees it at once. The header row is written in bold in row 1 and kept in sight; a column with a format (${SHEET_FORMATS.join(', ')}) shows its numbers that way. The tab shown takes the name while it is empty; otherwise a new tab is added. Then write the rows from A2 with sheet_write_range.`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            maxLength: SHEET_LIMITS.name,
            description: 'The tab’s name, such as “Aged receivables”.',
          },
          columns: {
            type: 'array',
            minItems: 1,
            maxItems: SHEET_LIMITS.columns,
            description: 'The columns, in order.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'The column’s header.' },
                ...COLUMN_FORMAT,
              },
              required: ['name'],
              additionalProperties: false,
            },
          },
          freeze_header: {
            type: 'boolean',
            description: 'Keep the header row in sight; true by default.',
          },
        },
        required: ['columns'],
        additionalProperties: false,
      },
    },
    {
      name: 'sheet_write_range',
      description: `Write a block of values, row by row, from the top-left cell of a range such as \`A1\`. A text starting with = is a formula (=SUM(B2:B8)); numbers, booleans and null (an empty cell) are written as they are.${tabs ? ` Write amounts as numbers, never as text, and totals as formulas. ${SHEET_LIMITS.write} cells a write at most.` : ''}`,
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description:
              'Where the block starts: its top-left cell, such as `A1`.',
          },
          values: {
            type: 'array',
            description: 'The rows to write, each an array of cells.',
            items: { type: 'array', items: CELL },
          },
          ...tab,
        },
        required: ['range', 'values'],
      },
    },
    {
      name: 'sheet_read_range',
      description: `The values of a range of the sheet, row by row; without a range, everything written from A1.${tabs ? ' It answers what is on screen, the person’s own edits included: read before you write over cells the person may have changed.' : ''}`,
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: 'A range such as `A1:D8`, or one cell.',
          },
          ...tab,
        },
      },
    },
    {
      name: 'sheet_format_range',
      description: `Format a range: how its numbers show (${SHEET_FORMATS.join(', ')}; currency with its three letters), bold, an alignment. Name one at least.`,
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description: 'A range such as `B2:B40`, or one cell.',
          },
          ...COLUMN_FORMAT,
          bold: { type: 'boolean' },
          align: { type: 'string', enum: [...SHEET_ALIGNS] },
          ...tab,
        },
        required: ['range'],
        additionalProperties: false,
      },
    },
    {
      name: 'sheet_freeze',
      description:
        'Keep the first rows and columns of a tab in sight while the rest scrolls: rows 1 freezes the header row; 0 and 0 unfreeze.',
      parameters: {
        type: 'object',
        properties: {
          rows: { type: 'integer', minimum: 0, maximum: 10 },
          columns: { type: 'integer', minimum: 0, maximum: 10 },
          ...tab,
        },
        additionalProperties: false,
      },
    },
    {
      name: 'sheet_add_tab',
      description: `Add a tab to the workbook under a name and show it: ${SHEET_LIMITS.tabs} tabs at most.`,
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', maxLength: SHEET_LIMITS.name } },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: 'sheet_show_tab',
      description:
        'Show a tab of the workbook, by its name: the person sees it, and the tools work on it.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: 'sheet_insert_chart',
      description:
        'Draw a chart of a range, headers included, over the grid beside the data: column by default, or line, bar, pie.',
      parameters: {
        type: 'object',
        properties: {
          range: {
            type: 'string',
            description:
              'The data to chart, headers included, such as `A1:C8`.',
          },
          type: {
            type: 'string',
            enum: ['column', 'line', 'bar', 'pie'],
            description: 'The chart type; column by default.',
          },
          title: {
            type: 'string',
            description: 'The title drawn above the chart.',
          },
        },
        required: ['range'],
      },
    },
  ];
}
