/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's notebook, in memory (the user, 24 November 2026: "the
 * notebook and document tools ... should be able to manipulate in memory
 * documents"). jupyter-react's notebook tools act on the adapter registered
 * in its store; that adapter was the side panel's live notebook, and a panel
 * not shown (or waiting for a runtime) left the tools with no notebook.
 *
 * Here the notebook is a list of cells held in memory, registered under
 * `page-notebook` with the methods the store calls on an adapter. Its cell
 * operations need no panel. When the panel's live notebook is mounted
 * (`page-notebook-view`), every operation is applied to it as well, and the
 * person's edits there come back. Running code needs a kernel: a run opens
 * the panel (the call shows it), waits for its notebook, runs there and
 * keeps the outputs.
 *
 * @module apps/plugins/page-notebook/memoryNotebook
 */

import { notebookStore } from '@datalayer/jupyter-react';
import { untilTrue } from '../../pageTools/untilMounted';

export const PAGE_NOTEBOOK_ID = 'page-notebook';
export const PAGE_NOTEBOOK_VIEW_ID = 'page-notebook-view';

/** How long a run waits for the panel's notebook and its kernel. */
export const KERNEL_WAIT_MS = 30_000;

type CellType = 'code' | 'markdown' | 'raw';

export type MemoryCell = {
  type: CellType;
  source: string;
  outputs: unknown[];
  execution_count: number | null;
};

/** What the live notebook adapter answers, as far as this one uses it. */
type LiveAdapter = {
  setDefaultCellType(type: CellType): void;
  insertCell(type: CellType, index?: number, source?: string): void;
  insertCells(
    cells: Array<{ type: CellType; source: string }>,
    index?: number,
  ): void;
  deleteCell(indices: number[]): void;
  updateCell(index: number, source: string): string;
  getCell(
    index?: number,
    includeOutputs?: boolean,
  ):
    | {
        type: CellType;
        source: string;
        execution_count?: number | null;
        outputs?: unknown[];
      }
    | undefined;
  readAllCells(format?: 'brief' | 'detailed'): Array<{
    type: string;
    source?: string;
    execution_count?: number | null;
    outputs?: unknown[];
  }>;
  runCell(params?: {
    index?: number;
    timeoutSeconds?: number;
  }): Promise<{ execution_count?: number | null; outputs?: string[] }>;
  runAllCells(): void;
  clearAllOutputs(): void;
  executeCode(code: string, options?: { timeout?: number }): Promise<unknown>;
  model?: {
    sharedModel?: {
      changed?: {
        connect(fn: () => void): void;
        disconnect(fn: () => void): void;
      };
    };
  } | null;
};

const liveAdapter = (): LiveAdapter | undefined =>
  notebookStore.getState().notebooks.get(PAGE_NOTEBOOK_VIEW_ID)
    ?.adapter as unknown as LiveAdapter | undefined;

/** A unified diff of a cell's source, as the live adapter returns one. */
function patchOf(index: number, before: string, after: string): string {
  if (before === after) {
    return '';
  }
  const lines = (text: string, sign: string) =>
    text === '' ? [] : text.split('\n').map(line => `${sign}${line}`);
  return [
    `--- cell_${index}\tbefore`,
    `+++ cell_${index}\tafter`,
    ...lines(before, '-'),
    ...lines(after, '+'),
  ].join('\n');
}

export class MemoryNotebookAdapter {
  cells: MemoryCell[] = [];
  private _defaultCellType: CellType = 'code';
  /** Set while this adapter applies its own change to the live notebook. */
  private _applying = false;

  /** What the store's `commands.execute` reaches: nothing to do in memory. */
  readonly commands = { execute: async () => undefined };

  get defaultCellType(): CellType {
    return this._defaultCellType;
  }

  setDefaultCellType(type: CellType): void {
    this._defaultCellType = type;
    liveAdapter()?.setDefaultCellType(type);
  }

  private live(apply: (live: LiveAdapter) => void): void {
    const live = liveAdapter();
    if (!live) {
      return;
    }
    this._applying = true;
    try {
      apply(live);
    } finally {
      this._applying = false;
    }
  }

  private clampIndex(index: number | undefined): number {
    return index === undefined || index < 0 || index > this.cells.length
      ? this.cells.length
      : index;
  }

  insertCell(type?: CellType, index?: number, source?: string): void {
    const at = this.clampIndex(index);
    const cellType = type ?? this._defaultCellType;
    this.cells.splice(at, 0, {
      type: cellType,
      source: source ?? '',
      outputs: [],
      execution_count: null,
    });
    this.live(live => live.insertCell(cellType, at, source));
  }

  insertCells(
    cells: Array<{ type: CellType; source: string }>,
    index?: number,
  ): void {
    const at = this.clampIndex(index);
    this.cells.splice(
      at,
      0,
      ...cells.map(cell => ({
        type: cell.type,
        source: cell.source ?? '',
        outputs: [],
        execution_count: null,
      })),
    );
    this.live(live => live.insertCells(cells, at));
  }

  insertAbove(source?: string): void {
    this.insertCell(
      this._defaultCellType,
      Math.max(0, this.cells.length - 1),
      source,
    );
  }

  insertBelow(source?: string): void {
    this.insertCell(this._defaultCellType, this.cells.length, source);
  }

  deleteCell(indices: number[]): void {
    const valid = [...new Set(indices)]
      .filter(i => i >= 0 && i < this.cells.length)
      .sort((a, b) => b - a);
    for (const index of valid) {
      this.cells.splice(index, 1);
    }
    this.live(live => live.deleteCell(indices));
  }

