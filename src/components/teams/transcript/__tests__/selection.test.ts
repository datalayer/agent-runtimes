/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The selection the views and the stage share (SCENES S3-02): a line is
 * on the graph's edge between its members — an answer on the ask's edge,
 * a call on the caller's edge to the connection — or on none; and the
 * latest line on an edge is what a click on the edge selects.
 */

import { describe, expect, it } from 'vitest';
import {
  latestLineOnEdge,
  selectedEdgeOf,
  selectionOfLine,
} from '../selection';
import { MEMBERS, OPEN_AND_FAILED, SCRIPTED, recorded } from './fixture';

describe('the selection on the stage', () => {
  it('finds the edge of an ask, of its answer, and of a call', () => {
    const { lines } = recorded(SCRIPTED);
    const edges = lines.map(line =>
      selectedEdgeOf(selectionOfLine(line), MEMBERS),
    );
    expect(edges.map(edge => edge && [edge.id, edge.over, edge.key])).toEqual([
      undefined, // The person asks: on no edge.
      ['sales->accounting', 'a2a', 's3:asked'],
      ['accounting->accounting/odoo-accounting', 'mcp', 's4:called'],
      ['sales->accounting', 'a2a', 's3:said'], // The answer, back along the ask's edge.
      undefined, // Said to all.
    ]);
  });

  it('selects the latest line on an edge, either way round', () => {
    const { lines } = recorded(SCRIPTED);
    expect(
      latestLineOnEdge({ from: 'sales', to: 'accounting' }, lines, MEMBERS)
        ?.key,
    ).toBe('s3:said');
    expect(
      latestLineOnEdge({ from: 'accounting', to: 'sales' }, lines, MEMBERS)
        ?.key,
    ).toBe('s3:said');
    expect(
      latestLineOnEdge(
        { from: 'accounting', to: 'accounting/odoo-accounting' },
        lines,
        MEMBERS,
      )?.key,
    ).toBe('s4:called');
    expect(
      latestLineOnEdge({ from: 'sales', to: 'nobody' }, lines, MEMBERS),
    ).toBeUndefined();
  });

  it('carries whether the line failed', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    expect(selectionOfLine(lines[3])).toEqual({
      key: 'f2:said',
      from: 'Accounting',
      to: 'Sales',
      kind: 'said',
      at: lines[3].at,
      failed: true,
    });
  });
});
