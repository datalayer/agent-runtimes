/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript as a table (SCENES S2-01), Primer's `DataTable`: time,
 * from → to, over A2A or MCP, kind, text, how long, state. Sortable by time
 * (an open call last among its ties), a failed row marked, a click on a row
 * or the button on its time selects its line.
 *
 * @module components/teams/transcript/TranscriptTable
 */

import type { JSX, MouseEvent } from 'react';
import { createContext, useContext, useId, useMemo } from 'react';
import { Label, Text } from '@primer/react';
import { DataTable, Table, type Column } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { lineHeading, timeText } from '../sceneTranscriptRules';
import { LineSelect } from './LineSelect';
import {
  compareByTime,
  durationText,
  OVER_WORDS,
  STATE_WORDS,
  transcriptRows,
  type TranscriptRow,
} from './transcriptRows';
import type { TranscriptRowsLines } from './TranscriptViewsTypes';

export type TranscriptTableProps = TranscriptRowsLines & {
  /** The selected line's key. */
  selected?: string | null;
  /** A row was clicked, or its time's button pressed: its line's key. */
  onSelect?: (key: string) => void;
  /** What is said while there is no line. */
  emptyText?: string;
  /** How tall it grows before it scrolls, in pixels. */
  maxHeight?: number;
};

/** The state, as a label: failed in red, running in the accent, done quiet. */
function StateLabel({ row }: { row: TranscriptRow }): JSX.Element {
  const variant =
    row.state === 'failed'
      ? 'danger'
      : row.state === 'open'
        ? 'accent'
        : row.exchangeFailed
          ? 'attention'
          : 'secondary';
  return (
    <Label variant={variant} size="small" data-transcript-state={row.state}>
      {row.state === 'done' && row.exchangeFailed
        ? 'exchange failed'
        : STATE_WORDS[row.state]}
    </Label>
  );
}

/** What a row's cells read of the selection: a column is fixed, the selection changes. */
const RowSelection = createContext<{
  selectable: boolean;
  selected?: string | null;
}>({ selectable: false });

/** A row's time, with what selects the row from the keyboard when it can be selected. */
function RowTime({ row }: { row: TranscriptRow }): JSX.Element {
  const { selectable, selected } = useContext(RowSelection);
  const time = (
    <Text
      as="time"
      sx={{ fontFamily: 'mono', fontSize: 0, whiteSpace: 'nowrap' }}
      dateTime={new Date(row.at).toISOString()}
    >
      {timeText(row.at)}
    </Text>
  );
  return selectable ? (
    <LineSelect
      label={`Select ${lineHeading(row)} at ${timeText(row.at)}`}
      selected={selected === row.id}
    >
      {time}
    </LineSelect>
  ) : (
    time
  );
}

const COLUMNS: Column<TranscriptRow>[] = [
  {
    id: 'at',
    header: 'Time',
    field: 'at',
    sortBy: compareByTime,
    width: 'auto',
    renderCell: row => <RowTime row={row} />,
  },
  {
    id: 'who',
    header: 'From → To',
    field: 'from',
    width: 'auto',
    renderCell: row => (
      <Text sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {row.to ? `${row.from} → ${row.to}` : row.from}
      </Text>
    ),
  },
  {
    id: 'over',
    header: 'Over',
    field: 'over',
    width: 'auto',
    renderCell: row => (
      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
        {row.over ? OVER_WORDS[row.over] : '—'}
      </Text>
    ),
  },
  {
    id: 'kind',
    header: 'Kind',
    field: 'kind',
    width: 'auto',
    renderCell: row => <Text sx={{ fontSize: 0 }}>{row.kind}</Text>,
  },
  {
    id: 'text',
    header: 'Text',
    field: 'text',
    width: 'grow',
    renderCell: row => (
      <Box
        as="span"
        data-transcript-row={row.id}
        sx={{
          display: 'block',
          fontFamily: row.kind === 'called' ? 'mono' : undefined,
          color: row.state === 'failed' ? 'danger.fg' : undefined,
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
        }}
      >
        {row.text}
        {row.state === 'open' ? '…' : ''}
      </Box>
    ),
  },
  {
    id: 'duration',
    header: 'Duration',
    field: 'durationMs',
    align: 'end',
    width: 'auto',
    renderCell: row => (
      <Text sx={{ fontFamily: 'mono', fontSize: 0, whiteSpace: 'nowrap' }}>
        {durationText(row.durationMs)}
      </Text>
    ),
  },
  {
    id: 'state',
    header: 'State',
    field: 'state',
    width: 'auto',
    renderCell: row => <StateLabel row={row} />,
  },
];

/** The transcript as a table, with a click on a row or its button selecting its line. */
export function TranscriptTable({
  lines,
  selected,
  onSelect,
  emptyText = 'What the scene says and does shows here, row by row.',
  maxHeight,
}: TranscriptTableProps): JSX.Element {
  const title = useId();
  const rows = useMemo(() => transcriptRows(lines), [lines]);
  const selection = useMemo(
    () => ({ selectable: Boolean(onSelect), selected }),
    [onSelect, selected],
  );
  // A click anywhere on a row: the row's line, found from the text cell's mark.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!onSelect) {
      return;
    }
    const target = event.target as HTMLElement | null;
    const tr = target?.closest('tr');
    const marked = tr?.querySelector<HTMLElement>('[data-transcript-row]');
    const key = marked?.dataset.transcriptRow;
    if (key) {
      onSelect(key);
    }
  };
  if (rows.length === 0) {
    return (
      <Text
        as="p"
        sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}
        data-transcript-table=""
      >
        {emptyText}
      </Text>
    );
  }
  return (
    <Box
      data-transcript-table=""
      data-transcript-rows={rows.length}
      onClick={onClick}
      sx={{
        ...(maxHeight ? { maxHeight, overflow: 'auto' } : {}),
        '& tr': { cursor: onSelect ? 'pointer' : undefined },
        ...(selected
          ? {
              [`& tr:has([data-transcript-row="${CSS.escape(selected)}"])`]: {
                backgroundColor: 'accent.subtle',
              },
            }
          : {}),
      }}
    >
      <Table.Container>
        <Table.Title as="h3" id={title}>
          Transcript
        </Table.Title>
        <RowSelection.Provider value={selection}>
          <DataTable
            aria-labelledby={title}
            data={rows}
            columns={COLUMNS}
            cellPadding="condensed"
            initialSortColumn="at"
            initialSortDirection="ASC"
          />
        </RowSelection.Provider>
      </Table.Container>
    </Box>
  );
}

export default TranscriptTable;
