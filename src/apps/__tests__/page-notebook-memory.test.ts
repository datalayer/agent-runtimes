/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The conversation's notebook lives in memory (the user, 24 November 2026:
 * "create a notebook and document fails"): its cells are written and read
 * with no panel shown, through the adapter methods jupyter-react's store
 * calls one for one; a live notebook, once mounted, takes them.
 */

import { describe, expect, it, vi } from 'vitest';

const notebooks = new Map<string, { adapter: unknown }>();
vi.mock('@datalayer/jupyter-react', () => ({
  notebookStore: {
    getState: () => ({
      notebooks,
      update: ({ id, state }: { id: string; state: { adapter: unknown } }) =>
        notebooks.set(id, { adapter: state.adapter }),
    }),
    subscribe: () => () => undefined,
  },
}));

const { PAGE_NOTEBOOK_ID, pageNotebook } =
  await import('../plugins/page-notebook/memoryNotebook');

/** A live notebook as jupyter-react's adapter answers, its shared cells included. */
function liveNotebook() {
  const shared: Array<{
    cell_type: string;
    outputs: unknown[];
    execution_count: number | null;
    setOutputs(outputs: unknown[]): void;
  }> = [];
  const cell = (type: string) => ({
    cell_type: type,
    outputs: [] as unknown[],
    execution_count: null as number | null,
    setOutputs(outputs: unknown[]) {
      this.outputs = outputs;
    },
  });
  const live = {
    cells: [] as Array<{ type: string; source: string }>,
    setDefaultCellType: vi.fn(),
    insertCell(type: string, index = live.cells.length, source = '') {
      live.cells.splice(index, 0, { type, source });
      shared.splice(index, 0, cell(type));
    },
    insertCells(
      cells: Array<{ type: string; source: string }>,
      index = live.cells.length,
    ) {
      live.cells.splice(index, 0, ...cells);
      shared.splice(index, 0, ...cells.map(each => cell(each.type)));
    },
    deleteCell(indices: number[]) {
      [...indices]
        .sort((a, b) => b - a)
        .forEach(i => {
          live.cells.splice(i, 1);
          shared.splice(i, 1);
        });
    },
    updateCell: vi.fn(),
    readAllCells() {
      return live.cells.map((c, i) => ({
        ...c,
        outputs: shared[i].outputs,
        execution_count: shared[i].execution_count,
      }));
    },
    getCell: vi.fn(),
    runCell: vi.fn(),
    runAllCells: vi.fn(),
    clearAllOutputs: vi.fn(),
    executeCode: vi.fn(),
    model: { sharedModel: { cells: shared } },
  };
  return { live, shared };
}

