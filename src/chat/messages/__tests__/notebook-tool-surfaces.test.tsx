/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The transcript's copy of what a notebook tool did.
 *
 * The rendering itself is a read-only `Cell` and needs a browser to look at;
 * what is pinned here is the part that decides *what* to render: which tools
 * count, and how an `executeCodeInNotebook` result's loosely-typed outputs become
 * nbformat the output area can draw.
 */

import { describe, expect, it } from 'vitest';
import { encode } from '@toon-format/toon';
import {
  CELL_TOOLS,
  EXECUTE_TOOLS,
  decodedResult,
  executionOutputs,
  touchedCellIndex,
} from '../NotebookToolSurfaces';
import type { ToolCallRenderContext } from '../../../types/chat';

function contextWith(result: unknown): ToolCallRenderContext {
  return {
    toolCallId: 't1',
    toolName: 'executeCodeInNotebook',
    name: 'executeCodeInNotebook',
    args: {},
    result,
    status: 'complete',
  } as ToolCallRenderContext;
}

describe('which tools get a cell in the transcript', () => {
  it('covers the cell tools under both their spellings', () => {
    // The adapter registers the reference name; the definitions carry the
    // prefixed one. Either may reach the transcript.
    for (const name of ['insertCell', 'updateCell', 'runCell']) {
      expect(CELL_TOOLS.has(name)).toBe(true);
      expect(CELL_TOOLS.has(`datalayer_${name}`)).toBe(true);
    }
    expect(EXECUTE_TOOLS.has('executeCodeInNotebook')).toBe(true);
    expect(EXECUTE_TOOLS.has('executeCodeInDocument')).toBe(true);
    expect(EXECUTE_TOOLS.has('executeCode')).toBe(false);
  });
});

describe('which cell a call touched', () => {
  it('reads the index out of a TOON result string', () => {
    // What the agent actually receives: the operation results are serialised
    // for the model, not for the UI — an insert with no index argument says
    // where it landed only in the result, and TOON round-trips.
    const context = contextWith(
      encode({ success: true, index: 4, message: 'Cell inserted' }),
    );
    expect(touchedCellIndex(context)).toBe(4);
  });

  it('prefers the index the call itself named', () => {
    const context = {
      ...contextWith(encode({ success: true, index: 9 })),
      args: { index: 2 },
    };
    expect(touchedCellIndex(context)).toBe(2);
  });

  it('answers nothing when neither side names one', () => {
    expect(
      touchedCellIndex(contextWith(encode({ success: true }))),
    ).toBeUndefined();
    expect(touchedCellIndex(contextWith(undefined))).toBeUndefined();
  });

  it('yields nothing from a result that is not TOON at all', () => {
    expect(decodedResult(contextWith('the sandbox went away'))).toBeUndefined();
  });
});

describe('executeCodeInNotebook outputs, as nbformat', () => {
  it('passes a real nbformat output through untouched', () => {
    const output = {
      output_type: 'execute_result',
      data: { 'text/plain': '42' },
      metadata: {},
    };
    const [first] = executionOutputs(
      contextWith({ outputs: [{ type: 'execute_result', content: output }] }),
    );
    expect(first).toEqual(output);
  });

  it('wraps a mime-bundle-shaped content with its reported type', () => {
    const [first] = executionOutputs(
      contextWith({
        outputs: [
          { type: 'display_data', content: { data: { 'image/png': 'abc' } } },
        ],
      }),
    );
    expect(first).toMatchObject({
      output_type: 'display_data',
      data: { 'image/png': 'abc' },
    });
  });

  it('prints a plain value the way a kernel would', () => {
    const [first] = executionOutputs(
      contextWith({ outputs: [{ type: 'stream', content: 'hello' }] }),
    );
    expect(first).toMatchObject({
      output_type: 'stream',
      name: 'stdout',
      text: 'hello',
    });
  });

  it('recovers outputs from the TOON string the agent was given', () => {
    // The whole round trip: what the operation produced, serialised for the
    // model, decoded back for the transcript.
    const [first] = executionOutputs(
      contextWith(
        encode({
          success: true,
          outputs: [{ type: 'stream', content: 'Step 1\nDone' }],
        }),
      ),
    );
    expect(first).toMatchObject({
      output_type: 'stream',
      text: 'Step 1\nDone',
    });
  });

  it('renders nothing from a result with no outputs', () => {
    expect(executionOutputs(contextWith({}))).toEqual([]);
    expect(executionOutputs(contextWith(undefined))).toEqual([]);
  });
});
