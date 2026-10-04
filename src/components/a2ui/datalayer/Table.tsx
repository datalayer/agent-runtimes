/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Table (LOOP C-18): the rows an application publishes, under the columns
 * the builder chose, a page at a time. A selectable table lets a person
 * choose a row — by pointer, or by Tab and Enter or Space — which is written
 * where its `selected` binding points, and then its action is dispatched,
 * so the action's context reads the row just chosen.
 *
 * @module components/a2ui/datalayer/Table
 */

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Button, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { BlockFrame, Problem, Quiet, asWords, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type TableProps = OwnCommon & {
  title?: string;
  columns: string[];
  page_size?: number;
  selectable?: boolean;
  rows?: unknown;
  selected?: unknown;
  setSelected: (row: unknown) => void;
};

/** The default the catalog gives `page_size`. */
const PAGE_SIZE = 20;

const sameRow = (a: unknown, b: unknown) =>
  a !== undefined && JSON.stringify(a) === JSON.stringify(b);

/** The rows a table can draw, or why it cannot. */
export function tableRows(
  rows: unknown,
): { rows: Record<string, unknown>[] } | { problem: string } {
  if (rows === undefined || rows === null) {
    return { rows: [] };
  }
  if (!Array.isArray(rows)) {
    return { problem: 'What it shows is not a list of rows.' };
  }
  const bad = rows.findIndex(row => !isRecord(row));
  if (bad >= 0) {
    return {
      problem: `Row ${bad + 1} is not a record of the columns' values.`,
    };
  }
  return { rows: rows as Record<string, unknown>[] };
}

export function TableView({ props }: { props: TableProps }) {
  const {
    title,
    columns,
    selectable = false,
    selected,
    setSelected,
    action,
  } = props;
  const pageSize = props.page_size ?? PAGE_SIZE;
  const read = useMemo(() => tableRows(props.rows), [props.rows]);
  const all = 'rows' in read ? read.rows : [];
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const [page, setPage] = useState(0);
  // Fewer rows than before: the page shown is one that still exists.
  useEffect(() => {
    if (page >= pages) {
      setPage(pages - 1);
    }
  }, [page, pages]);
  const shown = all.slice(page * pageSize, (page + 1) * pageSize);

  // The row chosen here, shown as chosen whether or not `selected` is bound;
  // what the application publishes at `selected` wins when it is.
  const [chosen, setChosen] = useState<unknown>(undefined);
  const current =
    selected !== undefined && selected !== null ? selected : chosen;
  const choose = (row: Record<string, unknown>) => {
    setChosen(row);
    setSelected(row);
    action?.();
  };
  const onKey = (event: KeyboardEvent, row: Record<string, unknown>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(row);
    }
  };

  return (
    <BlockFrame
      title={title}
      label="Table"
      weight={props.weight}
      testId="a2ui-table"
    >
      {'problem' in read ? (
        <Problem>{read.problem}</Problem>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Box
            as="table"
            role={selectable ? 'grid' : undefined}
            aria-label={title || 'Table'}
            sx={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 1,
              '& th, & td': {
                textAlign: 'left',
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'border.muted',
              },
              '& th': { color: 'fg.muted', fontWeight: 'semibold' },
            }}
          >
            <thead>
              <tr>
                {columns.map(column => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, index) => {
                const isSelected = selectable && sameRow(current, row);
                return (
                  <Box
                    as="tr"
                    key={page * pageSize + index}
                    {...(selectable
                      ? {
                          tabIndex: 0,
                          'aria-selected': isSelected,
                          onClick: () => choose(row),
                          onKeyDown: (event: KeyboardEvent) =>
                            onKey(event, row),
                        }
                      : null)}
                    sx={{
                      cursor: selectable ? 'pointer' : undefined,
                      bg: isSelected ? 'accent.subtle' : undefined,
                      '&:hover': selectable
                        ? { bg: isSelected ? 'accent.subtle' : 'canvas.subtle' }
                        : undefined,
                      '&:focus-visible': {
                        outline: '2px solid',
                        outlineColor: 'accent.fg',
                        outlineOffset: '-2px',
                      },
                    }}
                  >
                    {columns.map(column => (
                      <td key={column}>{asWords(row[column])}</td>
                    ))}
                  </Box>
                );
              })}
            </tbody>
          </Box>
          {all.length === 0 ? <Quiet>No rows yet.</Quiet> : null}
        </Box>
      )}
      {pages > 1 ? (
        <Box
          as="nav"
          aria-label="Pages"
          sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <Button
            size="small"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }} aria-live="polite">
            Page {page + 1} of {pages}
          </Text>
          <Button
            size="small"
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </Box>
      ) : null}
    </BlockFrame>
  );
}

export const Table = ownImplementation<TableProps>('Table', TableView);
