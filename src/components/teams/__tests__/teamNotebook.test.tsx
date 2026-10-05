/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the peer gives besides words, kept by the team, and its notebook drawn
 * only once one arrives: the view, JupyterLab and Pyodide are loaded then and
 * not before.
 */

// @vitest-environment jsdom
import * as React from 'react';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  A2APeer,
  A2APeerArtifact,
  A2APeerEvent,
} from '../../../runtimes/browser/a2aPeer';
import { ACCOUNTING_APP_0_0_1, SALES_APP_0_0_1 } from '../../../specs/apps';

/** The view, as the lazy import loads it: its loading is what is checked. */
const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('../TeamNotebookView', () => {
  loaded.count += 1;
  return {
    default: ({ fileName }: { fileName: string }) => (
      <div data-testid="notebook-view">{fileName}</div>
    ),
  };
});

/** The tool the entry asks with, as the hook makes it: its events are what is checked. */
const told = vi.hoisted(() => ({
  onEvent: undefined as undefined | ((event: A2APeerEvent) => void),
  accept: undefined as undefined | readonly string[],
}));
vi.mock('../../../runtimes/browser/a2aPeer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../runtimes/browser/a2aPeer')>();
  return {
    ...actual,
    a2aPeerTool: (options: {
      onEvent?: (event: A2APeerEvent) => void;
      accept?: readonly string[];
    }) => {
      told.onEvent = options.onEvent;
      told.accept = options.accept;
      return { description: 'ask', inputSchema: {}, execute: async () => ({}) };
    },
  };
});
vi.mock('../../../runtimes/browser/model', () => ({
  createBrowserModel: () => ({ specificationVersion: 'v2' }),
}));

afterEach(() => cleanup());

const NOTEBOOK: A2APeerArtifact = {
  mediaType: 'application/x-ipynb+json',
  name: 'Open invoices',
  filename: 'open-invoices.ipynb',
  data: { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [] },
};
const CSV: A2APeerArtifact = {
  mediaType: 'text/csv',
  name: 'Invoices',
  data: 'number,due\n',
};

describe('what the peer gave', () => {
  it('is named on the exchange, and its latest notebook found', async () => {
    const { answeredLine, notebookAmong } = await import('../useA2ATeam');
    expect(answeredLine([])).toBe('the report');
    expect(answeredLine([NOTEBOOK])).toBe(
      'the report and a notebook, Open invoices',
    );
    expect(answeredLine([CSV, NOTEBOOK])).toBe(
      'the report and Invoices, a notebook, Open invoices',
    );
    expect(notebookAmong([CSV])).toBeNull();
    expect(notebookAmong([NOTEBOOK, CSV])).toBe(NOTEBOOK);
  });

  it('is kept by the team, its notebook until another comes', async () => {
    const { useA2ATeam, NOTEBOOK_AND_WORDS } = await import('../useA2ATeam');
    const peer = { card: { name: 'Accounting' } } as unknown as A2APeer;
    const { result } = renderHook(() =>
      useA2ATeam({
        entry: SALES_APP_0_0_1,
        peerApp: ACCOUNTING_APP_0_0_1,
        peer,
        inference: {} as never,
        accept: NOTEBOOK_AND_WORDS,
      }),
    );
    expect(told.accept).toEqual(['application/x-ipynb+json', 'text/markdown']);
    expect(result.current.notebook).toBeNull();
    act(() => {
      told.onEvent?.({ phase: 'asked', request: 'Open invoices?' });
      told.onEvent?.({
        phase: 'working',
        taskId: 't',
        note: 'Writing a notebook…',
        tool: { name: 'write_notebook', ended: false },
      });
    });
    // While it writes the notebook, its balloon says so.
    expect(result.current.peerPersona.saying).toBe('Writing a notebook…');
    act(() => {
      told.onEvent?.({
        phase: 'answered',
        taskId: 't',
        answer: 'Two invoices are open.',
        artifacts: [NOTEBOOK],
      });
    });
    expect(result.current.report).toBe('Two invoices are open.');
    expect(result.current.artifacts).toEqual([NOTEBOOK]);
    expect(result.current.notebook).toBe(NOTEBOOK);
    expect(result.current.exchange.at(-1)).toBe(
      'Accounting → Sales: the report and a notebook, Open invoices',
    );
    // An answer in words alone leaves the notebook open.
    act(() => {
      told.onEvent?.({
        phase: 'answered',
        taskId: 't2',
        answer: 'Nothing else.',
        artifacts: [],
      });
    });
    expect(result.current.artifacts).toEqual([]);
    expect(result.current.notebook).toBe(NOTEBOOK);
  });
});

describe('TeamNotebook', () => {
  it('loads the notebook view only when a notebook is drawn', async () => {
    const { TeamNotebook, notebookFileName } = await import('../TeamNotebook');
    expect(loaded.count).toBe(0);
    render(<TeamNotebook notebook={NOTEBOOK} title="Accounting's notebook" />);
    expect(
      screen.getByRole('region', { name: "Accounting's notebook" }),
    ).toBeTruthy();
    expect((await screen.findByTestId('notebook-view')).textContent).toBe(
      'open-invoices.ipynb',
    );
    expect(loaded.count).toBe(1);
    expect(notebookFileName({ ...NOTEBOOK, filename: undefined })).toBe(
      'open-invoices.ipynb',
    );
  });
});
