/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The outputs agent's spreadsheets: a ```csv block is a workbook, read once
 * and shared by every grid that shows it; the chat draws it through its
 * `ChatCodeBlock` point; the Cells agent tools act on the last one, so the
 * chart an agent inserts reaches the message's read-only mirror; and the
 * outputs example hands its agent the `cells` bundle.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  agentToolBundle,
  buildReactorFromPlugins,
  type ReactorPlatform,
} from '@datalayer/reactor';
import type { CellsModel } from '@datalayer/cells';
import { ChatCodeBlock } from '../../chat/messages/codeBlocks';
import { LoopChatExtras } from '../core';
import {
  AgentOutputsSheetsPlugin,
  AgentOutputsSheetToolsPlugin,
  latestSheetModel,
  parseSheetBlock,
  resetSheets,
  sheetModel,
  useReadOnlyMirror,
} from '../plugins/agent-outputs/sheets';
import { AGENT_OUTPUTS_LOOP_PLUGINS } from '../../examples/utils/agentOutputsPlugins';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SALES = [
  '# filename: sales.csv',
  'Month,North,South,Online',
  'Jan,10,7,4',
  'Feb,12,9,6',
  'Mar,15,11,5',
  '',
].join('\n');

beforeEach(() => resetSheets());

describe('parseSheetBlock', () => {
  it('reads a csv block, its file name from the first line', () => {
    expect(parseSheetBlock('csv', SALES)).toEqual({
      name: 'sales.csv',
      extension: 'csv',
      source: 'Month,North,South,Online\nJan,10,7,4\nFeb,12,9,6\nMar,15,11,5',
    });
  });

  it('takes a tsv, a named file in another fence, and refuses the rest', () => {
    expect(parseSheetBlock('tsv', 'a\tb\n1\t2')?.extension).toBe('tsv');
    expect(parseSheetBlock('text', '# filename: x.tsv\na\tb')).toMatchObject({
      name: 'x.tsv',
      extension: 'tsv',
    });
    expect(parseSheetBlock('python', 'print(1)')).toBeNull();
    expect(parseSheetBlock('csv', '# filename: empty.csv\n')).toBeNull();
  });
});

const run = (
  reactor: ReactorPlatform,
  id: string,
  argument?: Record<string, unknown>,
) =>
  reactor.executeCommand<Record<string, unknown> | undefined, any>(
    id,
    argument,
  );

describe('the workbooks and the tools on the last one', () => {
  it('reads a block once, and the last block met is the latest', async () => {
    const first = parseSheetBlock('csv', SALES)!;
    const a = await sheetModel(first);
    expect(await sheetModel({ ...first })).toBe(a);
    expect(latestSheetModel()).toBe(a);
    const b = await sheetModel(parseSheetBlock('csv', 'x,y\n1,2')!);
    expect(latestSheetModel()).toBe(b);
    // Met again, an older block does not take the latest back.
    await sheetModel(first);
    expect(latestSheetModel()).toBe(b);
  });

  it('insert a chart into the latest workbook, which its read-only mirror follows', async () => {
    const model = await sheetModel(parseSheetBlock('csv', SALES)!);
    const reactor = buildReactorFromPlugins([AgentOutputsSheetToolsPlugin]);
    reactor.start();
    expect(agentToolBundle(reactor, 'cells')?.toolset).toContain(
      'cells_insert_chart',
    );

    let mirror: CellsModel | null = null;
    function Probe({ of }: { of: CellsModel }) {
      mirror = useReadOnlyMirror(of);
      return null;
    }
    const root: Root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Probe of={model} />));
    expect(mirror!.readOnly).toBe(true);

    const used = await run(reactor, 'cells.agent.readRange');
    expect(used.range).toBe('A1:D4');
    const out = await run(reactor, 'cells.agent.insertChart', {
      range: used.range,
      type: 'column',
      title: 'Sales by region',
      at: 'A6',
    });
    const sheet = model.selection.sheet;
    expect(model.sheet(sheet).charts.get(out.chartId)?.title).toBe(
      'Sales by region',
    );
    expect(mirror!.sheet(sheet).charts.get(out.chartId)?.title).toBe(
      'Sales by region',
    );
    act(() => root.unmount());
  });
});

describe('the chat renderer and the example', () => {
  it('contributes the csv renderer to the chat', () => {
    const reactor = buildReactorFromPlugins([AgentOutputsSheetsPlugin]);
    reactor.start();
    const [renderer] = reactor.getContributions(ChatCodeBlock);
    expect(renderer.value.languages).toContain('csv');
    expect(renderer.value.match?.({ language: 'csv', code: SALES })).toBe(true);
  });

  it('the outputs example hands its agent the cells tools and draws spreadsheets in the chat', () => {
    const reactor = buildReactorFromPlugins(AGENT_OUTPUTS_LOOP_PLUGINS);
    reactor.start();
    expect(agentToolBundle(reactor, 'cells')?.toolset).toEqual([
      'cells_read_range',
      'cells_write_range',
      'cells_insert_chart',
      'cells_list_charts',
      'cells_select_range',
    ]);
    const handed = reactor
      .getContributions(LoopChatExtras)
      .flatMap(entry => entry.value.extras.value.agentToolBundles ?? []);
    expect(handed).toContain('cells');
    expect(
      reactor.getContributions(ChatCodeBlock).map(c => c.value.id),
    ).toEqual(['cells-sheet']);
  });
});

afterEach(() => resetSheets());
