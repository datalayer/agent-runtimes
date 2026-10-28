/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The outputs agent's spreadsheets, drawn with Datalayer Cells — in the
 * chat message itself, and wherever else the page shows them.
 *
 * A ```csv block in an answer (its first line `# filename: <name>.csv`) is
 * a workbook: one model per block, read once and kept here, so the grid in
 * the message and the one in a side panel are the same workbook. The message
 * draws it read-only (a mirror that follows it), 240 px high, with a download
 * button. {@link AgentOutputsSheetsPlugin} contributes that renderer to the
 * chat's `ChatCodeBlock` point; {@link AgentOutputsSheetToolsPlugin} hands
 * the Cells plugin's agent tools (the `cells` bundle) the last spreadsheet
 * answered, so an agent asked to chart it inserts the chart into that
 * workbook — and it appears on both grids.
 *
 * Kept out of the plugin's index, which the apps barrel re-exports: only a
 * page that wants spreadsheets loads Cells.
 *
 * @module apps/plugins/agent-outputs/sheets
 */

import { useEffect, useState, type JSX } from 'react';
import { Button, Text } from '@primer/react';
import { DownloadIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { contribution, definePlugin } from '@datalayer/reactor';
import {
  CellsProvider,
  createCellsModel,
  Spreadsheet,
  type CellsModel,
} from '@datalayer/cells';
import { CellsChartsPlugin } from '@datalayer/cells/charts';
import { importCsv } from '@datalayer/cells/csv';
import { cellsAgentToolsPlugin } from '@datalayer/cells/plugin';
import {
  ChatCodeBlock,
  type ChatCodeBlockProps,
} from '../../../chat/messages/codeBlocks';

/** The fence languages a spreadsheet is written in. */
export const SHEET_LANGUAGES = ['csv', 'tsv', 'spreadsheet', 'cells'];

/** A spreadsheet block: its file name, extension, and the rows' text. */
export type SheetBlock = {
  name: string;
  extension: 'csv' | 'tsv';
  /** The CSV or TSV itself, without the `# filename:` line. */
  source: string;
};

const FILENAME = /^#\s*filename:\s*([\w.-]+)\s*(?:\n|$)/i;

/**
 * The spreadsheet a fenced block holds, by its language or by a
 * `# filename:` first line ending in .csv or .tsv; `null` for another block.
 */
export function parseSheetBlock(
  language: string,
  code: string,
): SheetBlock | null {
  const text = code.replace(/^\s*\n/, '');
  const named = FILENAME.exec(text)?.[1];
  const byName = /\.(csv|tsv)$/i.exec(named ?? '')?.[1]?.toLowerCase();
  if (!SHEET_LANGUAGES.includes(language) && byName === undefined) {
    return null;
  }
  const extension: 'csv' | 'tsv' =
    byName === 'tsv' || (byName === undefined && language === 'tsv')
      ? 'tsv'
      : 'csv';
  const source = (named ? text.replace(FILENAME, '') : text).replace(
    /\s+$/,
    '',
  );
  if (source === '') {
    return null;
  }
  return { name: named ?? `output.${extension}`, extension, source };
}

const MAX_SHEETS = 40;
const sheets = new Map<string, Promise<CellsModel>>();
const ready = new Map<string, CellsModel>();
let latestKey: string | undefined;

const keyOf = (block: SheetBlock) => `${block.name}\n${block.source}`;

/**
 * The workbook of a spreadsheet block, read once: every grid showing the
 * same block shows the same model. The block met last for the first time is
 * the latest, which is the one the agent tools act on.
 */
export function sheetModel(block: SheetBlock): Promise<CellsModel> {
  const key = keyOf(block);
  const known = sheets.get(key);
  if (known) {
    return known;
  }
  latestKey = key;
  const model = createCellsModel({ plugins: [CellsChartsPlugin] });
  const read = importCsv(model, block.source, { worker: false }).then(() => {
    ready.set(key, model);
    return model;
  });
  sheets.set(key, read);
  read.catch(() => sheets.delete(key));
  // Streaming makes a block per chunk: the oldest go, never the latest.
  for (const old of sheets.keys()) {
    if (sheets.size <= MAX_SHEETS) {
      break;
    }
    if (old !== latestKey) {
      sheets.delete(old);
      ready.delete(old);
    }
  }
  return read;
}

/** The workbook of the last spreadsheet answered, once read. */
export function latestSheetModel(): CellsModel | undefined {
  return latestKey === undefined ? undefined : ready.get(latestKey);
}

/** Forget every workbook (tests). */
export function resetSheets(): void {
  sheets.clear();
  ready.clear();
  latestKey = undefined;
}

/** A block's workbook, or the sentence why it could not be read. */
export function useSheetModel(block: SheetBlock | null): {
  model: CellsModel | null;
  error: string;
} {
  const [state, setState] = useState<{
    model: CellsModel | null;
    error: string;
  }>({ model: null, error: '' });
  const key = block ? keyOf(block) : '';
  useEffect(() => {
    if (!block) {
      return;
    }
    let cancelled = false;
    sheetModel(block)
      .then(model => !cancelled && setState({ model, error: '' }))
      .catch(
        (e: unknown) =>
          !cancelled &&
          setState({
            model: null,
            error: e instanceof Error ? e.message : String(e),
          }),
      );
    return () => {
      cancelled = true;
    };
    // The block is its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/**
 * A read-only copy of a workbook that follows it: the message's grid can
 * neither be typed into nor lose the agent's chart.
 */
export function useReadOnlyMirror(model: CellsModel | null): CellsModel | null {
  const [mirror, setMirror] = useState<CellsModel | null>(null);
  useEffect(() => {
    if (!model) {
      setMirror(null);
      return;
    }
    const copy = createCellsModel({
      readOnly: true,
      plugins: [CellsChartsPlugin],
    });
    copy.replaceData(model.toJSON(), 'remote');
    setMirror(copy);
    return model.subscribe(() => copy.replaceData(model.toJSON(), 'remote'));
  }, [model]);
  return mirror;
}

/** Save a block as its file. */
export function downloadSheet(block: SheetBlock): void {
  const type =
    block.extension === 'tsv' ? 'text/tab-separated-values' : 'text/csv';
  const url = URL.createObjectURL(
    new Blob([block.source + '\n'], { type: `${type};charset=utf-8` }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = block.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** A spreadsheet in a chat message: its grid, read-only, and a download button. */
export function SheetCodeBlock({
  language,
  code,
}: ChatCodeBlockProps): JSX.Element {
  const block = parseSheetBlock(language, code);
  const { model, error } = useSheetModel(block);
  const mirror = useReadOnlyMirror(model);
  if (!block) {
    return <></>;
  }
  return (
    <Box data-sheet-block={block.name} my={2}>
      {error ? (
        <Text sx={{ color: 'danger.fg', fontSize: 0 }}>
          Could not read the spreadsheet: {error}
        </Text>
      ) : mirror ? (
        <CellsProvider model={mirror}>
          <Box
            height={240}
            border="1px solid"
            borderColor="border.muted"
            borderRadius={2}
            overflow="hidden"
          >
            <Spreadsheet model={mirror} aria-label={block.name} />
          </Box>
        </CellsProvider>
      ) : (
        <Text sx={{ color: 'fg.muted', fontSize: 0 }}>Reading…</Text>
      )}
      <Box mt={1}>
        <Button
          size="small"
          variant="invisible"
          leadingVisual={DownloadIcon}
          onClick={() => downloadSheet(block)}
        >
          Download {block.name}
        </Button>
      </Box>
    </Box>
  );
}

export const AGENT_OUTPUTS_SHEETS_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-outputs-sheets';

/** A ```csv (or ```tsv) block of an answer, drawn as a Cells grid in the message. */
export const AgentOutputsSheetsPlugin = definePlugin({
  name: AGENT_OUTPUTS_SHEETS_PLUGIN_NAME,
  displayName: 'Agent Outputs: spreadsheets',
  description:
    'A CSV the agent writes, drawn as a Datalayer Cells grid in the chat.',
  octicon: 'table',
  emoji: '🧮',
  contributes: [
    contribution(
      ChatCodeBlock,
      {
        id: 'cells-sheet',
        languages: SHEET_LANGUAGES,
        match: block => parseSheetBlock(block.language, block.code) !== null,
        Component: SheetCodeBlock,
      },
      { id: 'cells-sheet' },
    ),
  ],
});

/**
 * The Cells agent tools (`cells_read_range`, `cells_insert_chart`, …) on the
 * last spreadsheet answered. Its bundle id is `cells`, the frontend toolset
 * the `example-output` spec names.
 */
export const AgentOutputsSheetToolsPlugin = cellsAgentToolsPlugin({
  model: latestSheetModel,
  name: '@datalayer/loop-plugin-agent-outputs-sheet-tools',
});
