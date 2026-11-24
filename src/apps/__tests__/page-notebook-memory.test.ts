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
});
