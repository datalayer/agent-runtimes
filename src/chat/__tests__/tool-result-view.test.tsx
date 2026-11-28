/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 *
 * BSD 3-Clause License
 */

/**
 * Every tool's answer drawn under its row, the row closed (the user, 28
 * November 2026: "the result of a tool should always be shown … make it
 * generic"): a list of records a table, one record its fields, words words.
 */
import { describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ToolCallDisplay } from '../tools/ToolCallDisplay';
import {
  RESULT_LIMITS,
  cellText,
  columnsOf,
  isEmptyResult,
  parsedResult,
  recordsOf,
} from '../tools/ToolResultView';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const INVOICES = [4, 3, 2, 1].map(id => ({
  id,
  name: `INV/2026/0000${id}`,
  partner_id: [10 + id, `Demo customer ${id}`],
  amount_total: 1000 * id + 452.5,
  amount_residual: 1000 * id + 452.5,
  state: 'posted',
  payment_state: 'not_paid',
}));

function draw(props: Record<string, unknown>): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ToolCallDisplay toolCallId="call-1" args={{}} {...(props as any)} />,
    );
  });
  return host;
}

describe('a tool’s answer, drawn', () => {
  it('draws a list of records as a table, a reference by its name, the row closed', () => {
    const host = draw({
      toolName: 'odoo_accounting_list_invoices',
      status: 'complete',
      result: INVOICES,
    });
    const table = host.querySelector('[data-tool-result-table]')!;
    expect(table).not.toBeNull();
    expect(table.textContent).toContain('INV/2026/00004');
    expect(table.textContent).toContain('Demo customer 4');
    expect(table.textContent).toContain('4,452.5');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(4);
    expect(table.querySelectorAll('th').length).toBeLessThanOrEqual(
      RESULT_LIMITS.columns,
    );
  });

  it('draws one record as its fields, and JSON given as words too', () => {
    const host = draw({
      toolName: 'set_books_header',
      status: 'complete',
      result: JSON.stringify({ set: ['unmatched', 'open_invoices'] }),
    });
    expect(
      host.querySelector('[data-tool-result-fields]')?.textContent,
    ).toContain('unmatched, open_invoices');
  });

  it('draws words as words, and nothing for an empty answer, an error or a call still running', () => {
    expect(
      draw({
        toolName: 'say',
        status: 'complete',
        result: 'Done.',
      }).querySelector('[data-tool-result]')?.textContent,
    ).toContain('Done.');
    expect(
      draw({ toolName: 'say', status: 'complete', result: [] }).querySelector(
        '[data-tool-result]',
      ),
    ).toBeNull();
    expect(
      draw({
        toolName: 'say',
        status: 'error',
        result: 'x',
        error: 'boom',
      }).querySelector('[data-tool-result]'),
    ).toBeNull();
    expect(
      draw({ toolName: 'say', status: 'inProgress' }).querySelector(
        '[data-tool-result]',
      ),
    ).toBeNull();
  });

  it('cuts what is long, saying the rest is in the row', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: i }));
    const host = draw({ toolName: 'list', status: 'complete', result: many });
    expect(
      host.querySelectorAll('[data-tool-result-table] tbody tr'),
    ).toHaveLength(RESULT_LIMITS.rows);
    expect(host.querySelector('[data-tool-result]')?.textContent).toContain(
      '4 more rows',
    );
  });

  it('reads its pieces plainly', () => {
    expect(parsedResult('{"a":1}')).toEqual({ a: 1 });
    expect(parsedResult('not json')).toBe('not json');
    expect(isEmptyResult({})).toBe(true);
    expect(cellText([11, 'Demo customer A'])).toBe('Demo customer A');
    expect(cellText(null)).toBe('—');
    expect(columnsOf([{ a: 1 }, { b: 2 }])).toEqual(['a', 'b']);
    expect(recordsOf({ items: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });
});
