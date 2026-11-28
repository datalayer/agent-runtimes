/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/**
 * What a tool answered, drawn under its row without opening it (the user, 28
 * November 2026: "the result of a tool should always be shown … make it
 * generic"). A list of records is a table, one record a table of its fields,
 * words are words; a Poppy tool's products and quotes are the product cards.
 * The JSON itself stays in the row, opened, as its details.
 *
 * @module chat/tools/ToolResultView
 */

import type { ReactElement, ReactNode } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  OrderCard,
  PRODUCT_CARDS_WORDS,
  ProductGrid,
  readProductCards,
} from '../../apps/plugins/product-cards';
import { poppyToolOf } from './poppy';

type Data = Record<string, unknown>;

/** The most rows and columns a table draws, and the longest text: the rest is in the row's details. */
export const RESULT_LIMITS = {
  rows: 8,
  columns: 6,
  fields: 10,
  text: 800,
  cell: 60,
} as const;

export const RESULT_WORDS = {
  label: 'Result',
  moreRows: (more: number) =>
    `${more} more ${more === 1 ? 'row' : 'rows'} — open the row for all of it`,
  moreFields: (more: number) =>
    `${more} more ${more === 1 ? 'field' : 'fields'} — open the row for all of it`,
  more: 'open the row for all of it',
} as const;

