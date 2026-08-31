/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The notebook a workspace opens on, and the kernel behind it.
 *
 * The opening cell is drawn as already executed — execution count `1`, its
 * frame printed underneath — because every opener the Data Analyst offers
 * refers to *this notebook*, and against a blank document those are questions
 * with no answer.
 *
 * That display is a claim about the kernel, and the claim has to be true. If
 * the cell says `sales` was built and the kernel has never heard of it, the
 * first thing the agent does raises `NameError` in front of a visitor who has
 * been on the page for ten seconds. So the same source the cell shows is run
 * on the sandbox as soon as there is one, and these tests pin the two halves
 * to the same string.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPENING_SOURCE,
  openingCode,
  openingNotebook,
} from '../plugins/notebook/openingNotebook';

const VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'notebook', 'NotebookView.tsx'),
  'utf8',
);

describe('the opening notebook', () => {
  it('opens on a cell that has already run', () => {
    const [cell] = openingNotebook().cells;
    expect(cell.cell_type).toBe('code');
    expect(cell.execution_count).toBe(1);
    expect(cell.outputs).toHaveLength(1);
  });

  it('shows a result, not an empty output', () => {
    const [cell] = openingNotebook().cells;
    const [output] = cell.outputs as { data: { 'text/plain': string[] } }[];
    // The frame pandas actually prints, taken from a real run. A fabricated
    // output in a product demonstration is a lie told to somebody deciding
    // whether to trust the product.
    expect(output.data['text/plain'].join('')).toContain('region quarter');
    expect(output.data['text/plain'].join('')).toContain('182400');
  });

  it('is a fresh document every time', () => {
    // `EphemeralNotebook` keeps the object it is handed and edits it in place,
    // so two workspaces sharing one literal would share one notebook.
    expect(openingNotebook()).not.toBe(openingNotebook());
    expect(openingNotebook().cells).not.toBe(openingNotebook().cells);
  });

  it('carries an anomaly worth asking about', () => {
    // "Find anomalies in this notebook" is one of the four openers. It needs
    // somewhere to land: South Q2 sits an order of magnitude below its
    // neighbours.
    const code = openingCode();
    expect(code).toContain('18900');
    expect(code).toContain('182400');
  });
});

describe('priming the sandbox', () => {
  it('runs exactly what the cell displays', () => {
    // One string, two uses. Two copies would drift, and the drift would show
    // as a notebook whose visible code does not match the kernel's state.
    const [cell] = openingNotebook().cells;
    expect(cell.source).toBe(OPENING_SOURCE);
    expect(openingCode()).toBe(OPENING_SOURCE.join(''));
    expect(openingCode()).toContain('sales = pd.DataFrame(');
  });

  it('runs it through the sandbox, once per kernel', () => {
    expect(VIEW).toContain('service.execute(openingCode())');
    // Keyed on the kernel: a target switch is a new kernel and must be primed
    // again, while a re-render must not run it a second time.
    expect(VIEW).toContain('primed.current === kernelId');
    expect(VIEW).toContain('snapshot.kernelId');
  });

  it('waits for the sandbox to be running', () => {
    expect(VIEW).toContain("snapshot.state !== 'running'");
  });

  it('survives a sandbox that will not run it', () => {
    // The notebook still shows what it showed; what is lost is the variable,
    // and the agent says so plainly the first time it looks.
    expect(VIEW).toContain('could not prime the opening cell');
  });
});