describe('the page notebook, in memory', () => {
  it('is registered as the store’s adapter for page-notebook, once', () => {
    const memory = pageNotebook();
    expect(notebooks.get(PAGE_NOTEBOOK_ID)?.adapter).toBe(memory);
    expect(pageNotebook()).toBe(memory);
  });

  it('takes cells, updates and deletes them, and reads them back', () => {
    const memory = pageNotebook();
    memory.insertCell('markdown', 0, '# Orders');
    memory.insertCell('code', undefined, 'df.describe()');
    expect(memory.readAllCells('brief').map(c => [c.type, c.preview])).toEqual([
      ['markdown', '# Orders'],
      ['code', 'df.describe()'],
    ]);
    expect(memory.updateCell(1, 'df.head()')).toContain('+df.head()');
    memory.deleteCell([0]);
    expect(memory.readAllCells('detailed').map(c => c.source)).toEqual([
      'df.head()',
    ]);
    expect(memory.getCell(0)).toMatchObject({
      type: 'code',
      source: 'df.head()',
    });
    expect(() => memory.updateCell(5, 'x')).toThrow('out of range');
  });

  it('hands its cells to the live notebook once mounted, and applies later changes there too', () => {
    const memory = pageNotebook();
    const live = {
      cells: [{ type: 'code', source: 'old' }] as Array<{
        type: string;
        source: string;
      }>,
      setDefaultCellType: vi.fn(),
      insertCell(type: string, index = this.cells.length, source = '') {
        this.cells.splice(index, 0, { type, source });
      },
      insertCells(
        cells: Array<{ type: string; source: string }>,
        index = this.cells.length,
      ) {
        this.cells.splice(index, 0, ...cells);
      },
      deleteCell(indices: number[]) {
        [...indices]
          .sort((a, b) => b - a)
          .forEach(i => this.cells.splice(i, 1));
      },
      updateCell(index: number, source: string) {
        this.cells[index].source = source;
        return '';
      },
      readAllCells() {
        return this.cells.map(c => ({ ...c }));
      },
      getCell: vi.fn(),
      runCell: vi.fn(),
      runAllCells: vi.fn(),
      clearAllOutputs: vi.fn(),
      executeCode: vi.fn(),
      model: null,
    };
    notebooks.set('page-notebook-view', { adapter: live });
    const stop = memory.attach(live as never);
    expect(live.cells.map(c => c.source)).toEqual(['df.head()']);
    memory.insertCell('code', undefined, 'df.plot()');
    expect(live.cells.map(c => c.source)).toEqual(['df.head()', 'df.plot()']);
    stop();
    notebooks.delete('page-notebook-view');
  });

  it('renders a markdown cell without waiting for a kernel', async () => {
    const memory = pageNotebook();
    memory.insertCell('markdown', 0, '## Notes');
    await expect(memory.runCell({ index: 0 })).resolves.toEqual({
      execution_count: null,
      outputs: [],
    });
    memory.deleteCell([0]);
  });

  it('runs a cell on the live notebook and keeps its outputs', async () => {
    const memory = pageNotebook();
    const live = {
      runCell: vi.fn(async () => ({ execution_count: 1, outputs: ['5'] })),
      getCell: vi.fn(() => ({
        type: 'code',
        source: 'df.head()',
        execution_count: 1,
        outputs: [{ text: '5' }],
      })),
      readAllCells: () => [],
      insertCells: vi.fn(),
      deleteCell: vi.fn(),
      model: null,
    };
    notebooks.set('page-notebook-view', { adapter: live });
    await expect(memory.runCell({ index: 0 })).resolves.toEqual({
      execution_count: 1,
      outputs: ['5'],
    });
    expect(memory.getCell(0)).toMatchObject({
      execution_count: 1,
      outputs: [{ text: '5' }],
    });
    notebooks.delete('page-notebook-view');
  });

  it('gives a notebook shown again its cells’ outputs and execution counts', () => {
    const memory = pageNotebook('tabs');
    memory.insertCell('markdown', 0, '# Orders');
    memory.insertCell('code', 1, 'df.shape');
    memory.cells[1].outputs = [
      { output_type: 'execute_result', data: { 'text/plain': '(3, 2)' } },
    ];
    memory.cells[1].execution_count = 4;
    // The tab hidden, then shown again: a new live notebook mounts.
    const { live, shared } = liveNotebook();
    const stop = memory.attach(live as never);
    expect(live.cells.map(c => c.source)).toEqual(['# Orders', 'df.shape']);
    expect(shared[1].outputs).toEqual(memory.cells[1].outputs);
    expect(shared[1].execution_count).toBe(4);
    expect(shared[0].execution_count).toBeNull();
    stop();
  });
});

describe('the page notebook, per conversation', () => {
  it('is one per conversation, under its own ids, and the page’s outside a workspace', () => {
    const first = pageNotebook('surface-1:thread-a');
    const second = pageNotebook('surface-1:thread-b');
    const embed = pageNotebook('surface-2:thread-a');
    expect(new Set([first, second, embed, pageNotebook()]).size).toBe(4);
    expect(pageNotebook('surface-1:thread-a')).toBe(first);
    expect(notebooks.get('page-notebook:surface-1:thread-a')?.adapter).toBe(
      first,
    );
    expect(first.viewId).toBe('page-notebook-view:surface-1:thread-a');
    expect(pageNotebook().viewId).toBe('page-notebook-view');
    first.insertCell('code', 0, 'a = 1');
    expect(second.getCellCount()).toBe(0);
    expect(embed.getCellCount()).toBe(0);
  });

  it('applies its changes to its own panel’s notebook only', () => {
    const first = pageNotebook('surface-1:thread-c');
    const second = pageNotebook('surface-1:thread-d');
    const { live } = liveNotebook();
    notebooks.set(second.viewId, { adapter: live });
    first.insertCell('code', 0, 'mine = 1');
    expect(live.cells).toEqual([]);
    second.insertCell('code', 0, 'yours = 2');
    expect(live.cells.map(c => c.source)).toEqual(['yours = 2']);
    notebooks.delete(second.viewId);
  });
});