const isRecord = (value: unknown): value is Data =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The value itself, or the JSON a string holds. */
export function parsedResult(result: unknown): unknown {
  if (typeof result !== 'string') {
    return result;
  }
  const trimmed = result.trim();
  if (!/^[[{]/.test(trimmed)) {
    return result;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return result;
  }
}

/** Whether there is anything to draw: not nothing, not empty. */
export function isEmptyResult(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.keys(value).length === 0;
  return false;
}

/** A cell's words: a reference `[id, name]` by its name, nothing as a dash, a number as numbers read. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === false) {
    return value === false ? 'no' : '—';
  }
  if (value === true) return 'yes';
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value.toLocaleString('en-US')
      : String(value);
  }
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'string'
  ) {
    return value[1];
  }
  const text =
    typeof value === 'string'
      ? value
      : Array.isArray(value) && value.every(each => typeof each !== 'object')
        ? value.join(', ')
        : JSON.stringify(value);
  return text.length > RESULT_LIMITS.cell
    ? `${text.slice(0, RESULT_LIMITS.cell - 1)}…`
    : text;
}

/** The columns of a list of records: the keys of its first rows, in their order. */
export function columnsOf(rows: readonly Data[]): string[] {
  const keys: string[] = [];
  for (const row of rows.slice(0, 5)) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys.slice(0, RESULT_LIMITS.columns);
}

/** The records a result lists: itself, or the one list a record holds (`{items: [...]}`). */
export function recordsOf(value: unknown): Data[] | null {
  if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) {
    return value as Data[];
  }
  if (isRecord(value)) {
    const lists = Object.values(value).filter(
      each => Array.isArray(each) && each.length > 0 && each.every(isRecord),
    );
    if (lists.length === 1) {
      return lists[0] as Data[];
    }
  }
  return null;
}

const CELL = {
  px: 2,
  py: 1,
  borderBottom: '1px solid',
  borderColor: 'border.muted',
  textAlign: 'left' as const,
  verticalAlign: 'top' as const,
  whiteSpace: 'nowrap' as const,
};

function Frame({
  children,
  more,
}: {
  children: ReactNode;
  more?: string;
}): ReactElement {
  return (
    <Box
      as="section"
      aria-label={RESULT_WORDS.label}
      data-tool-result=""
      my={2}
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.default"
      maxWidth="100%"
      overflow="hidden"
    >
      <Box overflowX="auto" fontSize={0}>
        {children}
      </Box>
      {more ? (
        <Text
          as="p"
          sx={{ m: 0, px: 2, py: 1, fontSize: 0, color: 'fg.muted' }}
        >
          {more}
        </Text>
      ) : null}
    </Box>
  );
}

function RecordsTable({ rows }: { rows: readonly Data[] }): ReactElement {
  const columns = columnsOf(rows);
  const shown = rows.slice(0, RESULT_LIMITS.rows);
  const more = rows.length - shown.length;
  return (
    <Frame more={more > 0 ? RESULT_WORDS.moreRows(more) : undefined}>
      <Box
        as="table"
        width="100%"
        sx={{ borderCollapse: 'collapse' }}
        data-tool-result-table=""
      >
        <thead>
          <tr>
            {columns.map(column => (
              <Box
                as="th"
                key={column}
                {...CELL}
                color="fg.muted"
                fontWeight="semibold"
              >
                {column}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, index) => (
            <tr key={index}>
              {columns.map(column => (
                <Box as="td" key={column} {...CELL}>
                  {cellText(row[column])}
                </Box>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Frame>
  );
}

function FieldsTable({ record }: { record: Data }): ReactElement {
  const entries = Object.entries(record);
  const shown = entries.slice(0, RESULT_LIMITS.fields);
  const more = entries.length - shown.length;
  return (
    <Frame more={more > 0 ? RESULT_WORDS.moreFields(more) : undefined}>
      <Box
        as="table"
        sx={{ borderCollapse: 'collapse' }}
        data-tool-result-fields=""
      >
        <tbody>
          {shown.map(([key, value]) => (
            <tr key={key}>
              <Box as="th" {...CELL} color="fg.muted" fontWeight="semibold">
                {key}
              </Box>
              <Box as="td" {...CELL} sx={{ whiteSpace: 'normal' }}>
                {cellText(value)}
              </Box>
            </tr>
          ))}
        </tbody>
      </Box>
    </Frame>
  );
}

/** A Poppy tool's products or quote as the product cards, or null when it answered neither. */
function poppyCards(result: unknown): ReactElement | null {
  const value = parsedResult(result);
  if (!isRecord(value)) return null;
  const body = isRecord(value.body) ? value.body : value;
  const cards = readProductCards(body);
  if (cards.kind === 'products') {
    return <ProductGrid products={cards.products} count={cards.count} />;
  }
  if (cards.kind === 'quote' || cards.kind === 'test_order') {
    const test = cards.kind === 'test_order';
    return (
      <OrderCard
        title={
          test
            ? PRODUCT_CARDS_WORDS.testOrder(cards.orderId)
            : PRODUCT_CARDS_WORDS.quote
        }
        note={
          test
            ? PRODUCT_CARDS_WORDS.testOrderNote
            : PRODUCT_CARDS_WORDS.quoteNote
        }
        lines={cards.lines}
        currency={cards.currency}
        total={cards.total}
        test={test}
      />
    );
  }
  return null;
}

/** What a tool answered, drawn: null when it answered nothing. */
export function ToolResultView({
  toolName,
  result,
}: {
  toolName: string;
  result: unknown;
}): ReactElement | null {
  if (poppyToolOf(toolName)) {
    const cards = poppyCards(result);
    if (cards) return cards;
  }
  let value = parsedResult(result);
  // A Poppy tool's company answers `{status, body}`: the body is what it said.
  if (poppyToolOf(toolName) && isRecord(value) && 'body' in value) {
    value = value.body;
  }
  if (isEmptyResult(value)) {
    return null;
  }
  const records = recordsOf(value);
  if (records) {
    return <RecordsTable rows={records} />;
  }
  if (isRecord(value)) {
    return <FieldsTable record={value} />;
  }
  if (Array.isArray(value)) {
    return (
      <Frame>
        <Box px={2} py={1}>
          {cellText(value)}
        </Box>
      </Frame>
    );
  }
  const text = String(value);
  return (
    <Frame
      more={text.length > RESULT_LIMITS.text ? RESULT_WORDS.more : undefined}
    >
      <Box
        as="p"
        m={0}
        px={2}
        py={1}
        sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
      >
        {text.length > RESULT_LIMITS.text
          ? `${text.slice(0, RESULT_LIMITS.text - 1)}…`
          : text}
      </Box>
    </Frame>
  );
}

export default ToolResultView;