  deleteCells(): void {
    this.deleteCell(this.cells.length ? [this.cells.length - 1] : []);
  }

  updateCell(index: number, source: string): string {
    const cell = this.cells[index];
    if (!cell) {
      throw new Error(
        `Cell index ${index} is out of range. Notebook has ${this.cells.length} cells.`,
      );
    }
    const before = cell.source;
    cell.source = source;
    this.live(live => live.updateCell(index, source));
    return patchOf(index, before, source);
  }

  changeCellType(type: CellType): void {
    const last = this.cells[this.cells.length - 1];
    if (last) {
      last.type = type;
    }
  }

  getCells(): MemoryCell[] {
    return this.cells.map(cell => ({ ...cell }));
  }

  getCellCount(): number {
    return this.cells.length;
  }

  getCell(
    index?: number,
    includeOutputs = true,
  ):
    | {
        type: CellType;
        source: string;
        execution_count?: number | null;
        outputs?: unknown[];
      }
    | undefined {
    const cell = this.cells[index ?? this.cells.length - 1];
    if (!cell) {
      return undefined;
    }
    return {
      type: cell.type,
      source: cell.source,
      execution_count: cell.type === 'code' ? cell.execution_count : null,
      outputs: includeOutputs ? cell.outputs : undefined,
    };
  }

  readAllCells(format: 'brief' | 'detailed' = 'brief'): Array<{
    index: number;
    type: string;
    preview?: string;
    source?: string;
    execution_count?: number | null;
    outputs?: unknown[];
  }> {
    return this.cells.map((cell, index) =>
      format === 'brief'
        ? { index, type: cell.type, preview: cell.source.substring(0, 40) }
        : {
            index,
            type: cell.type,
            source: cell.source,
            execution_count: cell.type === 'code' ? cell.execution_count : null,
            outputs: cell.outputs,
          },
    );
  }

  clearAllOutputs(): void {
    for (const cell of this.cells) {
      cell.outputs = [];
      cell.execution_count = null;
    }
    this.live(live => live.clearAllOutputs());
  }

  /** The panel's live notebook, opened and given this notebook's cells. */
  private async kernelSide(): Promise<LiveAdapter> {
    // The call that runs already asked for the panel (its tools show it).
    if (!liveAdapter()) {
      await untilTrue(
        () => Boolean(liveAdapter()),
        KERNEL_WAIT_MS,
        'Running code needs the notebook’s kernel: the Notebook tab did not open with a kernel in time.',
      );
    }
    return liveAdapter() as LiveAdapter;
  }

  /** Copy a cell's outputs back from the live notebook. */
  private keep(index: number, live: LiveAdapter): void {
    const ran = live.getCell(index, true);
    const cell = this.cells[index];
    if (ran && cell) {
      cell.outputs = ran.outputs ?? [];
      cell.execution_count = ran.execution_count ?? null;
    }
  }

  async runCell(params?: {
    index?: number;
    timeoutSeconds?: number;
  }): Promise<{ execution_count?: number | null; outputs?: string[] }> {
    const index = params?.index ?? this.cells.length - 1;
    // jupyter-react's insert runs every new cell; a markdown or raw cell's
    // run is its rendering, nothing to wait a kernel for.
    if (this.cells[index] && this.cells[index].type !== 'code') {
      const live = liveAdapter();
      if (live) {
        await live.runCell({ ...params, index });
      }
      return { execution_count: null, outputs: [] };
    }
    const live = await this.kernelSide();
    const result = await live.runCell({ ...params, index });
    this.keep(index, live);
    return result;
  }

  async runAllCells(): Promise<void> {
    const live = await this.kernelSide();
    live.runAllCells();
  }

  async executeCode(
    code: string,
    options?: { timeout?: number },
  ): Promise<unknown> {
    const live = await this.kernelSide();
    return live.executeCode(code, options);
  }

  undo(): void {}
  redo(): void {}
  assignKernel(): void {}
  dispose(): void {}

  /**
   * The live notebook mounted: it takes this notebook's cells, and the
   * person's edits there come back here. Returns how to stop.
   */
  attach(live: LiveAdapter): () => void {
    this._applying = true;
    try {
      const count = live.readAllCells('brief').length;
      if (count) {
        live.deleteCell([...Array(count).keys()]);
      }
      if (this.cells.length) {
        live.insertCells(
          this.cells.map(({ type, source }) => ({ type, source })),
          0,
        );
      }
    } finally {
      this._applying = false;
    }
    const changed = () => {
      if (this._applying) {
        return;
      }
      this.cells = live.readAllCells('detailed').map(cell => ({
        type: (cell.type as CellType) ?? 'code',
        source: cell.source ?? '',
        outputs: cell.outputs ?? [],
        execution_count: cell.execution_count ?? null,
      }));
    };
    const signal = live.model?.sharedModel?.changed;
    signal?.connect(changed);
    return () => signal?.disconnect(changed);
  }
}

let memory: MemoryNotebookAdapter | undefined;

/** The in-memory notebook, registered once in jupyter-react's store. */
export function pageNotebook(): MemoryNotebookAdapter {
  if (!memory) {
    memory = new MemoryNotebookAdapter();
    notebookStore.getState().update({
      id: PAGE_NOTEBOOK_ID,
      state: { adapter: memory as never },
    });
  }
  return memory;
}
