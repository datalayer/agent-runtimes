/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What is already in the notebook when the workspace opens.
 *
 * A cell with a result in it, rather than an empty one.
 *
 * The empty cell was honest and useless. A visitor arriving at a page whose
 * argument is "an agent works in a real notebook" met a blank editor and an
 * agent with nothing to talk about — so the first thing they had to do, before
 * seeing anything, was think of a task. Worse, every opener the agent offers
 * refers to *this notebook*: "analyze this dataset", "find anomalies in this
 * notebook". Against an empty document those are questions with no answer.
 *
 * So the notebook opens on a small analysis that has already run. The reader
 * sees code, a table of numbers under it, and an agent beside it that can be
 * asked about them — which is the entire product in one screen, with nothing
 * required of them first.
 *
 * Three things it has to be, and they pull against each other:
 *
 * - **Real.** The output is what this code actually prints. Nobody is going to
 *   check, and that is exactly why it matters: a fabricated output in a
 *   product demonstration is a lie told to somebody deciding whether to trust
 *   the product.
 * - **Small.** It is read in the corner of a landing page, at whatever height
 *   is left after the chrome. One cell, six rows out.
 * - **Worth asking about.** The frame is deliberately unfinished — regional
 *   revenue with an obvious gap in it — so that "find the anomalies" and "plot
 *   revenue by region" have somewhere to land.
 *
 * The execution count is `1` and the outputs are populated, so the notebook
 * reads as a session somebody already started. It is not connected to the
 * kernel that will run the next cell; the moment anyone runs anything, real
 * output replaces this.
 *
 * @module loop/plugins/notebook/openingNotebook
 */

import type { INotebookContent } from '@jupyterlab/nbformat';

/**
 * The frame the opening cell builds, rendered as pandas prints it.
 *
 * Written out rather than computed, and taken from a real run rather than
 * typed: the column alignment is pandas' own, and eyeballing it produces
 * something that looks approximately right and is wrong in every column. A
 * fabricated output in a product demonstration is a lie told to somebody
 * deciding whether to trust the product.
 */
const FRAME_REPR = `  region quarter  revenue
0  North      Q1   182400
1  North      Q2   196750
2  South      Q1   141200
3  South      Q2    18900
4   West      Q1   203100
5   West      Q2   211480`;

/**
 * The code of the opening cell, as nbformat wants it: one string per line.
 *
 * Exported because two things need it and they must not drift. The notebook
 * below shows it as a cell that has already run — execution count `1`, output
 * present — and the workspace runs the same text on the sandbox as soon as one
 * is ready, so that the claim the cell makes is true of the kernel behind it.
 *
 * Without the second half the notebook is a picture of a session rather than
 * one: `sales` is on screen and undefined, and the first thing the agent does
 * with it raises `NameError` in front of the visitor.
 */
export const OPENING_SOURCE = [
  'import pandas as pd\n',
  '\n',
  '# Quarterly revenue by region.\n',
  'sales = pd.DataFrame(\n',
  '    {\n',
  '        "region": ["North", "North", "South", "South", "West", "West"],\n',
  '        "quarter": ["Q1", "Q2", "Q1", "Q2", "Q1", "Q2"],\n',
  '        "revenue": [182400, 196750, 141200, 18900, 203100, 211480],\n',
  '    }\n',
  ')\n',
  '\n',
  'sales',
];

/** The same code as one string, for a sandbox that takes source rather than cells. */
export function openingCode(): string {
  return OPENING_SOURCE.join('');
}

/**
 * The notebook a LOOP workspace opens on.
 *
 * Exported as a factory rather than a constant: `EphemeralNotebook` keeps the
 * object it is first given and edits it in place, so two workspaces sharing one
 * literal would share one document.
 */
export function openingNotebook(): INotebookContent {
  return {
    cells: [
      {
        cell_type: 'code',
        id: 'opening-analysis',
        metadata: {},
        execution_count: 1,
        source: OPENING_SOURCE,
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 1,
            data: { 'text/plain': [FRAME_REPR] },
            metadata: {},
          },
        ],
      },
    ],
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: { name: 'python' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export default openingNotebook;
